import {default as React, useEffect, useRef} from "react";
import * as d3 from "d3";
import {Axis, ScaleBand, ScaleLinear, Selection, ZoomTransform} from "d3";
import {BarMagnifier, barMagnifierWith, LensTransformation} from "./barMagnifier";
import {TimeRange, TimeRangeType} from "./timeRange";
import {adjustedDimensions, Margin} from "./margins";
import {Datum, emptySeries, PixelDatum, Series} from "./datumSeries";
import {defaultTooltipStyle, TooltipStyle} from "./TooltipStyle";
import {Observable, Subscription} from "rxjs";
import {ChartData} from "../examples/randomData";
import {windowTime} from "rxjs/operators";

const defaultMargin = {top: 30, right: 20, bottom: 30, left: 50};
const defaultSpikesStyle = {
    margin: 2,
    color: '#008aad',
    // color: '#c95d15',
    lineWidth: 2,
    highlightColor: '#d2933f',
    highlightWidth: 4
};
const defaultAxesStyle = {color: '#d2933f'};
const defaultAxesLabelFont = {
    size: 12,
    color: '#d2933f',
    weight: 300,
    family: 'sans-serif'
};
const defaultPlotGridLines = {visible: true, color: 'rgba(210,147,63,0.30)'};

/**
 * Properties for rendering the line-magnifier lens
 */
interface LineMagnifierStyle {
    visible: boolean;
    width: number;
    magnification: number;
    color: string,
    lineWidth: number,
}

const defaultLineMagnifierStyle: LineMagnifierStyle = {
    visible: false,
    width: 75,
    magnification: 1,
    color: '#d2933f',
    lineWidth: 2,
};

interface TrackerStyle {
    visible: boolean;
    timeWindow: number;
    magnification: number;
    color: string,
    lineWidth: number,
}

const defaultTrackerStyle: TrackerStyle = {
    visible: false,
    timeWindow: 50,
    magnification: 1,
    color: '#d2933f',
    lineWidth: 2,
};

interface MagnifiedDatum extends Datum {
    lens: LensTransformation
}

interface Axes {
    xAxisGenerator: Axis<number | { valueOf(): number }>;
    yAxisGenerator: Axis<string>;
    xAxisSelection: AxisElementSelection;
    yAxisSelection: AxisElementSelection;
    xScale: ScaleLinear<number, number>;
    yScale: ScaleBand<string>;
    lineHeight: number;
}

// the axis-element type return when calling the ".call(axis)" function
type AxisElementSelection = Selection<SVGGElement, unknown, null, undefined>;
type SvgSelection = Selection<SVGSVGElement, any, null, undefined>;
type MagnifierSelection = Selection<SVGRectElement, Datum, null, undefined>;
type TrackerSelection = Selection<SVGLineElement, Datum, null, undefined>;
type TextSelection = Selection<SVGTextElement, any, HTMLElement, any>;

const textWidthOf = (elem: TextSelection) => elem.node()?.getBBox()?.width || 0;

interface Props {
    width: number;
    height: number;
    margin?: Partial<Margin>;
    spikesStyle?: Partial<{ margin: number, color: string, lineWidth: number, highlightColor: string, highlightWidth: number }>;
    axisLabelFont?: Partial<{ size: number, color: string, family: string, weight: number }>;
    axisStyle?: Partial<{ color: string }>;
    backgroundColor?: string;
    plotGridLines?: Partial<{ visible: boolean, color: string }>;
    tooltip?: Partial<TooltipStyle>;
    magnifier?: Partial<LineMagnifierStyle>;
    tracker?: Partial<TrackerStyle>;

    // data to plot: min-time is the earliest time for which to plot the data; max-time is the latest
    // and series list is a list of time-series to plot
    minTime: number;
    maxTime: number;
    timeWindow: number;
    seriesList: Array<Series>;

    // regex filter used to select which series are displayed
    filter?: RegExp;

    seriesObservable: Observable<ChartData>;
    windowingTime?: number;
    onSubscribe?: (subscription: Subscription) => void;
    onUpdateData?: (seriesName: string, t: number, y: number) => void;
    onUpdateTime?: (time: number) => void;
}

/**
 * Renders a raster chart
 * @param {Props} props The properties from the parent
 * @return {JSX.Element} The raster chart
 * @constructor
 */
