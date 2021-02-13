import { default as React, useEffect, useRef } from "react";
import * as d3 from "d3";
import { Axis, ScaleBand, ScaleLinear, Selection, ZoomTransform } from "d3";
import { BarMagnifier, barMagnifierWith, LensTransformation } from "./barMagnifier";
import { TimeRange, TimeRangeType } from "./timeRange";
import { adjustedDimensions, Margin, PlotDimensions } from "./margins";
import { Datum, emptySeries, PixelDatum, Series } from "./datumSeries";
import { defaultTooltipStyle, TooltipStyle } from "./TooltipStyle";
import { fromEvent, Observable, Subscription } from "rxjs";
import { ChartData } from "./chartData";
import { throttleTime, windowTime } from "rxjs/operators";
import { defaultTrackerStyle, TrackerStyle } from "./TrackerStyle";
import { grabWidth, initialSvgStyle, SvgStyle } from "./svgStyle";

const defaultMargin = { top: 30, right: 20, bottom: 30, left: 50 };
const defaultSpikesStyle = {
    margin: 2,
    color: '#008aad',
    lineWidth: 2,
    highlightColor: '#d2933f',
    highlightWidth: 4
};
const defaultAxesStyle = { color: '#d2933f' };
const defaultAxesLabelFont = {
    size: 12,
    color: '#d2933f',
    weight: 300,
    family: 'sans-serif'
};
const defaultPlotGridLines = { visible: true, color: 'rgba(210,147,63,0.30)' };

/**
 * Properties for rendering the line-magnifier lens
 */
interface LineMagnifierStyle {
    visible: boolean;
    width: number;
    magnification: number;
    color: string;
    lineWidth: number;
    axisOpacity?: number;
}

