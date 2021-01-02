import { default as React, useEffect, useRef } from "react";
import * as d3 from "d3";
import { Axis, ScaleLinear, Selection, ZoomTransform } from "d3";
import { adjustedDimensions, Margin, PlotDimensions } from "./margins";
import { Datum, emptySeries, Series } from "./datumSeries";
import { TimeRange, TimeRangeType } from "./timeRange";
import { defaultTooltipStyle, TooltipStyle } from "./TooltipStyle";
import { fromEvent, Observable, Subscription } from "rxjs";
import { ChartData } from "./chartData";
import { LensTransformation2d, RadialMagnifier, radialMagnifierWith } from "./radialMagnifier";
import { throttleTime, windowTime } from "rxjs/operators";
import { defaultTrackerStyle, TrackerStyle } from "./TrackerStyle";
import { grabWidth, initialSvgStyle, SvgStyle } from "./svgStyle";

const defaultMargin = { top: 30, right: 20, bottom: 30, left: 50 };
const defaultAxesStyle = { color: '#d2933f' };
const defaultAxesLabelFont = {
    size: 12,
    color: '#d2933f',
    weight: 300,
    family: 'sans-serif'
};
const defaultLineStyle = {
    color: '#008aad',
    lineWidth: 1,
    highlightColor: '#d2933f',
    highlightWidth: 3
};

interface Axes {
    xAxisGenerator: Axis<number | { valueOf(): number }>;
    yAxisGenerator: Axis<number | { valueOf(): number }>;
    xAxisSelection: AxisElementSelection;
    yAxisSelection: AxisElementSelection;
    xScale: ScaleLinear<number, number>;
    yScale: ScaleLinear<number, number>;
}

// the axis-element type return when calling the ".call(axis)" function
type AxisElementSelection = Selection<SVGGElement, unknown, null, undefined>;
type SvgSelection = Selection<SVGSVGElement, any, null, undefined>;
type GSelection = Selection<SVGGElement, any, null, undefined>;
type LineSelection = Selection<SVGLineElement, any, SVGGElement, undefined>;
type TextSelection = Selection<SVGTextElement, any, null, undefined>;
type MagnifierSelection = Selection<SVGCircleElement, Datum, null, undefined>;
type TrackerSelection = Selection<SVGLineElement, Datum, null, undefined>;

type TimeSeries = Array<[number, number]>;

const textWidthOf = (elem: Selection<SVGTextElement, any, HTMLElement, any>) => elem.node()?.getBBox()?.width || 0;

/**
 * Holds the actual datum and the associated transformation information
 */
interface MagnifiedData {
    datum: [number, number];
    lens: LensTransformation2d;
}

/**
 * Properties for rendering the line-magnifier lens
 */
interface RadialMagnifierStyle {
    visible: boolean;
    radius: number;
    magnification: number;
    color: string,
    lineWidth: number,
}

const defaultRadialMagnifierStyle: RadialMagnifierStyle = {
    visible: false,
    radius: 100,
    magnification: 5,
    color: '#d2933f',
    lineWidth: 2,
};

interface Props {
    width?: number;
    height: number;
    margin?: Partial<Margin>;
    axisLabelFont?: Partial<{ size: number, color: string, family: string, weight: number }>;
    axisStyle?: Partial<{ color: string }>;
    backgroundColor?: string;
    lineStyle?: Partial<{ color: string, lineWidth: number, highlightColor: string, highlightWidth: number }>;
    plotGridLines?: Partial<{ visible: boolean, color: string }>;
    tooltip?: Partial<TooltipStyle>;
    tooltipValueLabel?: string;
    magnifier?: Partial<RadialMagnifierStyle>;
    tracker?: Partial<TrackerStyle>;
    svgStyle?: Partial<SvgStyle>;

    minY?: number;
    maxY?: number;

    // data to plot: time-window is the time-range of data shown (slides in time)
    timeWindow: number;
    seriesList: Array<Series>;
    dropDataAfter: number;

    // data stream
    seriesObservable: Observable<ChartData>;
    windowingTime?: number;
    shouldSubscribe?: boolean;
    onSubscribe?: (subscription: Subscription) => void;
    onUpdateData?: (seriesName: string, data: Array<Datum>) => void;
    onUpdateTime?: (time: number) => void;

    // regex filter used to select which series are displayed
    filter?: RegExp;

    // a map that holds the series name and it's associated cooler
    seriesColors?: Map<string, string>;
}

/**
 * Renders a scatter chart of time-series. The x-axis is time, and the y-axis shows the values. The chart
 * relies on an rxjs `Observable` of {@link ChartData} for its data. By default, this chart will subscribe
 * to the observable when it mounts. However, you can control the timing of the subscription through the
 * `shouldSubscribe` property by setting it to `false`, and then some time later setting it to `true`.
 * Once the observable starts sourcing a sequence of {@link ChartData}, for performance, this chart updates
 * itself without invoking React's re-render.
 * @param {Props} props The properties from the parent
 * @return {JSX.Element} The scatter chart
 * @constructor
 */