function RasterChart(props: Props): JSX.Element {
    const {
        seriesList,
        seriesObservable,
        windowingTime = 100,
        onSubscribe = (_: Subscription) => {},
        onUpdateData = () => {},
        onUpdateTime = (_: number) => {},
        filter = /./,
        minTime, maxTime, timeWindow,
        width,
        height,
        // seriesHeight,
        backgroundColor = '#202020',
    } = props;


    // override the defaults with the parent's properties, leaving any unset values as the default value
    const margin = {...defaultMargin, ...props.margin};
    const spikesStyle = {...defaultSpikesStyle, ...props.spikesStyle};
    const axisStyle = {...defaultAxesStyle, ...props.axisStyle};
    const axisLabelFont = {...defaultAxesLabelFont, ...props.axisLabelFont};
    const plotGridLines = {...defaultPlotGridLines, ...props.plotGridLines};
    const tooltip: TooltipStyle = {...defaultTooltipStyle, ...props.tooltip};
    const magnifier = {...defaultLineMagnifierStyle, ...props.magnifier};
    const tracker = {...defaultTrackerStyle, ...props.tracker};

    // grab the dimensions of the actual plot after removing the margins from the specified width and height
    const plotDimensions = adjustedDimensions(width, height, margin);

    // the container that holds the d3 svg element
    const containerRef = useRef<SVGSVGElement>(null);
    const mainGRef = useRef<Selection<SVGGElement, any, null, undefined>>();
    const spikesRef = useRef<Selection<SVGGElement, Series, SVGGElement, any>>();
    const magnifierRef = useRef<Selection<SVGRectElement, Datum, null, undefined>>();
    const trackerRef = useRef<Selection<SVGLineElement, Datum, null, undefined>>();

    const mouseCoordsRef = useRef<number>(0);
    const zoomFactorRef = useRef<number>(1);

    // reference to the axes for the plot
    const axesRef = useRef<Axes>();

    // unlike the magnifier, the handler forms a closure on the tooltip properties, and so if they change in this
    // component, the closed properties are unchanged. using a ref allows the properties to which the reference
    // points to change.
    const tooltipRef = useRef(tooltip);

    // calculates to the time-range based on the (min, max)-time from the props
    const timeRangeRef = useRef<TimeRangeType>(TimeRange(minTime, maxTime));

    const seriesFilterRef = useRef<RegExp>(filter);

    const liveDataRef = useRef<Array<Series>>(seriesList);
    const seriesRef = useRef<Array<Series>>(seriesList);
    const currentTimeRef = useRef<number>(0);

    /**
     * Initializes the axes
     * @param {SvgSelection} svg The main svg element
     * @return {Axes} The axes generators, selections, scales, and spike line height
     */
    function initializeAxes(svg: SvgSelection): Axes {
        // calculate the mapping between the times in the data (domain) and the display
        // location on the screen (range)
        // const maxTime = calcMaxTime(seriesList);
        const xScale = d3.scaleLinear()
            .domain([timeRangeRef.current.start, timeRangeRef.current.end])
            .range([0, plotDimensions.width]);

        const lineHeight = (plotDimensions.height - margin.top) / liveDataRef.current.length;
        const yScale = d3.scaleBand()
            .domain(liveDataRef.current.map(series => series.name))
            .range([0, lineHeight * liveDataRef.current.length]);

        // create and add the axes
        const xAxisGenerator = d3.axisBottom(xScale);
        const yAxisGenerator = d3.axisLeft(yScale);
        const xAxisSelection = svg
            .append<SVGGElement>('g')
            .attr('class', 'x-axis')
            // .attr('transform', `translate(${margin.left}, ${plotDimensions.height})`)
            .attr('transform', `translate(${margin.left}, ${lineHeight * liveDataRef.current.length + margin.top})`)
            .call(xAxisGenerator);

        const yAxisSelection = svg
            .append<SVGGElement>('g')
            .attr('class', 'y-axis')
            .attr('transform', `translate(${margin.left}, ${margin.top})`)
            .call(yAxisGenerator);

        svg
            .append<SVGTextElement>('text')
            .attr('id', 'raster-chart-x-axis-label')
            .attr('text-anchor', 'middle')
            .attr('font-size', axisLabelFont.size)
            .attr('fill', axisLabelFont.color)
            .attr('font-family', axisLabelFont.family)
            .attr('font-weight', axisLabelFont.weight)
            .attr('transform', `translate(${margin.left + plotDimensions.width / 2}, ${plotDimensions.height + margin.top + (margin.bottom / 3)})`)
            .text("t (ms)");

        // create the clipping region so that the lines are clipped at the y-axis
        svg
            .append("defs")
            .append("clipPath")
            .attr("id", "clip-spikes")
            .append("rect")
            .attr("width", plotDimensions.width)
            .attr("height", plotDimensions.height - margin.top)
        ;

        return {
            xAxisGenerator, yAxisGenerator,
            xAxisSelection, yAxisSelection,
            xScale, yScale,
            lineHeight
        }
    }

    /**
     * Called when the user uses the scroll wheel (or scroll gesture) to zoom in or out. Zooms in/out
     * at the location of the mouse when the scroll wheel or gesture was applied.
     * @param {ZoomTransform} transform The d3 zoom transformation information
     * @param {number} x The x-position of the mouse when the scroll wheel or gesture is used
     * @callback
        */
    function onZoom(transform: ZoomTransform, x: number): void {
        const time = axesRef.current!.xAxisGenerator.scale<ScaleLinear<number, number>>().invert(x);
        timeRangeRef.current = timeRangeRef.current!.scale(transform.k, time);
        zoomFactorRef.current = transform.k;
        updatePlot(timeRangeRef.current);
    }

    /**
     * Adjusts the time-range and updates the plot when the plot is dragged to the left or right
     * @param {number} deltaX The amount that the plot is dragged
     * @callback
        */
    function onPan(deltaX: number): void {
        const scale = axesRef.current!.xAxisGenerator.scale<ScaleLinear<number, number>>();
        const currentTime = timeRangeRef!.current.start;
        const x = scale(currentTime);
        const deltaTime = scale.invert(x + deltaX) - currentTime;
        timeRangeRef.current = timeRangeRef.current!.translate(-deltaTime);
        updatePlot(timeRangeRef.current);
    }

    /**
     * Renders a tooltip showing the neuron, spike time, and the spike strength when the mouse hovers over a spike.
     * @param {Datum} datum The spike datum (t ms, s mV)
     * @param {string} seriesName The name of the series (i.e. the neuron ID)
     * @param {SVGLineElement} spike The SVG line element representing the spike, over which the mouse is hovering.
     */
    function handleShowTooltip(datum: Datum, seriesName: string, spike: SVGLineElement): void {
        if (!tooltipRef.current.visible) {
            return;
        }

        // Use D3 to select element, change color and size
        d3.select<SVGLineElement, Datum>(spike)
            .attr('stroke', spikesStyle.highlightColor)
            .attr('stroke-width', spikesStyle.highlightWidth)
            .attr('stroke-linecap', "round")
        ;

        if (tooltipRef.current.visible) {
            // create the rounded rectangle for the tooltip's background
            const rect = d3.select<SVGSVGElement | null, any>(containerRef.current)
                .append<SVGRectElement>('rect')
                .attr('id', `r${datum.time}-${seriesName}`)
                .attr('class', 'tooltip')
                .attr('rx', tooltipRef.current.borderRadius)
                .attr('fill', tooltipRef.current.backgroundColor)
                .attr('fill-opacity', tooltipRef.current.backgroundOpacity)
                .attr('stroke', tooltipRef.current.borderColor)
                .attr('stroke-width', tooltipRef.current.borderWidth)
            ;

            // display the neuron ID in the tooltip
            const header = d3.select<SVGSVGElement | null, any>(containerRef.current)
                .append<SVGTextElement>("text")
                .attr('id', `tn${datum.time}-${seriesName}`)
                .attr('class', 'tooltip')
                .attr('fill', tooltipRef.current.fontColor)
                .attr('font-family', 'sans-serif')
                .attr('font-size', tooltipRef.current.fontSize)
                .attr('font-weight', tooltipRef.current.fontWeight)
                .text(() => seriesName)
            ;

            // display the time (ms) and spike strength (mV) in the tooltip
            const text = d3.select<SVGSVGElement | null, any>(containerRef.current)
                .append<SVGTextElement>("text")
                .attr('id', `t${datum.time}-${seriesName}`)
                .attr('class', 'tooltip')
                .attr('fill', tooltipRef.current.fontColor)
                .attr('font-family', 'sans-serif')
                .attr('font-size', tooltipRef.current.fontSize + 2)
                .attr('font-weight', tooltipRef.current.fontWeight + 150)
                .text(() => `${d3.format(",.0f")(datum.time)} ms, ${d3.format(",.2f")(datum.value)} mV`)
            ;

            // calculate the max width and height of the text
            const tooltipWidth = Math.max(header.node()?.getBBox()?.width || 0, text.node()?.getBBox()?.width || 0);
            const headerTextHeight = header.node()?.getBBox()?.height || 0;
            const idHeight = text.node()?.getBBox()?.height || 0;
            const textHeight = headerTextHeight + idHeight;

            // set the header text location
            header
                .attr('x', () => tooltipX(datum.time, tooltipWidth) + tooltipRef.current.paddingLeft)
                .attr('y', () => tooltipY(seriesName, textHeight) - idHeight + textHeight + tooltipRef.current.paddingTop)
            ;

            // set the tooltip text (i.e. neuron ID) location
            text
                .attr('x', () => tooltipX(datum.time, tooltipWidth) + tooltipRef.current.paddingLeft)
                .attr('y', () => tooltipY(seriesName, textHeight) + textHeight + tooltipRef.current.paddingTop)
            ;

            // set the position, width, and height of the tooltip rect based on the text height and width and the padding
            rect.attr('x', () => tooltipX(datum.time, tooltipWidth))
                .attr('y', () => tooltipY(seriesName, textHeight))
                .attr('width', tooltipWidth + tooltipRef.current.paddingLeft + tooltipRef.current.paddingRight)
                .attr('height', textHeight + tooltipRef.current.paddingTop + tooltipRef.current.paddingBottom)
            ;

        }
    }

    /**
     * Calculates the x-coordinate of the lower left-hand side of the tooltip rectangle (obviously without
     * "rounded corners"). Adjusts the x-coordinate so that tooltip is visible on the edges of the plot.
     * @param {number} time The spike time
     * @param {number} textWidth The width of the tooltip text
     * @return {number} The x-coordinate of the lower left-hand side of the tooltip rectangle
     */
    function tooltipX(time: number, textWidth: number): number {
        return Math
            .min(
                Math.max(
                    axesRef.current!.xAxisGenerator.scale<ScaleLinear<number, number>>()(time),
                    textWidth / 2
                ),
                plotDimensions.width - textWidth / 2
            ) + margin.left - textWidth / 2 - tooltip.paddingLeft;
    }

    /**
     * Calculates the y-coordinate of the lower-left-hand corner of the tooltip rectangle. Adjusts the y-coordinate
     * so that the tooltip is visible on the upper edge of the plot
     * @param {string} seriesName The name of the series
     * @param {number} textHeight The height of the header and neuron ID text
     * @return {number} The y-coordinate of the lower-left-hand corner of the tooltip rectangle
     */
    function tooltipY(seriesName: string, textHeight: number): number {
        const scale = axesRef.current!.yAxisGenerator.scale<ScaleBand<string>>();
        const y = (scale(seriesName) || 0) + margin.top - tooltip.paddingBottom - textHeight - tooltip.paddingTop;
        return y > 0 ? y : y + tooltip.paddingBottom + textHeight + tooltip.paddingTop + spikeLineHeight();
    }

    /**
     * @return {number} The height of the spikes line
     */
    function spikeLineHeight(): number {
        return plotDimensions.height / liveDataRef.current.length;
    }

    /**
     * Removes the tooltip when the mouse has moved away from the spike
     * @param {Datum} datum The spike datum (t ms, s mV)
     * @param {string} seriesName The name of the series (i.e. the neuron ID)
     * @param {SVGLineElement} spike The SVG line element representing the spike, over which the mouse is hovering.
     */
    function handleHideTooltip(datum: Datum, seriesName: string, spike: SVGLineElement) {
        // Use D3 to select element, change color and size
        d3.select<SVGLineElement, Datum>(spike)
            .attr('stroke', spikesStyle.color)
            .attr('stroke-width', spikesStyle.lineWidth);

        if (tooltipRef.current.visible) {
            d3.selectAll<SVGLineElement, Datum>('.tooltip').remove();
        }
    }

    /**
     * Called when the magnifier is enabled to set up the vertical bar magnifier lens
     * @param {Selection<SVGRectElement, Datum, null, undefined> | undefined} path The path selection
     * holding the magnifier whose properties need to be updated.
     * @callback
        */
    function handleShowMagnify(path: Selection<SVGRectElement, Datum, null, undefined> | undefined) {

        /**
         * Determines whether specified datum is in the time interval centered around the current
         * mouse position
         * @param {Datum} datum The datum
         * @param {number} x The x-coordinate of the current mouse position
         * @param {number} xInterval The pixel interval for which transformations are applied
         * @return {boolean} `true` if the datum is in the interval; `false` otherwise
         */
        function inMagnifier(datum: Datum, x: number, xInterval: number): boolean {
            const scale = axesRef.current!.xAxisGenerator.scale<ScaleLinear<number, number>>();
            const datumX = scale(datum.time) + margin.left;
            return datumX > x - xInterval && datumX < x + xInterval;
        }

        /**
         * Converts the datum into the x-coordinate corresponding to its time
         * @param {Datum} datum The datum
         * @return {number} The x-coordinate corresponding to its time
         */
        function xFrom(datum: Datum): number {
            const scale = axesRef.current!.xAxisGenerator.scale<ScaleLinear<number, number>>();
            return scale(datum.time);
        }

        if (containerRef.current && path) {
            const [x, y] = d3.mouse(containerRef.current);
            const isMouseInPlot = mouseInPlotArea(x, y);
            const deltaX = magnifier.width / 2;
            path
                .attr('x', x - deltaX)
                .attr('width', 2 * deltaX)
                .attr('opacity', () => isMouseInPlot ? 1 : 0)
            ;

            const svg = d3.select<SVGSVGElement, MagnifiedDatum>(containerRef.current);

            if (isMouseInPlot && Math.abs(x - mouseCoordsRef.current) >= 1) {
                const barMagnifier: BarMagnifier = barMagnifierWith(deltaX, 3 * zoomFactorRef.current, x - margin.left);
                svg
                    // select all the spikes and keep only those that are within ±4∆t of the x-position of the mouse
                    .selectAll<SVGSVGElement, MagnifiedDatum>('.spikes-lines')
                    .filter(datum => inMagnifier(datum, x, 4 * deltaX))
                    // supplement the datum with lens transformation information (new x and scale)
                    .each(datum => {
                        datum.lens = barMagnifier.magnify(xFrom(datum))
                    })
                    // update each spikes line with it's new x-coordinate and the magnified line-width
                    .attr('x1', datum => datum.lens.xPrime)
                    .attr('x2', datum => datum.lens.xPrime)
                    .attr('stroke-width', datum => spikesStyle.lineWidth * Math.min(2, Math.max(datum.lens.magnification, 1)))
                    .attr('shape-rendering', 'crispEdges')
                ;
                mouseCoordsRef.current = x;
            } else if (!isMouseInPlot) {
                svg
                    .selectAll<SVGSVGElement, Datum>('.spikes-lines')
                    .attr('x1', datum => xFrom(datum))
                    .attr('x2', datum => xFrom(datum))
                    .attr('stroke-width', spikesStyle.lineWidth)
                ;

                path
                    .attr('x', margin.left)
                    .attr('width', 0)
                ;
                mouseCoordsRef.current = 0;
            }
        }
    }

    /**
     * Callback when the mouse tracker is to be shown
     * @param {Selection<SVGLineElement, Datum, null, undefined> | undefined} path
     * @callback
        */
    function handleShowTracker(path: Selection<SVGLineElement, Datum, null, undefined> | undefined) {
        if (containerRef.current && path) {
            const [x, y] = d3.mouse(containerRef.current);
            path
                .attr('x1', x)
                .attr('x2', x)
                .attr('opacity', () => mouseInPlotArea(x, y) ? 1 : 0)
            ;

            const label = d3.select<SVGTextElement, any>('#raster-chart-tracker-time')
                .attr('opacity', () => mouseInPlotArea(x, y) ? 1 : 0)
                .text(() => `${d3.format(",.0f")(axesRef.current!.xScale.invert(x - margin.left))} ms`)

            const labelWidth = textWidthOf(label);
            label.attr('x', Math.min(plotDimensions.width + margin.left - labelWidth, x))
        }
    }

    /**
     * Calculates whether the mouse is in the plot-area
     * @param {number} x The x-coordinate of the mouse's position
     * @param {number} y The y-coordinate of the mouse's position
     * @return {boolean} `true` if the mouse is in the plot area; `false` if the mouse is not in the plot area
     */
    function mouseInPlotArea(x: number, y: number): boolean {
        return x > margin.left && x < width - margin.right &&
            y > margin.top && y < height - margin.bottom;
    }

    /**
     * Creates the SVG elements for displaying a bar magnifier lens on the data
     * @param {SvgSelection} svg The SVG selection
     * @param {boolean} visible `true` if the lens is visible; `false` otherwise
     * @return {MagnifierSelection | undefined} The magnifier selection if visible; otherwise undefined
     */
    function magnifierLens(svg: SvgSelection, visible: boolean): MagnifierSelection | undefined {
        if (visible && magnifierRef.current === undefined) {
            const linearGradient = svg
                .append<SVGDefsElement>('defs')
                .append<SVGLinearGradientElement>('linearGradient')
                .attr('id', 'magnifier-gradient')
                .attr('x1', '0%')
                .attr('x2', '100%')
                .attr('y1', '0%')
                .attr('y2', '0%')
            ;

            const borderColor = d3.rgb(tooltip.backgroundColor).brighter(3.5).hex();
            linearGradient
                .append<SVGStopElement>('stop')
                .attr('offset', '0%')
                .attr('stop-color', borderColor)
            ;

            linearGradient
                .append<SVGStopElement>('stop')
                .attr('offset', '30%')
                .attr('stop-color', tooltip.backgroundColor)
                .attr('stop-opacity', 0)
            ;

            linearGradient
                .append<SVGStopElement>('stop')
                .attr('offset', '70%')
                .attr('stop-color', tooltip.backgroundColor)
                .attr('stop-opacity', 0)
            ;

            linearGradient
                .append<SVGStopElement>('stop')
                .attr('offset', '100%')
                .attr('stop-color', borderColor)
            ;

            const magnifierSelection = svg
                .append<SVGRectElement>('rect')
                .attr('class', 'magnifier')
                .attr('y', margin.top)
                .attr('height', plotDimensions.height - margin.top)
                .style('fill', 'url(#magnifier-gradient')
            ;

            svg.on('mousemove', () => handleShowMagnify(magnifierRef.current));

            return magnifierSelection;
        }
        // if the magnifier was defined, and is now no longer defined (i.e. props changed, then remove the magnifier)
        else if (!visible && magnifierRef.current) {
            svg.on('mousemove', () => null);
            return undefined;
        } else if (visible && magnifierRef.current) {
            svg.on('mousemove', () => handleShowMagnify(magnifierRef.current));
        }
        return magnifierRef.current;
    }

    /**
     * Creates the SVG elements for displaying a tracker line
     * @param {SvgSelection} svg The SVG selection
     * @param {boolean} visible `true` if the tracker is visible; `false` otherwise
     * @return {TrackerSelection | undefined} The tracker selection if visible; otherwise undefined
     */
    function trackerControl(svg: SvgSelection, visible: boolean): TrackerSelection | undefined {
        if (visible && trackerRef.current === undefined) {
            const tracker = svg
                .append<SVGLineElement>('line')
                .attr('class', 'tracker')
                .attr('y1', margin.top)
                .attr('y2', plotDimensions.height)
                .attr('stroke', tooltip.borderColor)
                .attr('stroke-width', tooltip.borderWidth)
                .attr('opacity', 0)
            ;

            // create the text element holding the tracker time
            svg
                .append<SVGTextElement>('text')
                .attr('id', 'raster-chart-tracker-time')
                .attr('y', Math.max(0, margin.top -3))
                .attr('fill', axisLabelFont.color)
                .attr('font-family', axisLabelFont.family)
                .attr('font-size', axisLabelFont.size)
                .attr('font-weight', axisLabelFont.weight)
                .attr('opacity', 0)
                .text(() => '')

            svg.on('mousemove', () => handleShowTracker(trackerRef.current));

            return tracker;
        }
        // if the magnifier was defined, and is now no longer defined (i.e. props changed, then remove the magnifier)
        else if (!visible && trackerRef.current) {
            svg.on('mousemove', () => null);
            return undefined;
        } else if (visible && trackerRef.current) {
            svg.on('mousemove', () => handleShowTracker(trackerRef.current));
        }
        return trackerRef.current;
    }

    /**
     * Adds grid lines, centered on the spikes, for each neuron
     * @param {SvgSelection} svg The SVG selection holding the grid-lines
     */
    function addGridLines(svg: SvgSelection): void {
        const gridLines = svg
            .selectAll('.grid-line')
            .data(liveDataRef.current.map(series => series.name));

        gridLines
            .enter()
            .append<SVGLineElement>('line')
            .attr('class', 'grid-line')
            .attr('x1', margin.left)
            .attr('x2', margin.left + plotDimensions.width)
            .attr('y1', d => (axesRef.current!.yScale(d) || 0) + margin.top + axesRef.current!.lineHeight / 2)
            .attr('y2', d => (axesRef.current!.yScale(d) || 0) + margin.top + axesRef.current!.lineHeight / 2)
            .attr('stroke', plotGridLines.color)
        ;

        gridLines
            .attr('x1', margin.left)
            .attr('x2', margin.left + plotDimensions.width)
            .attr('y1', d => (axesRef.current!.yScale(d) || 0) + margin.top + axesRef.current!.lineHeight / 2)
            .attr('y2', d => (axesRef.current!.yScale(d) || 0) + margin.top + axesRef.current!.lineHeight / 2)
        ;

        gridLines.exit().remove();
    }

    /**
     * Updates the plot data for the specified time-range, which may have changed due to zoom or pan
     * @param {TimeRange} timeRange The current time range
     */
    function updatePlot(timeRange: TimeRangeType) {
        tooltipRef.current = tooltip;
        timeRangeRef.current = timeRange;

        if (containerRef.current && axesRef.current) {
            // filter out any data that doesn't match the current filter
            const filteredData = liveDataRef.current.filter(series => series.name.match(seriesFilterRef.current));

            // select the text elements and bind the data to them
            const svg = d3.select<SVGSVGElement, any>(containerRef.current);

            // create or update the x-axis (user filters change the location of x-axis)
            axesRef.current.xScale.domain([timeRangeRef.current.start, timeRangeRef.current.end]);
            axesRef.current.xAxisSelection
                .attr('transform', `translate(${margin.left}, ${axesRef.current.lineHeight * filteredData.length + margin.top})`)
                .call(axesRef.current.xAxisGenerator);
            svg
                .select('#raster-chart-x-axis-label')
                .attr('transform', `translate(${margin.left + plotDimensions.width / 2}, ${axesRef.current.lineHeight * filteredData.length + 2 *  margin.top + (margin.bottom / 3)})`);

            // create or update the y-axis (user filters change the scale of the y-axis)
            axesRef.current.yScale
                // .domain(liveDataRef.current.map(series => series.name))
                // .range([0, axesRef.current.lineHeight * liveDataRef.current.length - margin.top]);
                .domain(filteredData.map(series => series.name))
                .range([0, axesRef.current.lineHeight * filteredData.length]);
            axesRef.current.yAxisSelection.call(axesRef.current.yAxisGenerator);

            // create/update the magnifier lens if needed
            magnifierRef.current = magnifierLens(svg, magnifier.visible);

            // create/update the tracker line if needed
            trackerRef.current = trackerControl(svg, tracker.visible);

            // set up the main <g> container for svg and translate it based on the margins, but do it only
            // once
            if (mainGRef.current === undefined) {
                mainGRef.current = svg
                    .attr('width', width)
                    .attr('height', height)
                    .attr('color', axisStyle.color)
                    .append<SVGGElement>('g')
                ;
            } else {
                spikesRef.current = mainGRef.current!
                    .selectAll<SVGGElement, Series>('g')
                    // .data<Series>(liveDataRef.current)
                    .data<Series>(filteredData)
                    .enter()
                    .append('g')
                    .attr('class', 'spikes-series')
                    .attr('id', series => series.name)
                    .attr('transform', `translate(${margin.left}, ${margin.top})`);
            }

            // set up panning
            const drag = d3.drag<SVGSVGElement, Datum>()
                .on("start", () => d3.select(containerRef.current).style("cursor", "move"))
                .on("drag", () => onPan(d3.event.dx))
                .on("end", () => d3.select(containerRef.current).style("cursor", "auto"))
            ;

            svg.call(drag);

            // set up for zooming
            const zoom = d3.zoom<SVGSVGElement, Datum>()
                .scaleExtent([0, 10])
                .translateExtent([[margin.left, margin.top], [width - margin.right, height - margin.bottom]])
                .on("zoom", () => onZoom(d3.event.transform, d3.event.sourceEvent.offsetX - margin.left))
            ;

            svg.call(zoom);

            // add the grid-lines is they are visible
            if (plotGridLines.visible) {
                addGridLines(svg);
            }

            // adjust the clipping region
            svg
                .select('#clip-spikes')
                .attr("width", plotDimensions.width)
                .attr("height", plotDimensions.height - margin.top)

            liveDataRef.current.forEach(series => {
            // filteredData.forEach(series => {
                const plotSeries = (series.name.match(seriesFilterRef.current)) ? series : emptySeries(series.name);

                const container = svg
                    .select<SVGGElement>(`#${series.name}`)
                    .selectAll<SVGLineElement, PixelDatum>('line')
                    .data(plotSeries.data.filter(datum => datum.time >= timeRangeRef.current.start && datum.time <= timeRangeRef.current.end) as PixelDatum[])
                ;

                // enter new elements
                const y = (axesRef.current!.yScale(series.name) || 0);
                container
                    .enter()
                    .append<SVGLineElement>('line')
                    .each(datum => {
                        datum.x = axesRef.current!.xScale(datum.time)
                    })
                    .attr('class', 'spikes-lines')
                    .attr('x1', datum => datum.x)
                    .attr('x2', datum => datum.x)
                    .attr('y1', _ => y + spikesStyle.margin)
                    .attr('y2', _ => y + axesRef.current!.lineHeight - spikesStyle.margin)
                    .attr('stroke', spikesStyle.color)
                    .attr('stroke-width', spikesStyle.lineWidth)
                    .attr('stroke-linecap', "round")
                    .attr("clip-path", "url(#clip-spikes)")
                    // even though the tooltip may not be set to show up on the mouseover, we want to attach the handler
                    // so that when the use enables tooltips the handlers will show the the tooltip
                    .on("mouseover", (datum, i, group) => handleShowTooltip(datum, series.name, group[i]))
                    .on("mouseleave", (datum, i, group) => handleHideTooltip(datum, series.name, group[i]))
                ;

                // update existing elements
                container
                    .filter(datum => datum.time >= timeRangeRef.current.start)
                    .each(datum => {
                        datum.x = axesRef.current!.xScale(datum.time)
                    })
                    .attr('x1', datum => datum.x)
                    .attr('x2', datum => datum.x)
                    .attr('y1', _ => y + spikesStyle.margin)
                    .attr('y2', _ => y + axesRef.current!.lineHeight - spikesStyle.margin)
                ;

                // exit old elements
                container.exit().remove()
                ;
            });
        }
    }

    // called on mount to set up the <g> element into which to render
    useEffect(
        () => {
            if (containerRef.current) {
                const svg = d3.select<SVGSVGElement, any>(containerRef.current);
                axesRef.current = initializeAxes(svg);
            }

            const subscription = seriesObservable
                .pipe(windowTime(windowingTime))
                .subscribe(dataList => {
                    dataList
                        .forEach(data => {
                            // updated the current time to be the max of the new data
                            currentTimeRef.current = data.maxTime;

                            // for each series, add a point if there is a  spike value (i.e. spike value > 0)
                            seriesRef.current = seriesRef.current
                                .map((series, i) => {
                                    const datum = data.newPoints[i].datum;
                                    if (datum.value > 0) {
                                        series.data.push(datum);

                                        // update the handler with the new data point
                                        onUpdateData(series.name, datum.time, datum.value);
                                    }
                                    return series;
                                });

                            // update the data
                            liveDataRef.current = seriesRef.current;
                            timeRangeRef.current = TimeRange(
                                Math.max(0, currentTimeRef.current - timeWindow),
                                Math.max(currentTimeRef.current, timeWindow)
                            )
                        })
                        .then(() => {
                            // updates the caller with the current time
                            onUpdateTime(currentTimeRef.current);

                            updatePlot(timeRangeRef.current);
                        })
                });

            // provide the subscription to the caller
            onSubscribe(subscription);

            // stop the stream on dismount
            return () => subscription.unsubscribe();
        },
        // currentTimeRef, seriesRef, initializeAxes, onSubscribe, onUpdateData, etc are not included
        // in the dependency list because we only want this to run when the component mounts. The
        // lambda handed to the subscribe function gets called and updates many of these refs, and
        // ultimately the SVG plot and we don't want react involved in these updates
        //
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    );

    // update the plot for tooltip, magnifier, or tracker if their visibility changes
    useEffect(
        () => {
            seriesFilterRef.current = filter;
            updatePlot(timeRangeRef.current);
        },
        // seriesFilterRef and timeRangeRef are not included in the dependencies because we don't want
        // react involved in the SVG updates. Rather, the rxjs observable we subscribed to manage the
        // updates to the time-range and the svg plot
        //
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [tooltip.visible, magnifier.visible, tracker.visible, filter]
    )

    return (
        <svg
            className="streaming-raster-chart-d3"
            width={width}
            height={height * liveDataRef.current.length}
            style={{backgroundColor: backgroundColor}}
            ref={containerRef}
        />
    );
}

export default RasterChart;