const defaultLineMagnifierStyle: LineMagnifierStyle = {
    visible: false,
    width: 125,
    magnification: 1,
    color: '#d2933f',
    lineWidth: 1,
    axisOpacity: 0.35
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
type LineSelection = Selection<SVGLineElement, any, SVGGElement, undefined>;
type GSelection = Selection<SVGGElement, any, null, undefined>;
type TrackerSelection = Selection<SVGLineElement, Datum, null, undefined>;
type TextSelection = Selection<SVGTextElement, any, HTMLElement, any>;

const textWidthOf = (elem: TextSelection) => elem.node()?.getBBox()?.width || 0;

interface Props {
    width?: number;
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
    svgStyle?: Partial<SvgStyle>;

    // data to plot: time-window is the time-range of data shown (slides in time)
    timeWindow: number;
    seriesList: Array<Series>;
    dropDataAfter?: number;

    // regex filter used to select which series are displayed
    filter?: RegExp;

    seriesObservable: Observable<ChartData>;
    windowingTime?: number;
    shouldSubscribe?: boolean;
    onSubscribe?: (subscription: Subscription) => void;
    onUpdateData?: (seriesName: string, data: Array<Datum>) => void;
    onUpdateTime?: (time: number) => void;
}

/**
 * Renders a raster chart of tagged events. The x-axis is time, and the y-axis shows each tag. The chart
 * relies on an rxjs `Observable` of {@link ChartData} for its data. By default, this chart will subscribe
 * to the observable when it mounts. However, you can control the timing of the subscription through the
 * `shouldSubscribe` property by setting it to `false`, and then some time later setting it to `true`.
 * Once the observable starts sourcing a sequence of {@link ChartData}, for performance, this chart updates
 * itself without invoking React's re-render.
 * @param {Props} props The properties from the parent
 * @return {JSX.Element} The raster chart
 * @constructor
 */
export function RasterChart(props: Props): JSX.Element {
    const {
        seriesList,
        seriesObservable,
        windowingTime = 100,
        shouldSubscribe = true,
        onSubscribe = (_: Subscription) => { },
        onUpdateData = () => { },
        onUpdateTime = (_: number) => { },
        filter = /./,
        timeWindow,
        dropDataAfter = Infinity,
        height,
        backgroundColor = '#202020',
    } = props;

    // override the defaults with the parent's properties, leaving any unset values as the default value
    const margin = { ...defaultMargin, ...props.margin };
    const spikesStyle = { ...defaultSpikesStyle, ...props.spikesStyle };
    const axisStyle = { ...defaultAxesStyle, ...props.axisStyle };
    const axisLabelFont = { ...defaultAxesLabelFont, ...props.axisLabelFont };
    const plotGridLines = { ...defaultPlotGridLines, ...props.plotGridLines };
    const tooltip: TooltipStyle = { ...defaultTooltipStyle, ...props.tooltip };
    const magnifier = { ...defaultLineMagnifierStyle, ...props.magnifier };
    const tracker = { ...defaultTrackerStyle, ...props.tracker };
    const svgStyle = props.width ?
        { ...initialSvgStyle, ...props.svgStyle, width: props.width } :
        { ...initialSvgStyle, ...props.svgStyle };

    // id of the chart to avoid dom conflicts when multiple raster charts are used in the same app
    const chartId = useRef<number>(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));

    // hold a reference to the current width and the plot dimensions
    const width = useRef<number>(props.width || 500);
    const plotDimRef = useRef<PlotDimensions>(adjustedDimensions(width.current, height, margin));

    // resize event throttling
    const resizeEventFlowRef = useRef<Observable<Event>>(
        fromEvent(window, 'resize')
            .pipe(
                throttleTime(50)
            )
    );

    // the container that holds the d3 svg element
    const containerRef = useRef<SVGSVGElement>(null);
    const mainGRef = useRef<Selection<SVGGElement, any, null, undefined>>();
    const spikesRef = useRef<Selection<SVGGElement, Series, SVGGElement, any>>();

    const magnifierRef = useRef<Selection<SVGRectElement, Datum, null, undefined>>();
    const magnifierXAxisRef = useRef<LineSelection>();
    const magnifierXAxisLabelRef = useRef<Selection<SVGTextElement, any, SVGGElement, undefined>>();

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
    const timeRangeRef = useRef<TimeRangeType>(TimeRange(0, timeWindow));

    const seriesFilterRef = useRef<RegExp>(filter);

    const liveDataRef = useRef<Map<string, Series>>(new Map<string, Series>(seriesList.map(series => [series.name, series])));
    const seriesRef = useRef<Map<string, Series>>(new Map<string, Series>(seriesList.map(series => [series.name, series])));
    const currentTimeRef = useRef<number>(0);

    const subscriptionRef = useRef<Subscription>();

    // when the series list changes, then clear out the data
    useEffect(
        () => {
            // liveDataRef.current = new Map<string, Series>(seriesList.map(series => [series.name, series]));
            // seriesRef.current = new Map<string, Series>(seriesList.map(series => [series.name, series]));
            // currentTimeRef.current = 0;
            // timeRangeRef.current = TimeRange(0, timeWindow);
            // updateDimensionsAndPlot();
            resetPlot();
        },
        [seriesList]
    )

    function resetPlot(): void {
        liveDataRef.current = new Map<string, Series>(seriesList.map(series => [series.name, series]));
        seriesRef.current = new Map<string, Series>(seriesList.map(series => [series.name, series]));
        currentTimeRef.current = 0;
        timeRangeRef.current = TimeRange(0, timeWindow);
        updateDimensionsAndPlot();
    }

    // called on mount to set up the <g> element into which to render
    useEffect(
        () => {
            if (containerRef.current) {
                const svg = d3.select<SVGSVGElement, any>(containerRef.current);
                axesRef.current = initializeAxes(svg, plotDimRef.current);
                updateDimensionsAndPlot();
            }

            // subscribe to the throttled resizing events using a consumer that updates the plot
            const subscription = resizeEventFlowRef.current.subscribe(_ => updateDimensionsAndPlot());

            // stop listening to resize events when this component unmounts
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

    // called on mount, dismount and when shouldSubscribe changes
    useEffect(
        () => {
            if (shouldSubscribe) {
                // if (subscriptionRef.current !== undefined) {
                //     subscriptionRef.current?.unsubscribe();
                // }
                subscriptionRef.current = subscribe();
                console.log("subscribed to chart observable");
            } else {
                subscriptionRef.current?.unsubscribe();
                console.log("unsubscribed to chart observable");
            }

            // stop the stream on dismount
            return () => subscriptionRef.current?.unsubscribe();
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [shouldSubscribe]
    )

    // update the plot for tooltip, magnifier, or tracker if their visibility changes
    useEffect(
        () => {
            // update the reference to reflect the selection (only one is allowed)
            if (tooltip.visible) {
                tooltipRef.current.visible = true;
                trackerRef.current = undefined;
                magnifierRef.current = undefined;
            }
            else if (tracker.visible) {
                tooltipRef.current.visible = false;
                magnifierRef.current = undefined;
            }
            else if (magnifier.visible) {
                tooltipRef.current.visible = false;
                trackerRef.current = undefined;
            }
            // when no enhancements are selected, then make sure they are all off
            else {
                tooltipRef.current.visible = false;
                trackerRef.current = undefined;
                magnifierRef.current = undefined;
                if (containerRef.current) {
                    d3.select<SVGSVGElement, any>(containerRef.current).on('mousemove', () => null);
                }
            }

            seriesFilterRef.current = filter;
            updatePlot(timeRangeRef.current, plotDimRef.current);
        },
        // seriesFilterRef and timeRangeRef are not included in the dependencies because we don't want
        // react involved in the SVG updates. Rather, the rxjs observable we subscribed to manages the
        // updates to the time-range and the svg plot
        //
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [tooltip.visible, magnifier.visible, tracker.visible, filter]
    )

    useEffect(
        () => {
            tooltipRef.current = tooltip;
        },
        [tooltip]
    )

    useEffect(
        () => {
            updatePlot(timeRangeRef.current, plotDimRef.current);
        },
        [spikesStyle, axisStyle, axisLabelFont, plotGridLines, magnifier, tracker]
    )

    /**
     * Initializes the axes
     * @param {SvgSelection} svg The main svg element
     * @param {PlotDimensions} plotDimensions The dimensions of the plot
     * @return {Axes} The axes generators, selections, scales, and spike line height
     */
    function initializeAxes(svg: SvgSelection, plotDimensions: PlotDimensions): Axes {
        // calculate the mapping between the times in the data (domain) and the display
        // location on the screen (range)
        const xScale = d3.scaleLinear()
            .domain([timeRangeRef.current.start, timeRangeRef.current.end])
            .range([0, plotDimensions.width]);

        const lineHeight = (plotDimensions.height - margin.top) / liveDataRef.current.size;
        const yScale = d3.scaleBand()
            .domain(Array.from(liveDataRef.current.keys()))
            .range([0, lineHeight * liveDataRef.current.size]);

        // create and add the axes
        const xAxisGenerator = d3.axisBottom(xScale);
        const yAxisGenerator = d3.axisLeft(yScale);
        const xAxisSelection = svg
            .append<SVGGElement>('g')
            .attr('id', `x-axis-selection-${chartId.current}`)
            .attr('class', 'x-axis')
            .attr('transform', `translate(${margin.left}, ${lineHeight * liveDataRef.current.size + margin.top})`)
            .call(xAxisGenerator);

        const yAxisSelection = svg
            .append<SVGGElement>('g')
            .attr('id', `y-axis-selection-${chartId.current}`)
            .attr('class', 'y-axis')
            .attr('transform', `translate(${margin.left}, ${margin.top})`)
            .call(yAxisGenerator);

        svg
            .append<SVGTextElement>('text')
            .attr('id', `raster-chart-x-axis-label-${chartId.current}`)
            .attr('text-anchor', 'middle')
            .attr('font-size', axisLabelFont.size)
            .attr('fill', axisLabelFont.color)
            .attr('font-family', axisLabelFont.family)
            .attr('font-weight', axisLabelFont.weight)
            .attr('transform', `translate(${margin.left + plotDimensions.width / 2}, ${lineHeight + 2 * margin.top + (margin.bottom / 3)})`)
            .text("t (ms)");

        // create the clipping region so that the lines are clipped at the y-axis
        svg
            .append("defs")
            .append("clipPath")
            .attr("id", `clip-spikes-${chartId.current}`)
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
     * @param {PlotDimensions} plotDimensions The current dimensions of the plot
     */
    function onZoom(transform: ZoomTransform, x: number, plotDimensions: PlotDimensions): void {
        const time = axesRef.current!.xAxisGenerator.scale<ScaleLinear<number, number>>().invert(x);
        timeRangeRef.current = timeRangeRef.current!.scale(transform.k, time);
        zoomFactorRef.current = transform.k;
        updatePlot(timeRangeRef.current, plotDimensions);
    }

    /**
     * Adjusts the time-range and updates the plot when the plot is dragged to the left or right
     * @param {number} deltaX The amount that the plot is dragged
     * @param {PlotDimensions} plotDimensions The current dimensions of the plot
     */
    function onPan(deltaX: number, plotDimensions: PlotDimensions): void {
        const scale = axesRef.current!.xAxisGenerator.scale<ScaleLinear<number, number>>();
        const currentTime = timeRangeRef!.current.start;
        const x = scale(currentTime);
        const deltaTime = scale.invert(x + deltaX) - currentTime;
        timeRangeRef.current = timeRangeRef.current!.translate(-deltaTime);
        updatePlot(timeRangeRef.current, plotDimensions);
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
                .attr('id', `r${datum.time}-${seriesName}-${chartId.current}`)
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
                .attr('id', `tn${datum.time}-${seriesName}-${chartId.current}`)
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
                .attr('id', `t${datum.time}-${seriesName}-${chartId.current}`)
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
                plotDimRef.current.width - textWidth / 2
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
        return plotDimRef.current.height / liveDataRef.current.size;
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
     * @param {SvgSelection} svg The svg selection holding the whole chart
     */
    function handleShowMagnify(svg: SvgSelection): void {

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

        const path = d3.select('.bar-magnifier')

        if (containerRef.current && path) {
            const [x, y] = d3.mouse(containerRef.current);
            const isMouseInPlot = mouseInPlotArea(x, y);
            const deltaX = magnifier.width / 2;
            path
                .attr('x', x - deltaX)
                .attr('width', 2 * deltaX)
                .attr('opacity', () => isMouseInPlot ? 1 : 0)
                ;

            // add the magnifier axes and label
            d3.select(`#magnifier-line-${chartId.current}`)
                .attr('x1', x)
                .attr('x2', x)
                .attr('opacity', () => isMouseInPlot ? magnifier.axisOpacity || 0.35 : 0)
                ;

            const label = d3.select<SVGTextElement, any>(`#magnifier-line-time-${chartId.current}`)
                .attr('opacity', () => mouseInPlotArea(x, y) ? 1 : 0)
                .text(() => `${d3.format(",.0f")(axesRef.current!.xScale.invert(x - margin.left))} ms`)
                ;
            label.attr('x', Math.min(plotDimRef.current.width + margin.left - textWidthOf(label), x));

            const axesMagnifier: BarMagnifier = barMagnifierWith(deltaX, magnifier.magnification, x);
            magnifierXAxisRef.current!
                .attr('opacity', isMouseInPlot ? 1 : 0)
                .attr('stroke', tooltipRef.current.borderColor)
                .attr('stroke-width', 0.75)
                .attr('x1', datum => axesMagnifier.magnify(x + datum * deltaX / 5).xPrime)
                .attr('x2', datum => axesMagnifier.magnify(x + datum * deltaX / 5).xPrime)
                .attr('y1', y - 10)
                .attr('y2', y)
                ;

            magnifierXAxisLabelRef.current!
                .attr('opacity', isMouseInPlot ? 1 : 0)
                .attr('x', datum => axesMagnifier.magnify(x + datum * deltaX / 5).xPrime - 12)
                .attr('y', _ => y + 20)
                .text(datum => Math.round(axesRef.current!.xScale.invert(x - margin.left + datum * deltaX / 5)))
                ;

            // if the mouse is in the plot area and it has moved by at least 1 pixel, then show/update
            // the bar magnifier
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
            }
            // mouse is no longer in plot, hide the magnifier
            else if (!isMouseInPlot) {
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
                .attr('stroke', tracker.color)
                ;

            const label = d3.select<SVGTextElement, any>(`#raster-chart-tracker-time-${chartId.current}`)
                .attr('opacity', () => mouseInPlotArea(x, y) ? 1 : 0)
                .attr('fill', axisLabelFont.color)
                .text(() => `${d3.format(",.0f")(axesRef.current!.xScale.invert(x - margin.left))} ms`)

            const labelWidth = textWidthOf(label);
            label.attr('x', Math.min(plotDimRef.current.width + margin.left - labelWidth, x))
        }
    }

    /**
     * Calculates whether the mouse is in the plot-area
     * @param {number} x The x-coordinate of the mouse's position
     * @param {number} y The y-coordinate of the mouse's position
     * @return {boolean} `true` if the mouse is in the plot area; `false` if the mouse is not in the plot area
     */
    function mouseInPlotArea(x: number, y: number): boolean {
        return x > margin.left && x < width.current - margin.right &&
            y > margin.top && y < height - margin.bottom;
    }

    /**
     * Creates the SVG elements for displaying a bar magnifier lens on the data
     * @param {SvgSelection} svg The SVG selection
     * @param {boolean} visible `true` if the lens is visible; `false` otherwise
     * @param {number} height The height of the magnifier lens
     * @return {MagnifierSelection | undefined} The magnifier selection if visible; otherwise undefined
     */
    function magnifierLens(svg: SvgSelection, visible: boolean, height: number): MagnifierSelection | undefined {
        if (visible && magnifierRef.current === undefined) {
            const linearGradient = svg
                .append<SVGDefsElement>('defs')
                .append<SVGLinearGradientElement>('linearGradient')
                .attr('id', `bar-magnifier-gradient-${chartId.current}`)
                .attr('x1', '0%')
                .attr('x2', '100%')
                .attr('y1', '0%')
                .attr('y2', '0%')
                ;

            const borderColor = d3.rgb(magnifier.color).brighter(3.5).hex();
            linearGradient
                .append<SVGStopElement>('stop')
                .attr('offset', '0%')
                .attr('stop-color', borderColor)
                ;

            linearGradient
                .append<SVGStopElement>('stop')
                .attr('offset', '30%')
                .attr('stop-color', magnifier.color)
                .attr('stop-opacity', 0)
                ;

            linearGradient
                .append<SVGStopElement>('stop')
                .attr('offset', '70%')
                .attr('stop-color', magnifier.color)
                .attr('stop-opacity', 0)
                ;

            linearGradient
                .append<SVGStopElement>('stop')
                .attr('offset', '100%')
                .attr('stop-color', borderColor)
                ;

            const magnifierSelection = svg
                .append<SVGRectElement>('rect')
                .attr('class', 'bar-magnifier')
                .attr('y', margin.top)
                .attr('height', height)
                .style('fill', `url(#bar-magnifier-gradient-${chartId.current})`)
                ;

            svg
                .append<SVGLineElement>('line')
                .attr('id', `magnifier-line-${chartId.current}`)
                .attr('y1', margin.top)
                .attr('y2', height + margin.top)
                .attr('stroke', axisStyle.color)
                .attr('stroke-width', tooltip.borderWidth)
                .attr('opacity', 0)
                ;

            // create the text element holding the tracker time
            svg
                .append<SVGTextElement>('text')
                .attr('id', `magnifier-line-time-${chartId.current}`)
                .attr('y', Math.max(0, margin.top - 3))
                .attr('fill', axisLabelFont.color)
                .attr('font-family', axisLabelFont.family)
                .attr('font-size', axisLabelFont.size)
                .attr('font-weight', axisLabelFont.weight)
                .attr('opacity', 0)
                .text(() => '')

            const lensTickIndexes = d3.range(-5, 6, 1);
            const lensLabelIndexes = [-5, -1, 1, 5];

            const xLensAxisTicks = svg.append('g').attr('id', `x-lens-axis-ticks-raster-${chartId.current}`);
            magnifierXAxisRef.current = magnifierLensAxisTicks('x-lens-ticks', lensTickIndexes, xLensAxisTicks);
            magnifierXAxisLabelRef.current = magnifierLensAxisLabels(lensLabelIndexes, xLensAxisTicks);


            // add the handler for the magnifier as the mouse moves
            svg.on('mousemove', () => handleShowMagnify(svg));

            return magnifierSelection;
        }
        // if the magnifier was defined, and is now no longer defined (i.e. props changed, then remove the magnifier)
        else if ((!visible && magnifierRef.current) || tooltipRef.current.visible) {
            svg.on('mousemove', () => null);
            return undefined;
        }
        // when the magnifier is visible and exists, then make sure the height is set (which can change due
        // to filtering) and update the handler
        else if (visible && magnifierRef.current) {
            // update the magnifier height
            magnifierRef.current.attr('height', height);

            // update the handler for the magnifier as the mouse moves
            svg.on('mousemove', () => handleShowMagnify(svg));
        }
        return magnifierRef.current;
    }

    /**
     * Creates the svg node for a magnifier lens axis (either x or y) ticks and binds the ticks to the nodes
     * @param {string} className The node's class name for selection
     * @param {Array<number>} ticks The ticks represented as an array of integers. An integer of 0 places the
     * tick on the center of the lens. An integer of ± array_length / 2 - 1 places the tick on the lens boundary.
     * @param {GSelection} selection The svg g node holding these axis ticks
     * @return {LineSelection} A line selection these ticks
     */
    function magnifierLensAxisTicks(className: string, ticks: Array<number>, selection: GSelection): LineSelection {
        return selection
            .selectAll('line')
            .data(ticks)
            .enter()
            .append('line')
            .attr('class', className)
            .attr('stroke', tooltipRef.current.borderColor)
            .attr('stroke-width', 0.75)
            .attr('opacity', 0)
            ;
    }

    /**
     * Creates the svg text nodes for the magnifier lens axis (either x or y) tick labels and binds the text nodes
     * to the tick data.
     * @param {Array<number>} ticks An array of indexes defining where the ticks are to be place. The indexes refer
     * to the ticks handed to the `magnifierLensAxis` and have the same meaning visa-vie their locations
     * @param {GSelection} selection The selection of the svg g node holding the axis ticks and these labels
     * @return {Selection<SVGTextElement, number, SVGGElement, any>} The selection of these tick labels
     */
    function magnifierLensAxisLabels(ticks: Array<number>, selection: GSelection): Selection<SVGTextElement, number, SVGGElement, any> {
        return selection
            .selectAll('text')
            .data(ticks)
            .enter()
            .append('text')
            .attr('fill', axisLabelFont.color)
            .attr('font-family', axisLabelFont.family)
            .attr('font-size', axisLabelFont.size)
            .attr('font-weight', axisLabelFont.weight)
            .text(() => '')
            ;
    }

    /**
     * Creates the SVG elements for displaying a tracker line
     * @param {SvgSelection} svg The SVG selection
     * @param {boolean} visible `true` if the tracker is visible; `false` otherwise
     * @param {number} height The height of the tracker bar
     * @return {TrackerSelection | undefined} The tracker selection if visible; otherwise undefined
     */
    function trackerControl(svg: SvgSelection, visible: boolean, height: number): TrackerSelection | undefined {
        if (visible && trackerRef.current === undefined) {
            const trackerLine = svg
                .append<SVGLineElement>('line')
                .attr('class', 'tracker')
                .attr('y1', margin.top)
                .attr('y2', height + margin.top)
                .attr('stroke', tracker.color)
                .attr('stroke-width', tracker.lineWidth)
                .attr('opacity', 0)
                ;

            // create the text element holding the tracker time
            svg
                .append<SVGTextElement>('text')
                .attr('id', `raster-chart-tracker-time-${chartId.current}`)
                .attr('y', Math.max(0, margin.top - 3))
                .attr('fill', axisLabelFont.color)
                .attr('font-family', axisLabelFont.family)
                .attr('font-size', axisLabelFont.size)
                .attr('font-weight', axisLabelFont.weight)
                .attr('opacity', 0)
                .text(() => '')

            svg.on('mousemove', () => handleShowTracker(trackerRef.current));

            return trackerLine;
        }
        // if the magnifier was defined, and is now no longer defined (i.e. props changed, then remove the magnifier)
        else if (!visible && trackerRef.current) {
            svg.on('mousemove', () => null);
            return undefined;
        }
        // when the tracker is visible and exists, then make sure the height is set (which can change due
        // to filtering) and update the handler
        else if (visible && trackerRef.current) {
            trackerRef.current.attr('y2', height + margin.top);
            svg.on('mousemove', () => handleShowTracker(trackerRef.current));
        }
        return trackerRef.current;
    }

    /**
     * Adds grid lines, centered on the spikes, for each neuron
     * @param {SvgSelection} svg The SVG selection holding the grid-lines
     * @param {PlotDimensions} plotDimensions The current dimensions of the plot
     */
    function addGridLines(svg: SvgSelection, plotDimensions: PlotDimensions): void {
        const gridLines = svg
            .selectAll('.grid-line')
            .data(Array.from(liveDataRef.current.keys()).filter(name => name.match(seriesFilterRef.current)));

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
            .attr('stroke', plotGridLines.color)
            ;

        gridLines.exit().remove();
    }

    /**
     * Updates the plot data for the specified time-range, which may have changed due to zoom or pan
     * @param {TimeRange} timeRange The current time range
     * @param {PlotDimensions} plotDimensions The current dimensions of the plot
     */
    function updatePlot(timeRange: TimeRangeType, plotDimensions: PlotDimensions): void {
        tooltipRef.current = tooltip;
        timeRangeRef.current = timeRange;

        if (containerRef.current && axesRef.current) {
            // filter out any data that doesn't match the current filter
            const filteredData = Array
                .from(liveDataRef.current.values())
                .filter(series => series.name.match(seriesFilterRef.current));

            // select the text elements and bind the data to them
            const svg = d3.select<SVGSVGElement, any>(containerRef.current);

            // create or update the x-axis (user filters change the location of x-axis)
            axesRef.current.xScale
                .domain([timeRangeRef.current.start, timeRangeRef.current.end])
                .range([0, plotDimensions.width]);
            axesRef.current.xAxisSelection
                .attr('transform', `translate(${margin.left}, ${axesRef.current.lineHeight * filteredData.length + margin.top})`)
                .call(axesRef.current.xAxisGenerator);
            svg
                .select(`#raster-chart-x-axis-label-${chartId.current}`)
                .attr('transform', `translate(${margin.left + plotDimensions.width / 2}, ${axesRef.current.lineHeight * filteredData.length + 2 * margin.top + (margin.bottom / 3)})`)
                .attr('fill', axisLabelFont.color)
                ;

            // create or update the y-axis (user filters change the scale of the y-axis)
            axesRef.current.yScale
                .domain(filteredData.map(series => series.name))
                .range([0, axesRef.current.lineHeight * filteredData.length]);
            axesRef.current.yAxisSelection.call(axesRef.current.yAxisGenerator);

            // create/update the magnifier lens if needed
            magnifierRef.current = magnifierLens(svg, magnifier.visible, filteredData.length * axesRef.current.lineHeight);

            // create/update the tracker line if needed
            trackerRef.current = trackerControl(svg, tracker.visible, filteredData.length * axesRef.current.lineHeight);

            // set up the main <g> container for svg and translate it based on the margins, but do it only
            // once
            if (mainGRef.current === undefined) {
                mainGRef.current = svg
                    .attr('width', width.current)
                    .attr('height', height)
                    .attr('color', axisStyle.color)
                    .append<SVGGElement>('g')
                    ;
            } else {
                // in case the axis color has changed
                svg.attr('color', axisStyle.color);
                spikesRef.current = mainGRef.current!
                    .selectAll<SVGGElement, Series>('g')
                    .data<Series>(filteredData)
                    .enter()
                    .append('g')
                    .attr('class', 'spikes-series')
                    .attr('id', series => `${series.name}-${chartId.current}`)
                    .attr('transform', `translate(${margin.left}, ${margin.top})`);
            }

            // set up panning
            const drag = d3.drag<SVGSVGElement, Datum>()
                .on("start", () => d3.select(containerRef.current).style("cursor", "move"))
                .on("drag", () => onPan(d3.event.dx, plotDimensions))
                .on("end", () => d3.select(containerRef.current).style("cursor", "auto"))
                ;

            svg.call(drag);

            // set up for zooming
            const zoom = d3.zoom<SVGSVGElement, Datum>()
                .scaleExtent([0, 10])
                .translateExtent([[margin.left, margin.top], [width.current - margin.right, height - margin.bottom]])
                .on("zoom", () => onZoom(d3.event.transform, d3.event.sourceEvent.offsetX - margin.left, plotDimensions))
                ;

            svg.call(zoom);

            // add the grid-lines is they are visible
            if (plotGridLines.visible) {
                addGridLines(svg, plotDimensions);
            }

            // remove the old clipping region and add a new one with the updated plot dimensions
            svg.select('defs').remove();
            svg
                .append('defs')
                .append("clipPath")
                .attr("id", `clip-spikes-${chartId.current}`)
                .append("rect")
                .attr("width", plotDimensions.width)
                .attr("height", plotDimensions.height - margin.top)
                ;

            liveDataRef.current.forEach(series => {
                const plotSeries = (series.name.match(seriesFilterRef.current)) ? series : emptySeries(series.name);

                const container = svg
                    .select<SVGGElement>(`#${series.name}-${chartId.current}`)
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
                    .attr("clip-path", `url(#clip-spikes-${chartId.current})`)
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
                    .attr('stroke', spikesStyle.color)
                    .on("mouseover", (datum, i, group) => handleShowTooltip(datum, series.name, group[i]))
                    .on("mouseleave", (datum, i, group) => handleHideTooltip(datum, series.name, group[i]))
                    ;

                // exit old elements
                container.exit().remove();
            });
        }
    }

    /**
     * Subscribes to the observable that streams chart events and hands the subscription a consumer
     * that updates the charts as events enter. Also hands the subscription back to the parent
     * component using the registered {@link onSubscribe} callback method from the properties.
     * @return {Subscription} The subscription (disposable) for cancelling
     */
    function subscribe(): Subscription {
        resetPlot();
        const subscription = seriesObservable
            .pipe(windowTime(windowingTime))
            .subscribe(dataList => {
                dataList
                    .forEach(data => {
                        // updated the current time to be the max of the new data
                        currentTimeRef.current = data.maxTime;

                        // add each new point to it's corresponding series
                        data.newPoints.forEach((newData, name) => {
                            // grab the current series associated with the new data
                            const series = seriesRef.current.get(name) || emptySeries(name);

                            // update the handler with the new data point
                            onUpdateData(name, newData);

                            // add the new data to the series
                            series.data.push(...newData);

                            // drop data that is older than the max time-window
                            while (currentTimeRef.current - series.data[0].time > dropDataAfter) {
                                series.data.shift();
                            }
                        })

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

                        updatePlot(timeRangeRef.current, plotDimRef.current);
                    })
            });

        // provide the subscription to the caller
        onSubscribe(subscription);

        return subscription;
    }

    /**
     * Updates the plot dimensions and then updates the plot
     */
    function updateDimensionsAndPlot(): void {
        width.current = grabWidth(containerRef.current);
        plotDimRef.current = adjustedDimensions(width.current, height, margin);
        updatePlot(timeRangeRef.current, plotDimRef.current);
    }

    return (
        <svg
            style={{
                ...svgStyle,
                backgroundColor: backgroundColor,
                height: `${height}`
            }}
            ref={containerRef}
        />
    );
}