export function ScatterChart(props: Props): JSX.Element {

    const {
        height,
        backgroundColor = '#202020',
        minY = -1, maxY = 1,
        tooltipValueLabel = 'y',
        timeWindow,
        seriesList,
        seriesObservable,
        windowingTime = 100,
        dropDataAfter = Infinity,
        shouldSubscribe = true,
        onSubscribe = (_: Subscription) => {},
        onUpdateData = () => { },
        onUpdateTime = (_: number) => { },
        filter = /./,
        seriesColors = seriesColorsFor(seriesList, defaultLineStyle.color, "#a9a9b4")
    } = props;

    // override the defaults with the parent's properties, leaving any unset values as the default value
    const margin = { ...defaultMargin, ...props.margin };
    const axisStyle = { ...defaultAxesStyle, ...props.axisStyle };
    const axisLabelFont = { ...defaultAxesLabelFont, ...props.axisLabelFont };
    const tooltip: TooltipStyle = { ...defaultTooltipStyle, ...props.tooltip };
    const magnifier = { ...defaultRadialMagnifierStyle, ...props.magnifier };
    const lineStyle = { ...defaultLineStyle, ...props.lineStyle };
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

    const magnifierRef = useRef<MagnifierSelection>();
    const magnifierXAxisRef = useRef<LineSelection>();
    const magnifierXAxisLabelRef = useRef<Selection<SVGTextElement, any, SVGGElement, undefined>>();
    const magnifierYAxisRef = useRef<LineSelection>();
    const magnifierYAxisLabelRef = useRef<Selection<SVGTextElement, any, SVGGElement, undefined>>();

    const trackerRef = useRef<Selection<SVGLineElement, Datum, null, undefined>>();

    const zoomFactorRef = useRef<number>(5);

    // reference to the axes for the plot
    const axesRef = useRef<Axes>();

    // reference for the min/max values
    const minValueRef = useRef<number>(minY);
    const maxValueRef = useRef<number>(maxY);

    // const liveDataRef = useRef<Array<Series>>(seriesList);
    const liveDataRef = useRef<Map<string, Series>>(new Map<string, Series>(seriesList.map(series => [series.name, series])));
    const seriesRef = useRef<Map<string, Series>>(new Map<string, Series>(seriesList.map(series => [series.name, series])));
    const currentTimeRef = useRef<number>(0);


    // unlike the magnifier, the handler forms a closure on the tooltip properties, and so if they change in this
    // component, the closed properties are unchanged. using a ref allows the properties to which the reference
    // points to change.
    const tooltipRef = useRef<TooltipStyle>(tooltip);

    // calculates to the time-range based on the (min, max)-time from the props
    const timeRangeRef = useRef<TimeRangeType>(TimeRange(0, timeWindow));

    const seriesFilterRef = useRef<RegExp>(filter);

    // set the colors used for the time-series
    const colorsRef = useRef<Map<string, string>>(seriesColors);

    const borderColor = d3.rgb(tooltip.backgroundColor).brighter(3.5).hex();

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
            return () => {
                subscription.unsubscribe();
            }
        },
        // we really, really only want this called when the component mounts, and there are
        // no stale closures in the this. recall that d3 manages the updates to the chart, and
        // react is only used when certain props change (e.g. magnifier, tracker, tooltip visibility
        // state, magnification power)
        //
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    );

    // called on mount, dismount and when shouldSubscribe changes
    useEffect(
        () => {
            if (shouldSubscribe) {
                const subscription = subscribe();

                // stop the stream on dismount
                return () => subscription.unsubscribe();
            }
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
        // react involved in the SVG updates. Rather, the rxjs observable we subscribed to manage the
        // updates to the time-range and the svg plot
        //
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [tooltip.visible, magnifier.visible, magnifier.magnification, tracker.visible, filter]
    )

    /**
     * Calculates the min and max values for the specified array of time-series
     * @param {Array<TimeSeries>} data The array of time-series
     * @return {[number, number]} A pair with the min value as the first element and the max
     * value as the second element.
     */
    function calcMinMaxValues(data: Array<TimeSeries>): [number, number] {
        const minValue = d3.min(data, series => d3.min(series, datum => datum[1])) || 0;
        const maxValue = d3.max(data, series => d3.max(series, datum => datum[1])) || 1;
        return [
            Math.min(minValue, minValueRef.current),
            Math.max(maxValue, maxValueRef.current)
        ];
    }

    /**
     * Initializes the x and y axes and returns the axes generators, axes, and scale functions
     * @param {SvgSelection} svg The main SVG container
     * @param {PlotDimensions} plotDimensions The dimensions of the plot
     * @return {Axes} The axes generators, axes, and scale functions
     */
    function initializeAxes(svg: SvgSelection, plotDimensions: PlotDimensions): Axes {
        // initialize the x-axis
        const xScale = d3.scaleLinear()
            .domain([timeRangeRef.current.start, timeRangeRef.current.end])
            .range([0, plotDimensions.width])
            ;
        const xAxisGenerator = d3.axisBottom(xScale);
        const xAxisSelection = svg
            .append<SVGGElement>('g')
            .attr('class', 'x-axis')
            .attr('transform', `translate(${margin.left}, ${plotDimensions.height})`)
            ;

        svg
            .append<SVGTextElement>('text')
            .attr('id', `scatter-chart-x-axis-label-${chartId.current}`)
            .attr('text-anchor', 'middle')
            .attr('font-size', axisLabelFont.size)
            .attr('fill', axisLabelFont.color)
            .attr('font-family', axisLabelFont.family)
            .attr('font-weight', axisLabelFont.weight)
            .attr('transform', `translate(${margin.left + plotDimensions.width / 2}, ${plotDimensions.height + margin.top + (margin.bottom / 3)})`)
            .text("t (ms)");


        // initialize the y-axis
        const yScale = d3.scaleLinear()
            .domain([minY, maxY])
            .range([plotDimensions.height - margin.bottom, 0])
            ;
        const yAxisGenerator = d3.axisLeft(yScale);
        const yAxisSelection = svg
            .append<SVGGElement>('g')
            .attr('class', 'y-axis')
            .attr('transform', `translate(${margin.left}, ${margin.top})`)
            ;

        // create the clipping region so that the lines are clipped at the y-axis
        svg
            .append("defs")
            .append("clipPath")
            .attr("id", `clip-series-${chartId.current}`)
            .append("rect")
            .attr("width", plotDimensions.width)
            .attr("height", plotDimensions.height - margin.top)
            ;

        return {
            xAxisGenerator, yAxisGenerator,
            xAxisSelection, yAxisSelection,
            xScale, yScale
        };
    }

    /**
     * Called when the user uses the scroll wheel (or scroll gesture) to zoom in or out. Zooms in/out
     * at the location of the mouse when the scroll wheel or gesture was applied.
     * @param {ZoomTransform} transform The d3 zoom transformation information
     * @param {number} x The x-position of the mouse when the scroll wheel or gesture is used
     * @param {PlotDimensions} plotDimensions The dimensions of the plot
     */
    function onZoom(transform: ZoomTransform, x: number, plotDimensions: PlotDimensions): void {
        // only zoom if the mouse is in the plot area
        if (x > 0 && x < width.current - margin.right) {
            const time = axesRef.current!.xAxisGenerator.scale<ScaleLinear<number, number>>().invert(x);
            timeRangeRef.current = timeRangeRef.current!.scale(transform.k, time);
            zoomFactorRef.current = transform.k;
            updatePlot(timeRangeRef.current, plotDimensions);
        }
    }

    /**
     * Adjusts the time-range and updates the plot when the plot is dragged to the left or right
     * @param {number} deltaX The amount that the plot is dragged
     * @param {PlotDimensions} plotDimensions The dimensions of the plot
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
     * Returns the index of the data point whose time is the upper boundary on the specified
     * time. If the specified time is larger than any time in the specified data, the returns
     * the length of the data array. If the specified time is smaller than all the values in
     * the specified array, then returns -1.
     * @param {TimeSeries} data The array of points from which to select the
     * boundary.
     * @param {number} time The time for which to find the bounding points
     * @return {number} The index of the upper boundary.
     */
    function boundingPointsIndex(data: TimeSeries, time: number): number {
        const length = data.length;
        if (time > data[length - 1][0]) {
            return length;
        }
        if (time < data[0][0]) {
            return 0;
        }
        return data.findIndex((value, index, array) => {
            const lowerIndex = Math.max(0, index - 1);
            return array[lowerIndex][0] <= time && time <= array[index][0];
        })
    }

    /**
     * Returns the (time, value) point that comes just before the mouse and just after the mouse
     * @param {TimeSeries} data The time-series data
     * @param {number} time The time represented by the mouse's x-coordinate
     * @return {[[number, number], [number, number]]} the (time, value) point that comes just before
     * the mouse and just after the mouse. If the mouse is after the last point, then the "after" point
     * is `[NaN, NaN]`. If the mouse is before the first point, then the "before" point is `[NaN, NaN]`.
     */
    function boundingPoints(data: TimeSeries, time: number): [[number, number], [number, number]] {
        const upperIndex = boundingPointsIndex(data, time);
        if (upperIndex <= 0) {
            return [[NaN, NaN], data[0]];
        }
        if (upperIndex >= data.length) {
            return [data[data.length - 1], [NaN, NaN]];
        }
        return [data[upperIndex - 1], data[upperIndex]];
    }

    /**
     * Renders a tooltip showing the neuron, spike time, and the spike strength when the mouse hovers over a spike.
     * @param {Datum} datum The spike datum (t ms, s mV)
     * @param {string} seriesName The name of the series (i.e. the neuron ID)
     * @param {SVGPathElement} segment The SVG line element representing the spike, over which the mouse is hovering.
     */
    function handleShowTooltip(datum: TimeSeries, seriesName: string, segment: SVGPathElement): void {
        if (!(tooltipRef.current.visible || magnifier.visible) || !containerRef.current || !axesRef.current) {
            return;
        }

        const [x, y] = d3.mouse(containerRef.current);
        const time = Math.round(axesRef.current.xScale.invert(x - margin.left));
        const [lower, upper] = boundingPoints(datum, time);

        // Use D3 to select element, change color and size
        d3.select<SVGPathElement, Datum>(segment)
            .attr('stroke', lineStyle.highlightColor)
            .attr('stroke-width', lineStyle.highlightWidth)
            ;

        // create the rounded rectangle for the tooltip's background
        const rect = d3.select<SVGSVGElement | null, any>(containerRef.current)
            .append<SVGRectElement>('rect')
            .attr('id', `r${time}-${seriesName}-${chartId.current}`)
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
            .attr('id', `tn${time}-${seriesName}-${chartId.current}`)
            .attr('class', 'tooltip')
            .attr('fill', tooltipRef.current.fontColor)
            .attr('font-family', 'sans-serif')
            .attr('font-size', tooltipRef.current.fontSize)
            .attr('font-weight', tooltipRef.current.fontWeight)
            .text(() => seriesName)
            ;

        // create the table that shows the points that come before and after the mouse time, and the
        // changes in the time and value
        const table = d3.select<SVGSVGElement | null, any>(containerRef.current)
            .append("g")
            .attr('id', `t${time}-${seriesName}-header-${chartId.current}`)
            .attr('class', 'tooltip')
            .attr('fill', tooltipRef.current.fontColor)
            .attr('font-family', 'sans-serif')
            .attr('font-size', tooltipRef.current.fontSize + 2)
            .attr('font-weight', tooltipRef.current.fontWeight + 150)
            ;

        const headerRow = table.append('g').attr('font-weight', tooltipRef.current.fontWeight + 550);
        const hrLower = headerRow.append<SVGTextElement>("text").text(() => 'before');
        const hrUpper = headerRow.append<SVGTextElement>("text").text(() => 'after');
        const hrDelta = headerRow.append<SVGTextElement>("text").text(() => '∆');

        const trHeader = table.append<SVGTextElement>("text").text(() => 't (ms)');
        const trLower = table.append<SVGTextElement>("text").text(() => formatTime(lower[0]));
        const trUpper = table.append<SVGTextElement>("text").text(() => formatTime(upper[0]));
        const trDelta = table.append<SVGTextElement>("text").text(() => formatTimeChange(lower[0], upper[0]));

        const vrHeader = table.append<SVGTextElement>("text").text(() => tooltipValueLabel);
        const vrLower = table.append<SVGTextElement>("text").text(() => formatValue(lower[1]));
        const vrUpper = table.append<SVGTextElement>("text").text(() => formatValue(upper[1]));
        const vrDelta = table.append<SVGTextElement>("text").text(() => formatValueChange(lower[1], upper[1]));

        const textWidthOf = (elem: TextSelection) => elem.node()?.getBBox()?.width || 0;
        const textHeightOf = (elem: TextSelection) => elem.node()?.getBBox()?.height || 0;
        const spacesWidthFor = (spaces: number) => spaces * textWidthOf(hrLower) / 5;

        // calculate the max width and height of the text
        const tooltipWidth = Math.max(textWidthOf(header), spacesWidthFor(33));
        const headerTextHeight = textHeightOf(header);
        const headerRowHeight = textHeightOf(hrLower);
        const timeRowHeight = textHeightOf(trHeader);
        const valueRowHeight = textHeightOf(vrHeader);
        const textHeight = headerTextHeight + headerRowHeight + timeRowHeight + valueRowHeight;

        // set the header text location
        const xTooltip = tooltipX(x, tooltipWidth, plotDimRef.current) + tooltipRef.current.paddingLeft;
        const yTooltip = tooltipY(y, textHeight, plotDimRef.current) + tooltipRef.current.paddingTop;
        header
            .attr('x', () => xTooltip)
            .attr('y', () => yTooltip - (headerRowHeight + timeRowHeight + valueRowHeight) + textHeight)
            ;

        const hrRowY = yTooltip + headerTextHeight + headerRowHeight;
        const hrLowerX = spacesWidthFor(14);
        const hrUpperX = spacesWidthFor(24);
        const hrDeltaX = spacesWidthFor(32);
        hrLower.attr('x', () => xTooltip + hrLowerX - textWidthOf(hrLower)).attr('y', () => hrRowY);
        hrUpper.attr('x', () => xTooltip + hrUpperX - textWidthOf(hrUpper)).attr('y', () => hrRowY);
        hrDelta.attr('x', () => xTooltip + hrDeltaX - textWidthOf(hrDelta)).attr('y', () => hrRowY);

        const trRowY = hrRowY + timeRowHeight;
        trHeader.attr('x', () => xTooltip).attr('y', () => trRowY);
        trLower.attr('x', () => xTooltip + hrLowerX - textWidthOf(trLower)).attr('y', () => trRowY);
        trUpper.attr('x', () => xTooltip + hrUpperX - textWidthOf(trUpper)).attr('y', () => trRowY);
        trDelta.attr('x', () => xTooltip + hrDeltaX - textWidthOf(trDelta)).attr('y', () => trRowY);

        const vrRowY = trRowY + valueRowHeight;
        vrHeader.attr('x', () => xTooltip).attr('y', () => vrRowY);
        vrLower.attr('x', () => xTooltip + hrLowerX - textWidthOf(vrLower)).attr('y', () => vrRowY);
        vrUpper.attr('x', () => xTooltip + hrUpperX - textWidthOf(vrUpper)).attr('y', () => vrRowY);
        vrDelta.attr('x', () => xTooltip + hrDeltaX - textWidthOf(vrDelta)).attr('y', () => vrRowY);

        // set the position, width, and height of the tooltip rect based on the text height and width and the padding
        rect.attr('x', () => tooltipX(x, tooltipWidth, plotDimRef.current))
            .attr('y', () => tooltipY(y, textHeight, plotDimRef.current))
            .attr('width', tooltipWidth + tooltipRef.current.paddingLeft + tooltipRef.current.paddingRight)
            .attr('height', textHeight + tooltipRef.current.paddingTop + tooltipRef.current.paddingBottom)
            ;
    }

    function formatNumber(value: number, format: string): string {
        return isNaN(value) ? '---' : d3.format(format)(value);
    }

    function formatTime(value: number): string {
        return formatNumber(value, " ,.0f");
    }

    function formatValue(value: number): string {
        return formatNumber(value, " ,.3f");
    }

    function formatChange(v1: number, v2: number, format: string): string {
        return isNaN(v1) || isNaN(v2) ? '---' : d3.format(format)(v2 - v1);
    }

    function formatTimeChange(v1: number, v2: number): string {
        return formatChange(v1, v2, " ,.0f");
    }

    function formatValueChange(v1: number, v2: number): string {
        return formatChange(v1, v2, " ,.3f");
    }

    /**
     * Calculates the x-coordinate of the lower left-hand side of the tooltip rectangle (obviously without
     * "rounded corners"). Adjusts the x-coordinate so that tooltip is visible on the edges of the plot.
     * @param {number} x The current x-coordinate of the mouse
     * @param {number} textWidth The width of the tooltip text
     * @param {PlotDimensions} plotDimensions The dimensions of the plot
     * @return {number} The x-coordinate of the lower left-hand side of the tooltip rectangle
     */
    function tooltipX(x: number, textWidth: number, plotDimensions: PlotDimensions): number {
        if (x + textWidth + tooltip.paddingLeft + 10 > plotDimensions.width + margin.left) {
            return x - textWidth - tooltip.paddingRight - margin.right;
        }
        return x + tooltip.paddingLeft;
    }

    /**
     * Calculates the y-coordinate of the lower-left-hand corner of the tooltip rectangle. Adjusts the y-coordinate
     * so that the tooltip is visible on the upper edge of the plot
     * @param {number} y The y-coordinate of the series
     * @param {number} textHeight The height of the header and neuron ID text
     * @param {PlotDimensions} plotDimensions The dimensions of the plot
     * @return {number} The y-coordinate of the lower-left-hand corner of the tooltip rectangle
     */
    function tooltipY(y: number, textHeight: number, plotDimensions: PlotDimensions): number {
        return y + margin.top - tooltip.paddingBottom - textHeight - tooltip.paddingTop;
    }

    /**
     * Removes the tooltip when the mouse has moved away from the spike
     * @param {SVGPathElement} [segment] The SVG line element representing the spike, over which the mouse is hovering.
     * @param {string} [seriesName] The optional name of the series
     */
    function handleHideTooltip(segment?: SVGPathElement, seriesName?: string) {
        if (segment && seriesName) {
            d3.select<SVGPathElement, Datum>(segment)
                .attr('stroke', colorsRef.current.get(seriesName) || lineStyle.color)
                .attr('stroke-width', lineStyle.lineWidth)
                ;
        }

        d3.selectAll<SVGPathElement, Datum>('.tooltip').remove();
    }

    /**
     * Callback when the mouse tracker is to be shown
     * @param {Selection<SVGLineElement, Datum, null, undefined> | undefined} path
     */
    function handleShowTracker(path: Selection<SVGLineElement, Datum, null, undefined> | undefined) {
        if (containerRef.current && path) {
            const [x, y] = d3.mouse(containerRef.current);
            path
                .attr('x1', x)
                .attr('x2', x)
                .attr('opacity', () => mouseInPlotArea(x, y) ? 1 : 0)
                ;

            const label = d3.select<SVGTextElement, any>(`#scatter-chart-tracker-time-${chartId.current}`)
                .attr('opacity', () => mouseInPlotArea(x, y) ? 1 : 0)
                .text(() => `${d3.format(",.0f")(axesRef.current!.xScale.invert(x - margin.left))} ms`)


            const labelWidth = textWidthOf(label);
            label.attr('x', Math.min(plotDimRef.current.width + margin.left - labelWidth, x))
        }
    }

    /**
     * Called when the magnifier is enabled to set up the vertical bar magnifier lens
     * @param {SvgSelection | undefined} svg The path selection
     * holding the magnifier whose properties need to be updated.
     */
    function handleShowMagnify(svg: SvgSelection | undefined) {

        const path: MagnifierSelection = svg!.select('.magnifier');

        /**
         * Determines whether specified datum is in the time interval centered around the current
         * mouse position
         * @param {[number, number]} datum The datum represented in x-coordinates (i.e. screen rather than time)
         * @param {[number, number]} mouse The (x, y)-coordinate of the current mouse position
         * @param {number} radius The pixel interval for which transformations are applied
         * @return {boolean} `true` if the datum is in the interval; `false` otherwise
         */
        function inMagnifier(datum: [number, number], mouse: [number, number], radius: number): boolean {
            const dx = mouse[0] - datum[0];
            const dy = mouse[1] - datum[1];
            return Math.sqrt(dx * dx + dy * dy) < radius;
        }

        /**
         *
         * @param {[number, number]} datum The (time, value) pair
         * @param {[number, number]} mouse The mouse cursor position
         * @param {number} radius The extent of the magnifier lens
         * @param {RadialMagnifier} magnifier The bar magnifier function
         * @param {ScaleLinear<number, number>} xScale The xScale to convert from data coordinates to screen coordinates
         * @param {ScaleLinear<number, number>} yScale The xScale to convert from data coordinates to screen coordinates
         * @return {Array<MagnifiedData>} The transformed paths
         */
        function magnify(datum: [number, number],
            mouse: [number, number],
            radius: number,
            magnifier: RadialMagnifier,
            xScale: ScaleLinear<number, number>,
            yScale: ScaleLinear<number, number>): [number, number] {
            const datumX = xScale(datum[0]);
            const datumY = yScale(datum[1]);
            if (inMagnifier([datumX + margin.left, datumY + margin.top], mouse, radius)) {
                const transform = magnifier.magnify(datumX, datumY);
                return [transform.xPrime, transform.yPrime];
            }
            return [datumX, datumY];
        }

        // create the lens
        if (containerRef.current && path && svg) {
            const [x, y] = d3.mouse(containerRef.current);
            const isMouseInPlotArea = mouseInPlotArea(x, y)
            path
                .attr('r', magnifier.radius)
                .attr('cx', x)
                .attr('cy', y)
                .attr('opacity', () => isMouseInPlotArea ? 1 : 0)
                ;

            const xScale = axesRef.current!.xAxisGenerator.scale<ScaleLinear<number, number>>();
            const yScale = axesRef.current!.yAxisGenerator.scale<ScaleLinear<number, number>>();

            if (isMouseInPlotArea) {
                const radialMagnifier: RadialMagnifier = radialMagnifierWith(
                    magnifier.radius,
                    magnifier.magnification,
                    [x - margin.left, y - margin.top]
                );
                mainGRef.current!
                    .selectAll<SVGSVGElement, Array<[number, number]>>('.time-series-lines')
                    .attr("d", data => {
                        const magnified = data
                            .map(datum => magnify(datum, [x, y], magnifier.radius, radialMagnifier, xScale, yScale));
                        return d3.line()(magnified);
                    })
                    ;

                svg
                    .select(`#x-lens-axis-${chartId.current}`)
                    .attr('x1', x - magnifier.radius)
                    .attr('x2', x + magnifier.radius)
                    .attr('y1', y)
                    .attr('y2', y)
                    .attr('opacity', 0.3)
                    ;

                svg
                    .select(`#y-lens-axis-${chartId.current}`)
                    .attr('x1', x)
                    .attr('x2', x)
                    .attr('y1', y - magnifier.radius)
                    .attr('y2', y + magnifier.radius)
                    .attr('opacity', 0.3)
                    ;

                const axesMagnifier: RadialMagnifier = radialMagnifierWith(magnifier.radius, magnifier.magnification, [x, y]);
                magnifierXAxisRef.current!
                    .attr('stroke', magnifier.color)
                    .attr('stroke-width', magnifier.lineWidth)
                    .attr('opacity', 0.75)
                    .attr('x1', datum => axesMagnifier.magnify(x + datum * magnifier.radius / 5, y).xPrime)
                    .attr('x2', datum => axesMagnifier.magnify(x + datum * magnifier.radius / 5, y).xPrime)
                    .attr('y1', y)
                    .attr('y2', datum => axesMagnifier.magnify(x, y + magnifier.radius * (1 - Math.abs(datum / 5)) / 40).yPrime + 5)
                    ;

                magnifierXAxisLabelRef.current!
                    .attr('x', datum => axesMagnifier.magnify(x + datum * magnifier.radius / 5, y).xPrime - 12)
                    .attr('y', datum => axesMagnifier.magnify(x, y + magnifier.radius * (1 - Math.abs(datum / 5)) / 30).yPrime + 20)
                    .text(datum => Math.round(xScale.invert(x - margin.left + datum * magnifier.radius / 5)))
                    ;

                magnifierYAxisRef.current!
                    .attr('stroke', magnifier.color)
                    .attr('stroke-width', magnifier.lineWidth)
                    .attr('opacity', 0.75)
                    .attr('x1', datum => axesMagnifier.magnify(x - magnifier.radius * (1 - Math.abs(datum / 5)) / 40, y).xPrime - 2)
                    .attr('x2', datum => axesMagnifier.magnify(x + magnifier.radius * (1 - Math.abs(datum / 5)) / 40, y).xPrime + 2)
                    .attr('y1', datum => axesMagnifier.magnify(x, y + datum * magnifier.radius / 5).yPrime)
                    .attr('y2', datum => axesMagnifier.magnify(x, y + datum * magnifier.radius / 5).yPrime)
                    ;

                magnifierYAxisLabelRef.current!
                    .attr('x', datum => axesMagnifier.magnify(x + magnifier.radius * (1 - Math.abs(datum / 5)) / 40, y).xPrime + 10)
                    .attr('y', datum => axesMagnifier.magnify(x, y + datum * magnifier.radius / 5).yPrime - 2)
                    .text(datum => formatValue(yScale.invert(y - margin.top + datum * magnifier.radius / 5)))
                    ;
            }
            else {
                mainGRef.current!
                    .selectAll<SVGSVGElement, Array<[number, number]>>('.time-series-lines')
                    .attr("d", data => {
                        const magnified: TimeSeries = data
                            .map(([x, y]) => [xScale(x), yScale(y)]);
                        return d3.line()(magnified);
                    })
                    ;

                svg.select(`#x-lens-axis-${chartId.current}`).attr('opacity', 0);
                svg.select(`#y-lens-axis-${chartId.current}`).attr('opacity', 0);
                magnifierXAxisRef.current!.attr('opacity', 0);
                magnifierXAxisLabelRef.current!.text(() => '')
                magnifierYAxisRef.current!.attr('opacity', 0);
                magnifierYAxisLabelRef.current!.text(() => '')
            }
        }
    }

    /**
     * Calculates whether the mouse is in the plot-area
     * @param {number} x The x-coordinate of the mouse's position
     * @param {number} y The y-coordinate of the mouse's position
     * @return {boolean} `true` if the mouse is in the plot area; `false` if the mouse is not in the plot area
     */
    function mouseInPlotArea(x: number, y: number): boolean {
        return x > margin.left && x < width.current - margin.right && y > margin.top && y < height - margin.bottom;
    }

    /**
     * Creates the SVG elements for displaying a radial magnifier lens on the data
     * @param {SvgSelection} svg The SVG selection
     * @param {boolean} visible `true` if the lens is visible; `false` otherwise
     * @return {MagnifierSelection | undefined} The magnifier selection if visible; otherwise undefined
     */
    function magnifierLens(svg: SvgSelection, visible: boolean): MagnifierSelection | undefined {
        if (visible && magnifierRef.current === undefined) {
            const radialGradient = svg
                .append<SVGDefsElement>('defs')
                .append<SVGLinearGradientElement>('radialGradient')
                .attr('id', `radial-magnifier-gradient-${chartId.current}`)
                .attr('cx', '47%')
                .attr('cy', '47%')
                .attr('r', '53%')
                .attr('fx', '25%')
                .attr('fy', '25%')
                ;

            radialGradient
                .append<SVGStopElement>('stop')
                .attr('offset', '0%')
                .attr('stop-color', borderColor)
                ;

            radialGradient
                .append<SVGStopElement>('stop')
                .attr('offset', '30%')
                .attr('stop-color', tooltip.backgroundColor)
                .attr('stop-opacity', 0)
                ;

            radialGradient
                .append<SVGStopElement>('stop')
                .attr('offset', '70%')
                .attr('stop-color', tooltip.backgroundColor)
                .attr('stop-opacity', 0)
                ;

            radialGradient
                .append<SVGStopElement>('stop')
                .attr('offset', '100%')
                .attr('stop-color', borderColor)
                ;

            const magnifierSelection = svg
                .append<SVGCircleElement>('circle')
                .attr('class', 'magnifier')
                .style('fill', `url(#radial-magnifier-gradient-${chartId.current})`)
                ;

            // create the lens axes', ticks and tick labels. the labels hold the time and values of the
            // current mouse location
            createMagnifierLensAxisLine(`x-lens-axis-${chartId.current}`, svg);
            createMagnifierLensAxisLine(`y-lens-axis-${chartId.current}`, svg);

            const lensTickIndexes = d3.range(-5, 6, 1);
            const lensLabelIndexes = [-5, -1, 0, 1, 5];

            const xLensAxisTicks = svg.append('g').attr('id', `x-lens-axis-ticks-${chartId.current}`);
            magnifierXAxisRef.current = magnifierLensAxisTicks('x-lens-ticks', lensTickIndexes, xLensAxisTicks);
            magnifierXAxisLabelRef.current = magnifierLensAxisLabels(lensLabelIndexes, xLensAxisTicks);

            const yLensAxisTicks = svg.append('g').attr('id', `y-lens-axis-ticks-${chartId.current}`);
            magnifierYAxisRef.current = magnifierLensAxisTicks('y-lens-ticks', lensTickIndexes, yLensAxisTicks);
            magnifierYAxisLabelRef.current = magnifierLensAxisLabels(lensLabelIndexes, yLensAxisTicks);

            svg.on('mousemove', () => handleShowMagnify(svg));

            return magnifierSelection;
        }
        // if the magnifier was defined, and is now no longer defined (i.e. props changed, then remove the magnifier)
        else if ((!visible && magnifierRef.current) || tooltipRef.current.visible) {
            svg.on('mousemove', () => null);
            return undefined;
        }
        else if (visible && magnifierRef.current) {
            svg.on('mousemove', () => handleShowMagnify(svg));
        }
        return magnifierRef.current;
    }

    /**
     * Creates a magnifier lens axis svg node and appends it to the specified svg selection
     * @param {string} className The class name of the svg line line
     * @param {SvgSelection} svg The svg selection to which to add the axis line
     */
    function createMagnifierLensAxisLine(className: string, svg: SvgSelection): void {
        svg
            .append('line')
            .attr('id', className)
            .attr('stroke', magnifier.color)
            .attr('stroke-width', magnifier.lineWidth)
            .attr('opacity', 0)
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
            .attr('stroke', magnifier.color)
            .attr('stroke-width', magnifier.lineWidth)
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
     * @return {TrackerSelection | undefined} The tracker selection if visible; otherwise undefined
     */
    function trackerControl(svg: SvgSelection, visible: boolean): TrackerSelection | undefined {
        if (visible && trackerRef.current === undefined) {
            const trackerLine = svg
                .append<SVGLineElement>('line')
                .attr('class', 'tracker')
                .attr('y1', margin.top)
                .attr('y2', plotDimRef.current.height)
                .attr('stroke', tracker.color)
                .attr('stroke-width', tracker.lineWidth)
                .attr('opacity', 0) as Selection<SVGLineElement, Datum, null, undefined>
                ;

            // create the text element holding the tracker time
            svg
                .append<SVGTextElement>('text')
                .attr('id', `scatter-chart-tracker-time-${chartId.current}`)
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
        else if ((!visible && trackerRef.current) || tooltipRef.current.visible) {
            svg.on('mousemove', () => null);
            return undefined;
        } else if (visible && trackerRef.current) {
            svg.on('mousemove', () => handleShowTracker(trackerRef.current));
        }
        return trackerRef.current;
    }

    /**
     * Updates the plot data for the specified time-range, which may have changed due to zoom or pan
     * @param {TimeRange} timeRange The current time range
     * @param {PlotDimensions} plotDimensions The dimensions of the plot
     */
    function updatePlot(timeRange: TimeRangeType, plotDimensions: PlotDimensions): void {
        // tooltipRef.current = tooltip;
        timeRangeRef.current = timeRange;

        if (containerRef.current && axesRef.current) {
            // select the text elements and bind the data to them
            const svg = d3.select<SVGSVGElement, any>(containerRef.current);

            // create the tensor of data (time, value)
            const data: Array<Array<[number, number]>> = Array
                .from(liveDataRef.current.values())
                .map(series => selectInTimeRange(series));

            // calculate and update the min and max values for updating the y-axis. only updates when
            // the min is less than the historical min, and the max is larger than the historical max.
            const [minValue, maxValue] = calcMinMaxValues(data);
            minValueRef.current = minValue;
            maxValueRef.current = maxValue;

            // create the x-axis
            axesRef.current.xScale
                .domain([timeRangeRef.current.start, timeRangeRef.current.end])
                .range([0, plotDimensions.width]);
            axesRef.current.xAxisSelection.call(axesRef.current.xAxisGenerator);

            svg
                .select(`#scatter-chart-x-axis-label-${chartId.current}`)
                .attr('transform', `translate(${margin.left + plotDimensions.width / 2}, ${plotDimensions.height + margin.top + (margin.bottom / 3)})`);

            // create the y-axis
            axesRef.current.yScale.domain([Math.max(minY, minValue), Math.min(maxY, maxValue)]);
            axesRef.current.yAxisSelection.call(axesRef.current.yAxisGenerator);

            // create/update the magnifier lens if needed
            magnifierRef.current = magnifierLens(svg, magnifier.visible);

            // create/update the tracker line if needed
            trackerRef.current = trackerControl(svg, tracker.visible);

            // set up the main <g> container for svg and translate it based on the margins, but do it only
            // once
            if (mainGRef.current === undefined) {
                mainGRef.current = svg
                    .attr('width', width.current)
                    .attr('height', height)
                    .attr('color', axisStyle.color)
                    .append<SVGGElement>('g')
                    ;
            }

            // set up panning
            const drag = d3.drag<SVGSVGElement, Datum>()
                .on("start", () => {
                    // during a pan, we want to hide the tooltip
                    tooltipRef.current.visible = false;
                    handleHideTooltip();
                    d3.select(containerRef.current).style("cursor", "move");
                })
                .on("drag", () => onPan(d3.event.dx, plotDimensions))
                .on("end", () => {
                    // if the tooltip was originally visible, then allow it to be seen again
                    tooltipRef.current.visible = tooltip.visible;
                    d3.select(containerRef.current).style("cursor", "auto")
                })
                ;

            svg.call(drag);

            // set up for zooming
            const zoom = d3.zoom<SVGSVGElement, Datum>()
                .scaleExtent([0, 10])
                .translateExtent([[margin.left, margin.top], [width.current - margin.right, height - margin.bottom]])
                .on("zoom", () => {
                    onZoom(d3.event.transform, d3.event.sourceEvent.offsetX - margin.left, plotDimensions);
                })
                ;

            svg.call(zoom);

            // remove the old clipping region and add a new one with the updated plot dimensions
            svg.select('defs').remove();
            svg
                .append('defs')
                .append("clipPath")
                .attr("id", `clip-series-${chartId.current}`)
                .append("rect")
                .attr("width", plotDimensions.width)
                .attr("height", plotDimensions.height - margin.top)
                ;

            liveDataRef.current.forEach((series, name) => {
                const data = selectInTimeRange(series);

                if (data.length === 0) return;

                // only show the data for which the filter matches
                // const plotData = (series.name.match(seriesFilterRef.current)) ? data : [];
                const plotData = (name.match(seriesFilterRef.current)) ? data : [];

                // create the time-series paths
                mainGRef.current!
                    .selectAll(`#${series.name}`)
                    .data([[], plotData], () => `${series.name}`)
                    .join(
                        enter => enter
                            .append("path")
                            .attr("class", 'time-series-lines')
                            .attr("id", `${series.name}`)
                            .attr("d", d3.line()
                                .x((d: [number, number]) => axesRef.current!.xScale(d[0]))
                                .y((d: [number, number]) => axesRef.current!.yScale(d[1]))
                            )
                            .attr("fill", "none")
                            // .attr("stroke", lineStyle.color)
                            .attr("stroke", colorsRef.current.get(series.name) || lineStyle.color)
                            .attr("stroke-width", lineStyle.lineWidth)
                            .attr('transform', `translate(${margin.left}, ${margin.top})`)
                            .attr("clip-path", `url(#clip-series-${chartId.current})`)
                            .on(
                                "mouseover",
                                (datumArray, i, group) =>
                                    tooltipRef.current.visible ? handleShowTooltip(datumArray, series.name, group[i]) : null
                            )
                            .on(
                                "mouseleave",
                                (datumArray, i, group) =>
                                    tooltipRef.current.visible ? handleHideTooltip(group[i], series.name) : null
                            ),
                        update => update,
                        exit => exit.remove()
                    );
            });
        }
    }

    /**
     * Returns the data in the time-range and the datum that comes just before the start of the time range.
     * The point before the time range is so that the line draws up to the y-axis, where it is clipped.
     * @param {Series} series The series
     * @return {TimeSeries} An array of (time, value) points that fit within the time range,
     * and the point just before the time range.
     */
    function selectInTimeRange(series: Series): TimeSeries {

        function inTimeRange(datum: Datum, index: number, array: Datum[]): boolean {
            // also want to include the point whose next value is in the time range
            const nextDatum = array[Math.min(index + 1, array.length - 1)];
            return nextDatum.time >= timeRangeRef.current.start && datum.time <= timeRangeRef.current.end;
        }

        return series.data
            .filter((datum: Datum, index: number, array: Datum[]) => inTimeRange(datum, index, array))
            .map(datum => [datum.time, datum.value]);
    }

    /**
     * Subscribes to the observable that streams chart events and hands the subscription a consumer
     * that updates the charts as events enter. Also hands the subscription back to the parent
     * component using the registered {@link onSubscribe} callback method from the properties.
     * @return {Subscription} The subscription (disposable) for cancelling
     */
    function subscribe(): Subscription {
        const subscription = seriesObservable
            .pipe(windowTime(windowingTime))
            .subscribe(dataList => {
                dataList.forEach(data => {
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
                    // liveDataRef.current = Array.from(seriesRef.current.values());
                    liveDataRef.current = seriesRef.current;
                    timeRangeRef.current = TimeRange(
                        Math.max(0, currentTimeRef.current - timeWindow),
                        Math.max(currentTimeRef.current, timeWindow)
                    )
                }).then(() => {
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
                height: height
            }}
            ref={containerRef}
        />
    );
}

/**
 * Constructs a spectrum of colors, one for each time-series, starting with the `startColor` and interpolating
 * to the `stopColor`.
 * @param {Array<Series>} series The array holding the time-series
 * @param {string} startColor The "start" color for the interpolation
 * @param {string} stopColor The "stop" color for the interpolation
 * @return {Map<string, string>} A map of the series name and associated colors
 */
export function seriesColorsFor(series: Array<Series>, startColor: string, stopColor: string): Map<string, string> {
    return new Map(d3
        .quantize(d3.interpolateHcl(startColor, stopColor), series.length)
        .map((color, index) => [series[index].name, color]) as Array<[string, string]>
    );
}
