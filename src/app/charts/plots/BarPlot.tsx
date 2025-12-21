import {AxesAssignment, setClipPath} from "./plot";
import * as d3 from "d3";
import {noop} from "../utils";
import {useChart} from "../hooks/useChart";
import React, {useCallback, useEffect, useRef} from "react";
import {Datum, TimeSeries} from "../series/timeSeries";
import {GSelection, SvgSelection} from "../d3types";
import {BaseAxis, CategoryAxis, ContinuousNumericAxis} from "../axes/axes";
import {Subscription} from "rxjs";
import {Margin} from "../styling/margins";
import {subscriptionOrdinalXFor, WindowedOrdinalStats} from "../subscriptions/subscriptions";
import {useDataObservable} from "../hooks/useDataObservable";
import {usePlotDimensions} from "../hooks/usePlotDimensions";
import {useInitialData} from "../hooks/useInitialData";
import {copyValueStatsForSeries, OrdinalChartData, OrdinalStats} from "../observables/ordinals";
import {BaseSeries} from "../series/baseSeries";
import {calculateOrdinalStats, OrdinalDatum, OrdinalSeries} from "../series/ordinalSeries";
import {
    applyFillStylesTo,
    applyStrokeStylesTo,
    STROKE_COLOR,
    STROKE_OPACITY,
    STROKE_WIDTH,
    SvgFillStyle,
    SvgStrokeStyle
} from "../styling/svgStyle";
import {BarSeriesStyle, BarStyle, defaultBarSeriesStyle, LineStyle} from "../styling/barPlotStyle";
import {TooltipData} from "../hooks/useTooltip";

// typescript doesn't support enums with computed string values, even though they are all constants...
export type BarChartElementId = {
    readonly currentValue: string
    readonly meanValue: string
    readonly minMax: string
    readonly windowedMeanValue: string
    readonly windowedMinMax: string
}

const STREAM_CHARTS_BAR_CHART_ID = 'stream-charts-bar-chart'

// elements of the bar-chart
const BAR_CHART_CLASS_IDS: BarChartElementId = {
    currentValue: STREAM_CHARTS_BAR_CHART_ID + '-value-lines',
    meanValue: STREAM_CHARTS_BAR_CHART_ID + '-mean-value-lines',
    minMax: STREAM_CHARTS_BAR_CHART_ID + '-min-max-bars',
    windowedMeanValue: STREAM_CHARTS_BAR_CHART_ID + '-windowed-mean-value-lines',
    windowedMinMax: STREAM_CHARTS_BAR_CHART_ID + '-windowed-mean-bars'
}

const classIdFor = (id: string) => '.' + id

// constants identifying the bar-chart elements for which mouse-over/mouse-leave events are defined
const TOOLTIP_PROVIDER_ID = STREAM_CHARTS_BAR_CHART_ID + '-tooltip-provider'

export const BAR_CHART_TOOLTIP_PROVIDER_IDS: BarChartElementId = {
    currentValue: TOOLTIP_PROVIDER_ID + '-current-value',
    meanValue: TOOLTIP_PROVIDER_ID + '-mean-value',
    minMax: TOOLTIP_PROVIDER_ID + '-min-max',
    windowedMeanValue: TOOLTIP_PROVIDER_ID + '-windowed-min-max',
    windowedMinMax: TOOLTIP_PROVIDER_ID + '-windowed-mean'
}

interface Props {
    /**
     * Holds the mapping between a series and the axis it uses (is assigned). The
     * map's key holds the series name, and the value is an {@link AxesAssignment}
     * object holding the ID of the assigned x-axis and y-axis.
     */
    axisAssignments?: Map<string, AxesAssignment>
    showMinMaxBars?: boolean
    showWindowedMinMaxBars?: boolean
    showValueLines?: boolean
    showMeanValueLines?: boolean
    showWindowedMeanValueLines?: boolean
    /**
     * The number of milliseconds worth of data to hold in memory before dropping it. Defaults to
     * infinity (i.e. no data is dropped)
     */
    dropDataAfter?: number
    // /**
    //  * Enables panning (default is false)
    //  */
    // panEnabled?: boolean
    // /**
    //  * Enables zooming (default is false)
    //  */
    // zoomEnabled?: boolean
    // /**
    //  * When true, requires that the shift or control key be pressed while scrolling
    //  * in order to activate the zoom
    //  */
    // zoomKeyModifiersRequired?: boolean
    /**
     * The (optional, default = 2 pixels) top and bottom margin (in pixels) for the spike lines in the plot.
     * Margins on individual series can also be set through the {@link Chart.seriesStyles} property.
     */
    barMargin?: number
    /**
     * The (optional) default style for the bar series that are used if no other styles are specified
     */
    barSeriesStyle?: BarSeriesStyle
}

/**
 * Renders a streaming bar plot for the series in the initial data and those sourced by the
 * observable specified as a property in the {@link Chart}. This component uses the {@link useChart}
 * hook, and therefore must be a child of the {@link Chart} to be plugged in to the
 * chart ecosystem (axes, tracker, tooltip).
 *
 * For a relatively complete example of how to use this plot component, see the
 * <a href="https://github.com/robphilipp/stream-charts-examples">`StreamingBarChart` example</a>
 *
 * @param props The properties associated with the bar plot
 * @constructor
 * @example
 * ```typescript
 * <BarPlot
 *     barMargin={1}
 *     dropDataAfter={5000}
 *     // panEnabled={true}
 *     // zoomEnabled={true}
 *     // zoomKeyModifiersRequired={true}
 *     // withCadenceOf={50}
 *
 *     showMinMaxBars={showMinMax}
 *     showValueLines={showValue}
 *     showMeanValueLines={showMean}
 *     showWindowedMinMaxBars={showWinMinMax}
 *     showWindowedMeanValueLines={showWinMean}
 * />
 * ```
 */
export function BarPlot(props: Props): null {
    const {
        chartId,
        container,
        mainG,
        axes,
        color,
        seriesStyles,
        seriesFilter,
        mouse
    } = useChart<OrdinalDatum, BarSeriesStyle, WindowedOrdinalStats>()

    const {
        xAxesState,
        yAxesState,
        setAxisAssignments,
        // setAxisBoundsFor,
        // updateAxesBounds = noop,
        // onUpdateAxesBounds,
    } = axes

    const {mouseOverHandlerFor, mouseLeaveHandlerFor} = mouse

    const {plotDimensions, margin} = usePlotDimensions()

    const {
        seriesObservable,
        windowingTime = 100,
        shouldSubscribe,

        onSubscribe = noop,
        onUpdateData,
        onUpdateChartTime = noop
    } = useDataObservable<OrdinalChartData, OrdinalDatum>()

    const {initialData} = useInitialData<OrdinalChartData, OrdinalDatum>()

    const {
        axisAssignments = new Map<string, AxesAssignment>(),
        dropDataAfter = Infinity,
        // panEnabled = false,
        // zoomEnabled = false,
        // zoomKeyModifiersRequired = true,
        showMinMaxBars = true,
        showWindowedMinMaxBars = true,
        showValueLines = true,
        showMeanValueLines = true,
        showWindowedMeanValueLines = true,
        barMargin = 2,
        barSeriesStyle = defaultBarSeriesStyle()
    } = props

    // why do "dataRef" and "seriesRef" both hold on to the same underlying data? for performance.
    //
    // the "dataRef" and "seriesRef" both point to the same underlying data, a collection
    // of series. The series in "dataRef" are bound to the DOM elements through d3. The "seriesRef" series
    // are the ones that are updated as new data is streamed in.
    //
    // the "dataRef" object holds on to a copy of the initial data (which is an array of
    // time-series, e.i. an array of BaseSeries<OrdinalDatum> objects). The slice just creates a copy of
    // the array, but the references to the BaseSeries objects are the same and still point to the same
    // data as the "initialData" array.
    //
    // the "seriesRef" object is a reference to a map (series_name -> BaseSeries<OrdinalDatum>) which is
    // used to update the data in the series. When new data enters, it is appended to one or more series.
    //
    // the series in the "dataRef" object are the ones bound to the DOM elements in d3, and so as these
    // are updated, d3 will update the DOM elements (the elements in this plot).
    const dataRef = useRef<Array<BaseSeries<OrdinalDatum>>>(initialData.slice())
    const seriesRef = useRef<Map<string, BaseSeries<OrdinalDatum>>>(
        new Map(initialData.map(series => [series.name, series]))
    )
    const statsRef = useRef<WindowedOrdinalStats>(initialOrdinalStats(dataRef.current))

    // map(axis_id -> current_time) -- maps the axis ID to the current time for that axis
    const currentTimeRef = useRef<number>(0)

    const subscriptionRef = useRef<Subscription>(undefined)

    const isSubscriptionClosed = () => subscriptionRef.current === undefined || subscriptionRef.current.closed

    const allowTooltipRef = useRef<boolean>(isSubscriptionClosed())

    useEffect(
        () => {
            currentTimeRef.current = 0
            // currentTimeRef.current = new Map(Array.from(xAxesState.axes.keys()).map(id => [id, 0]))
        },
        [xAxesState]
    )

    // set the axis assignments needed if a tooltip is being used
    useEffect(
        () => {
            setAxisAssignments(axisAssignments)
        },
        [axisAssignments, setAxisAssignments]
    )

    // // calculates the distinct series IDs that cover all the series in the plot
    // const axesForSeries = useMemo(
    //     () => axesForSeriesGen<Datum>(initialData, axisAssignments, xAxesState),
    //     [initialData, axisAssignments, xAxesState]
    // )

    // updates the timing using the onUpdateTime and updatePlot references. This and the references
    // defined above allow the axes' times to be updated properly by avoid stale reference to these
    // functions.
    const updateTimingAndPlot = useCallback(
        // (ranges: Map<string, ContinuousAxisRange>): void => {
        (): void => {
            if (mainG !== null) {
                // onUpdateTimeRef.current(ranges)
                updatePlotRef.current(mainG)
                onUpdateChartTime(currentTimeRef.current)
                // updatePlotRef.current(ranges, mainG)
                // if (onUpdateAxesBounds) {
                //     setTimeout(() => {
                //         const times = new Map<string, [number, number]>()
                //         ranges.forEach((range, name) => times.set(name, [range.start, range.end]))
                //         onUpdateAxesBounds(times)
                //     }, 0)
                // }
            }
        },
        [mainG, onUpdateChartTime]
        // [mainG, onUpdateAxesBounds]
    )

    // todo find better way
    // when the initial data changes, then reset the plot. note that the initial data doesn't change
    // during the normal course of updates from the observable, only when the plot is restarted.
    useEffect(
        () => {
            dataRef.current = initialData.slice()
            seriesRef.current = new Map(initialData.map(series => [series.name, series]))
            currentTimeRef.current = 0
            statsRef.current = initialOrdinalStats(dataRef.current)
            // currentTimeRef.current = new Map(Array.from(xAxesState.axes.keys()).map(id => [id, 0]))
            updateTimingAndPlot()
        },
        // ** not happy about this **
        // only want this effect to run when the initial data is changed, which mean all the
        // other dependencies are recalculated anyway.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [initialData]
    )

    // /**
    //  * Adjusts the time-range and updates the plot when the plot is dragged to the left or right
    //  * @param deltaX The amount that the plot is dragged
    //  * @param plotDimensions The dimensions of the plot
    //  * @param series An array of series names
    //  * @param ranges A map holding the axis ID and its associated time range
    //  */
    // const onPan = useCallback(
    //     (x: number,
    //      plotDimensions: Dimensions,
    //      series: Array<string>,
    //      ranges: Map<string, ContinuousAxisRange>
    //     ) => panHandler(axesForSeries, margin, setAxisBoundsFor, xAxesState)(x, plotDimensions, series, ranges),
    //     [axesForSeries, margin, setAxisBoundsFor, xAxesState]
    // )
    //
    // /**
    //  * Called when the user uses the scroll wheel (or scroll gesture) to zoom in or out. Zooms in/out
    //  * at the location of the mouse when the scroll wheel or gesture was applied.
    //  * @param transform The d3 zoom transformation information
    //  * @param x The x-position of the mouse when the scroll wheel or gesture is used
    //  * @param plotDimensions The dimensions of the plot
    //  * @param series An array of series names
    //  * @param ranges A map holding the axis ID and its associated time-range
    //  */
    // const onZoom = useCallback(
    //     (
    //         transform: ZoomTransform,
    //         x: number,
    //         plotDimensions: Dimensions,
    //         ranges: Map<string, ContinuousAxisRange>,
    //     ) => axisZoomHandler(axesForSeries, margin, setAxisBoundsFor, xAxesState)(transform, x, plotDimensions, ranges),
    //     [axesForSeries, margin, setAxisBoundsFor, xAxesState]
    // )

    /**
     * @param timeRanges
     * @param mainGElem
     */
    const updatePlot = useCallback(
        // (timeRanges: Map<string, ContinuousAxisRange>, mainGElem: GSelection) => {
        (mainGElem: GSelection) => {
            if (container) {
                // select the svg element bind the data to them
                const svg: SvgSelection = d3.select<SVGSVGElement, any>(container)

                // // set up panning
                // if (panEnabled) {
                //     const drag = d3.drag<SVGSVGElement, Datum>()
                //         .on("start", () => {
                //             d3.select(container).style("cursor", "move")
                //             allowTooltipRef.current = false
                //         })
                //         .on("drag", (event: any) => {
                //             const names = dataRef.current.map(series => series.name)
                //             onPan(event.dx, plotDimensions, names, timeRanges)
                //             // need to update the plot with the new time-ranges
                //             updatePlotRef.current(timeRanges, mainGElem)
                //         })
                //         .on("end", () => {
                //             d3.select(container).style("cursor", "auto")
                //             allowTooltipRef.current = isSubscriptionClosed()
                //         })
                //
                //     svg.call(drag)
                // }
                //
                // // set up for zooming
                // if (zoomEnabled) {
                //     const zoom = d3.zoom<SVGSVGElement, Datum>()
                //         .filter((event: any) => !zoomKeyModifiersRequired || event.shiftKey || event.ctrlKey)
                //         .scaleExtent([0, 10])
                //         .translateExtent([[margin.left, margin.top], [plotDimensions.width, plotDimensions.height]])
                //         .on("zoom", (event: any) => {
                //                 onZoom(
                //                     event.transform,
                //                     event.sourceEvent.offsetX - margin.left,
                //                     plotDimensions,
                //                     timeRanges,
                //                 )
                //                 updatePlotRef.current(timeRanges, mainGElem)
                //             }
                //         )
                //
                //     svg.call(zoom)
                // }

                // enter, update, delete the bar data
                dataRef.current.forEach(series => {
                    const [xAxis, yAxis] = axesFor(series.name, axisAssignments, xAxesState.axisFor, yAxesState.axisFor)

                    // grab the series styles, or the defaults if none exist
                    const {
                        margin: categoryMargin = barMargin,
                        valueLine: valueLineStyle,
                        meanValueLine: meanValueLineStyle,
                        windowedMeanValueLine: windowedMeanLineStyle,
                        minMaxBar: minMaxBarStyle,
                        windowedMinMaxBar: windowedBarStyle
                    } = seriesStyles.get(series.name) || {
                        ...barSeriesStyle,
                        highlightColor: barSeriesStyle.color
                    }

                    // only show the data for which the regex filter matches
                    const plotData = series.name.match(seriesFilter) ? [series.data[series.data.length - 1]] : []

                    // grab the functions for determining the lower and upper bounds of the category
                    const {
                        lower,
                        upper
                    } = xAxisCategoryBoundsFn(xAxis.categorySize, valueLineStyle.regular.width, categoryMargin)

                    // grab the value (index) associated with the series name (this is a category axis)
                    const x = xAxis.scale(series.name) || 0

                    //
                    // min/max bar rectangle
                    const totalBar = barDimensions(
                        minMaxBarStyle.widthFraction,
                        lower(x), upper(x),
                        statsRef.current.valueStatsForSeries.get(series.name)?.min.value || 0,
                        statsRef.current.valueStatsForSeries.get(series.name)?.max.value || 0,
                        yAxis
                    )

                    svg
                        .select<SVGGElement>(`#${series.name}-${chartId}-bar`)
                        .selectAll<SVGRectElement, PlotData>(classIdFor(BAR_CHART_CLASS_IDS.minMax))
                        .data(plotData)
                        .join(
                            enter => barFor(
                                enter.append<SVGRectElement>('rect').attr('class', BAR_CHART_CLASS_IDS.minMax),
                                totalBar,
                                barStyleFor(showMinMaxBars, minMaxBarStyle)
                            ),
                            update => barFor(
                                update,
                                totalBar,
                                barStyleFor(showMinMaxBars, minMaxBarStyle)
                            ),
                            exit => exit.remove()
                        )
                        .on(
                            "mouseover",
                            (event,) =>
                                handleMouseOverBar(
                                    container,
                                    yAxis,
                                    series,
                                    statsRef.current,
                                    event,
                                    margin,
                                    seriesStyles,
                                    barSeriesStyle,
                                    allowTooltipRef.current,
                                    mouseOverHandlerFor(`tooltip-${chartId}`, BAR_CHART_TOOLTIP_PROVIDER_IDS.minMax),
                                    BAR_CHART_TOOLTIP_PROVIDER_IDS.minMax
                                )
                        )
                        .on(
                            "mouseleave",
                            event => handleMouseLeaveSeries(
                                series.name,
                                event.currentTarget,
                                seriesStyles,
                                barSeriesStyle,
                                mouseLeaveHandlerFor(`tooltip-${chartId}`, BAR_CHART_TOOLTIP_PROVIDER_IDS.minMax),
                                BAR_CHART_TOOLTIP_PROVIDER_IDS.minMax
                            )
                        )

                    //
                    // windowed-mean line when the windowed stats are defined for the series
                    const seriesWindowedStats = statsRef.current.windowedValueStatsForSeries.get(series.name)
                    if (seriesWindowedStats !== undefined) {
                        const windowedBar = barDimensions(
                            windowedBarStyle.widthFraction,
                            lower(x), upper(x),
                            seriesWindowedStats.min.value, seriesWindowedStats.max.value,
                            yAxis
                        )

                        svg
                            .select<SVGGElement>(`#${series.name}-${chartId}-bar`)
                            .selectAll<SVGRectElement, PlotData>(classIdFor(BAR_CHART_CLASS_IDS.windowedMinMax))
                            .data(plotData)
                            .join(
                                enter => barFor(
                                    enter.append<SVGRectElement>('rect').attr('class', BAR_CHART_CLASS_IDS.windowedMinMax),
                                    windowedBar,
                                    barStyleFor(showWindowedMinMaxBars, windowedBarStyle)
                                ),
                                update => barFor(
                                    update,
                                    windowedBar,
                                    barStyleFor(showWindowedMinMaxBars, windowedBarStyle)                                ),
                                exit => exit.remove()
                            )
                            .on(
                                "mouseover",
                                (event,) =>
                                    handleMouseOverBar(
                                        container,
                                        yAxis,
                                        series,
                                        statsRef.current,
                                        event,
                                        margin,
                                        seriesStyles,
                                        barSeriesStyle,
                                        allowTooltipRef.current,
                                        mouseOverHandlerFor(`tooltip-${chartId}`, BAR_CHART_TOOLTIP_PROVIDER_IDS.windowedMinMax),
                                        BAR_CHART_TOOLTIP_PROVIDER_IDS.windowedMinMax
                                    )
                            )
                            .on(
                                "mouseleave",
                                event => handleMouseLeaveSeries(
                                    series.name,
                                    event.currentTarget,
                                    seriesStyles,
                                    barSeriesStyle,
                                    mouseLeaveHandlerFor(`tooltip-${chartId}`, BAR_CHART_TOOLTIP_PROVIDER_IDS.windowedMinMax),
                                    BAR_CHART_TOOLTIP_PROVIDER_IDS.windowedMinMax
                                )
                            )

                        //
                        // mean line
                        const meanLineY = yAxis.scale(statsRef.current.valueStatsForSeries.get(series.name)?.mean || 0)
                        svg
                            .select<SVGGElement>(`#${series.name}-${chartId}-bar`)
                            .selectAll<SVGLineElement, PlotData>(classIdFor(BAR_CHART_CLASS_IDS.meanValue))
                            .data(showMeanValueLines ? plotData : [])
                            .join(
                                enter => lineFor(
                                    enter.append<SVGLineElement>('line').attr('class', BAR_CHART_CLASS_IDS.meanValue),
                                    {
                                        x1: () => lower(x), y1: () => meanLineY,
                                        x2: () => upper(x), y2: () => meanLineY
                                    },
                                    meanValueLineStyle.regular
                                ),
                                update => lineFor(
                                    update,
                                    {
                                        x1: () => lower(x), y1: () => meanLineY,
                                        x2: () => upper(x), y2: () => meanLineY
                                    },
                                    meanValueLineStyle.regular
                                ),
                                exit => exit.remove()
                            )
                            .on(
                                "mouseover",
                                (event,) =>
                                    handleMouseOverBar(
                                        container,
                                        yAxis,
                                        series,
                                        statsRef.current,
                                        event,
                                        margin,
                                        seriesStyles,
                                        barSeriesStyle,
                                        allowTooltipRef.current,
                                        mouseOverHandlerFor(`tooltip-${chartId}`, BAR_CHART_TOOLTIP_PROVIDER_IDS.meanValue),
                                        BAR_CHART_TOOLTIP_PROVIDER_IDS.meanValue
                                    )
                            )
                            .on(
                                "mouseleave",
                                event => handleMouseLeaveSeries(
                                    series.name,
                                    event.currentTarget,
                                    seriesStyles,
                                    barSeriesStyle,
                                    mouseLeaveHandlerFor(`tooltip-${chartId}`, BAR_CHART_TOOLTIP_PROVIDER_IDS.meanValue),
                                    BAR_CHART_TOOLTIP_PROVIDER_IDS.meanValue
                                )
                            )

                        const windowedMeanLineY = yAxis.scale(isNaN(seriesWindowedStats.mean) ? 0 : seriesWindowedStats.mean)
                        svg
                            .select<SVGGElement>(`#${series.name}-${chartId}-bar`)
                            .selectAll<SVGLineElement, PlotData>(classIdFor(BAR_CHART_CLASS_IDS.windowedMeanValue))
                            .data(showWindowedMeanValueLines ? plotData : [])
                            .join(
                                enter => lineFor(
                                    enter.append<SVGLineElement>('line').attr('class', BAR_CHART_CLASS_IDS.windowedMeanValue),
                                    {
                                        x1: () => lower(x), y1: () => windowedMeanLineY,
                                        x2: () => upper(x), y2: () => windowedMeanLineY
                                    },
                                    windowedMeanLineStyle.regular
                                ),
                                update => lineFor(
                                    update,
                                    {
                                        x1: () => lower(x), y1: () => windowedMeanLineY,
                                        x2: () => upper(x), y2: () => windowedMeanLineY
                                    },
                                    windowedMeanLineStyle.regular
                                ),
                                exit => exit.remove()
                            )
                            .on(
                                "mouseover",
                                (event,) =>
                                    handleMouseOverBar(
                                        container,
                                        yAxis,
                                        series,
                                        statsRef.current,
                                        event,
                                        margin,
                                        seriesStyles,
                                        barSeriesStyle,
                                        allowTooltipRef.current,
                                        mouseOverHandlerFor(`tooltip-${chartId}`, BAR_CHART_TOOLTIP_PROVIDER_IDS.windowedMeanValue),
                                        BAR_CHART_TOOLTIP_PROVIDER_IDS.windowedMeanValue
                                    )
                            )
                            .on(
                                "mouseleave",
                                event => handleMouseLeaveSeries(
                                    series.name,
                                    event.currentTarget,
                                    seriesStyles,
                                    barSeriesStyle,
                                    mouseLeaveHandlerFor(`tooltip-${chartId}`, BAR_CHART_TOOLTIP_PROVIDER_IDS.windowedMeanValue),
                                    BAR_CHART_TOOLTIP_PROVIDER_IDS.windowedMeanValue
                                )
                            )
                    }

                    //
                    // value lines
                    svg
                        .select<SVGGElement>(`#${series.name}-${chartId}-bar`)
                        .selectAll<SVGLineElement, PlotData>(classIdFor(BAR_CHART_CLASS_IDS.currentValue))
                        .data(showValueLines ? plotData : [])
                        .join(
                            enter => lineFor(
                                enter.append<SVGLineElement>('line').attr('class', BAR_CHART_CLASS_IDS.currentValue),
                                {
                                    x1: () => lower(x), y1: datum => yAxis.scale(datum.value),
                                    x2: () => upper(x), y2: datum => yAxis.scale(datum.value)
                                },
                                valueLineStyle.regular
                            ),
                            update => lineFor(
                                update,
                                {
                                    x1: () => lower(x), y1: datum => yAxis.scale(datum.value),
                                    x2: () => upper(x), y2: datum => yAxis.scale(datum.value)
                                },
                                valueLineStyle.regular
                            ),
                            exit => exit.remove()
                        )
                        .on(
                            "mouseover",
                            (event,) =>
                                handleMouseOverBar(
                                    container,
                                    yAxis,
                                    series,
                                    statsRef.current,
                                    event,
                                    margin,
                                    seriesStyles,
                                    barSeriesStyle,
                                    allowTooltipRef.current,
                                    mouseOverHandlerFor(`tooltip-${chartId}`, BAR_CHART_TOOLTIP_PROVIDER_IDS.currentValue),
                                    BAR_CHART_TOOLTIP_PROVIDER_IDS.currentValue
                                )
                        )
                        .on(
                            "mouseleave",
                            event => handleMouseLeaveSeries(
                                series.name,
                                event.currentTarget,
                                seriesStyles,
                                barSeriesStyle,
                                mouseLeaveHandlerFor(`tooltip-${chartId}`, BAR_CHART_TOOLTIP_PROVIDER_IDS.currentValue),
                                BAR_CHART_TOOLTIP_PROVIDER_IDS.currentValue
                            )
                        )
                })
            }
        },
        [
            container,
            axisAssignments, xAxesState.axisFor, yAxesState.axisFor,
            barMargin, seriesStyles, barSeriesStyle,
            seriesFilter,
            chartId,
            margin,
            mouseOverHandlerFor, mouseLeaveHandlerFor,
            showMinMaxBars, showValueLines, showMeanValueLines, showWindowedMinMaxBars, showWindowedMeanValueLines,
        ]
    )

    // need to keep the function references for use by the subscription, which forms a closure
    // on them. without the references, the closures become stale, and resizing during streaming
    // doesn't work properly
    const updatePlotRef = useRef<(g: GSelection) => void>(noop)
    useEffect(
        () => {
            if (mainG !== null && container !== null) {
                // when the update plot function doesn't yet exist, then create the container holding the plot
                const svg = d3.select<SVGSVGElement, any>(container)
                const clipPathId = setClipPath(chartId, svg, plotDimensions, margin)
                if (updatePlotRef.current === noop) {
                    mainG
                        .selectAll<SVGGElement, TimeSeries>('g')
                        .attr("clip-path", `url(#${clipPathId})`)
                        .data<BaseSeries<OrdinalDatum>>(dataRef.current)
                        .enter()
                        .append('g')
                        .attr('class', 'spikes-series')
                        .attr('id', series => `${series.name}-${chartId}-bar`)
                        .attr('transform', `translate(${margin.left}, ${margin.top})`)

                } else {
                    mainG
                        .selectAll<SVGGElement, TimeSeries>('g')
                        .attr("clip-path", `url(#${clipPathId})`)
                }
                updatePlotRef.current = updatePlot
            }
        },
        [chartId, container, mainG, margin, plotDimensions, updatePlot]
    )

    // memoized function for subscribing to the chart-data observable
    const subscribe = useCallback(
        () => {
            if (seriesObservable === undefined || mainG === null) return undefined
            return subscriptionOrdinalXFor(
                seriesObservable,
                onSubscribe,
                windowingTime,
                axisAssignments,
                yAxesState,
                onUpdateData,
                dropDataAfter,
                updateTimingAndPlot,
                // as new data flows into the subscription, the subscription
                // updates this map directly (for performance)
                seriesRef.current,
                statsRef,
                (currentTime: number) => currentTimeRef.current = currentTime
            )
        },
        [
            axisAssignments, dropDataAfter, mainG,
            onSubscribe, onUpdateData,
            seriesObservable, updateTimingAndPlot, windowingTime, yAxesState,
        ]
    )

    useEffect(
        () => {
            if (container && mainG) {
                updatePlot(mainG)
            }
        },
        [chartId, color, container, mainG, plotDimensions, updatePlot, xAxesState]
    )

    // subscribe/unsubscribe to the observable chart data. when the `shouldSubscribe`
    // is changed to `true` and we haven't subscribed yet, then subscribe. when the
    // `shouldSubscribe` is `false` and we had subscribed, then unsubscribe. otherwise,
    // do nothing.
    useEffect(
        () => {
            if (shouldSubscribe && subscriptionRef.current === undefined) {
                subscriptionRef.current = subscribe()
                allowTooltipRef.current = false
            } else if (!shouldSubscribe && subscriptionRef.current !== undefined) {
                subscriptionRef.current?.unsubscribe()
                subscriptionRef.current = undefined
                allowTooltipRef.current = true
            }
        },
        [shouldSubscribe, subscribe]
    )

    return null
}

/*
    Helper functions and types
 */

type PlotData = {
    data: OrdinalDatum,
    stats: OrdinalStats,
}

type BarDimensions = {
    upperX: number
    upperY: number
    width: number
    height: number
}

function barStyleFor(isVisible: boolean, style: BarStyle): BarStyle {
    return {
        ...style,
        fill: updateOpacityFor<SvgFillStyle>(isVisible, style.fill),
        stroke: updateOpacityFor<SvgStrokeStyle>(isVisible, style.stroke)
    }
}

function updateOpacityFor<S extends SvgFillStyle | SvgStrokeStyle>(isVisible: boolean, style: S): S {
    return {
        ...style,
        opacity: isVisible ? style.opacity : 0
    }
}

/**
 * Sets the attributes for the bar based on the d3 selection
 * @param selection The d3 selection (rect SVG element)
 * @param dimensions The bar dimensions
 * @param style The bar style holding the fill and stroke styles
 * @return The updated SVG selection (rect SVG element)
 */
function barFor(
    selection: d3.Selection<SVGRectElement, OrdinalDatum, SVGGElement, any>,
    dimensions: BarDimensions,
    style: BarStyle
): d3.Selection<SVGRectElement, OrdinalDatum, SVGGElement, any> {
    selection
        .attr('x', () => dimensions.upperX)
        .attr('y', () => dimensions.upperY)
        .attr('width', () => dimensions.width)
        .attr('height', () => dimensions.height)

    return applyStrokeStylesTo(applyFillStylesTo(selection, style.fill), style.stroke)
}

type PathSegment = {
    x1: (datum: OrdinalDatum) => number,
    y1: (datum: OrdinalDatum) => number,
    x2: (datum: OrdinalDatum) => number,
    y2: (datum: OrdinalDatum) => number,
}

/**
 * Creates the line segment for values and means
 * @param selection The d3 selection (rect SVG element)
 * @param pathSegment The object containing functions for extracting the (x1, y1) and (x2, y2)
 * points for the path segment
 * @param strokeStyle The stroke style
 * @return The updated SVG selection (rect SVG element)
 */
function lineFor(
    selection: d3.Selection<SVGLineElement, OrdinalDatum, SVGGElement, any>,
    pathSegment: PathSegment,
    strokeStyle: Partial<SvgStrokeStyle>
) {
    selection
        .attr('x1', datum => pathSegment.x1(datum))
        .attr('y1', datum => pathSegment.y1(datum))
        .attr('x2', datum => pathSegment.x2(datum))
        .attr('y2', datum => pathSegment.y2(datum))

    return applyStrokeStylesTo(selection, strokeStyle)
}

/**
 * Calculates the upper (x, y) coordinates of the bar, and the width and height of the bar
 * @param widthFraction The fraction of the category width that the bar should take
 * @param lowerX (Scaled to the axis) The lower bounds of the bar on the x-axis
 * @param upperX (Scaled to the axis) The upper bounds of the bar on the x-axis
 * @param min The minimum value for the category (NOT scaled to the axis)
 * @param max The maximum value for the category (NOT scaled to the axis)
 * @param axis The axis (needed for scaling)
 * @return The bar's upper (x, y) coordinates, the width, and height
 */
function barDimensions(widthFraction: number, lowerX: number, upperX: number, min: number, max: number, axis: ContinuousNumericAxis): BarDimensions {
    const x = lowerX + Math.max(0, 0.5 - widthFraction / 2) * (upperX - lowerX)

    const maxValue = (isNaN(max) || max === -Infinity) ? 0 : max
    const y = axis.scale(maxValue)

    const width = Math.max(0, widthFraction * (upperX - lowerX))

    const minValue = (isNaN(min) || min === -Infinity) ? 0 : min
    const height = Math.max(0, axis.scale(minValue) - axis.scale(maxValue))
    return {
        upperX: x,
        upperY: y,
        width,
        height,
    }
}

/**
 * Calculates the ordinal stats for each of the ordinal series (generally, initial data) and
 * returns a {@link WindowedOrdinalStats} object
 * @param series The array of ordinal series
 * @return A {@link WindowedOrdinalStats} object with the stats for each of the series
 */
function initialOrdinalStats(series: Array<OrdinalSeries>): WindowedOrdinalStats {
    const ordinalStats = calculateOrdinalStats(series)
    return {
        ...ordinalStats,
        windowedValueStatsForSeries: copyValueStatsForSeries(ordinalStats.valueStatsForSeries)
    }
}

/**
 * Functions that return the bounds of the category. The {@link lower} function
 * returns the lower bound of the category within which the value falls. The
 * {@link upper} function returns the upper bound of the category within which the
 * value falls
 */
type CategoryBounds = {
    lower: (value: number) => number
    upper: (value: number) => number,
}

/**
 * Attempts to locate the x- and y-axes for the specified series. If no axis is found for the
 * series name, then uses the default returned by the useChart() hook.
 * @param seriesName Name of the series for which to retrieve the axis
 * @param axisAssignments A map holding the series name and the associated x- and y-axes assigned
 * to that series. Note that the series in the axis-assignment map is merely a subset of the set
 * of series names.
 * @param xAxisFor The function that accepts an axis ID and returns the corresponding x-axis
 * @param yAxisFor The function that accepts an axis ID and returns the corresponding y-axis
 * @return A 2d tuple holding the linear x-axis as its first element and the category y-axis as
 * the second element.
 */
function axesFor(
    seriesName: string,
    axisAssignments: Map<string, AxesAssignment>,
    xAxisFor: (id: string) => BaseAxis | undefined,
    yAxisFor: (id: string) => BaseAxis | undefined,
): [xAxis: CategoryAxis, yAxis: ContinuousNumericAxis] {
    const axes = axisAssignments.get(seriesName)
    const xAxis = xAxisFor(axes?.xAxis || "")
    const xAxisCategory = xAxis as CategoryAxis
    if (xAxis && !xAxisCategory) {
        throw Error("Bar plot requires that x-axis be of type CategoryAxis")
    }
    const yAxis = yAxisFor(axes?.yAxis || "")
    const yAxisContinuous = yAxis as ContinuousNumericAxis
    if (yAxis && !yAxisContinuous) {
        throw Error("Bar plot requires that y-axis be of type ContinuousNumericAxis")
    }
    return [xAxisCategory, yAxisContinuous]
}

// /**
//  * Calculates the upper and lower coordinate for the category
//  * @param categorySize The size of the category (i.e. plot_height / num_series)
//  * @param lineWidth The width of the series line
//  * @param margin The margin applied to the top and bottom of the spike line (vertical spacing)
//  * @return An object with two functions, that when handed a y-coordinate, return the location
//  * for the start (yUpper) or end (yLower) of the spikes line.
//  */
// function yAxisCategoryBoundsFn(categorySize: number, lineWidth: number, margin: number): CategoryBounds {
//     if (categorySize <= margin) return {
//         upper: value => value,
//         lower: value => value + lineWidth
//     }
//     return {
//         upper: value => value + margin,
//         lower: value => value + categorySize - margin
//     }
// }

/**
 * Calculates the upper and lower coordinate for the category
 * @param categorySize The size of the category (i.e. plot_height / num_series)
 * @param lineWidth The width of the series line
 * @param margin The margin applied to the top and bottom of the spike line (vertical spacing)
 * @return An object with two functions, that when handed a y-coordinate, return the location
 * for the start (yUpper) or end (yLower) of the spikes line.
 */
function xAxisCategoryBoundsFn(categorySize: number, lineWidth: number, margin: number): CategoryBounds {
    if (categorySize <= margin) return {
        upper: value => value + lineWidth,
        lower: value => value
    }
    return {
        upper: value => value + categorySize - margin,
        lower: value => value + margin
    }
}

/**
 * Renders a tooltip showing for the bar in the bar chart (see {@link BarPlotTooltipContent})
 * @param container The chart container
 * @param yAxis The y-axis
 * @param selectedSeries The selected series
 * @param seriesStats The statistics about the current series
 * @param event The mouse-over series event holding the line element
 * @param margin The plot margin
 * @param barStyles The series style information (needed for (un)highlighting)
 * @param defaultBarSeriesStyle The default bar series style that is used if no style is found for the series
 * @param allowTooltip When set to `false` won't show tooltip, even if it is visible (used by pan)
 * @param mouseOverHandlerFor The handler for the mouse over (registered by the <Tooltip/>)
 */
function handleMouseOverBar(
    container: SVGSVGElement,
    yAxis: ContinuousNumericAxis,
    selectedSeries: BaseSeries<OrdinalDatum>,
    seriesStats: WindowedOrdinalStats,
    event: React.MouseEvent<SVGLineElement>,
    margin: Margin,
    barStyles: Map<string, BarSeriesStyle>,
    defaultBarSeriesStyle: BarSeriesStyle,
    allowTooltip: boolean,
    mouseOverHandlerFor: ((
        seriesName: string,
        value: number,
        tooltipData: TooltipData<OrdinalDatum, WindowedOrdinalStats>,
        mouseCoords: [x: number, y: number]
    ) => void) | undefined,
    tooltipProvider?: string
): void {
    // grab the time needed for the tooltip ID
    const [x, y] = d3.pointer(event, container)
    const value = yAxis.scale.invert(y - margin.top)

    const {name: categoryName, data: selectedData} = selectedSeries
    // const {valueLine, windowedMeanValueLine} = barStyles.get(categoryName) || defaultBarSeriesStyle
    //
    // // // Use d3 to select element, change color and size
    // // d3.select<SVGPathElement, Datum>(event.currentTarget)
    // //     .style(STROKE_COLOR, valueLine.highlight.color)
    // //     .style(STROKE_WIDTH, valueLine.highlight.width)
    // //     .style(STROKE_OPACITY, valueLine.highlight.opacity)
    // if (tooltipProvider === CURRENT_VALUE_TOOLTIP_PROVIDER) {
    //     // Use d3 to select element, change color and size
    //     d3.select<SVGPathElement, Datum>(event.currentTarget)
    //         .style(STROKE_COLOR, valueLine.highlight.color)
    //         .style(STROKE_WIDTH, valueLine.highlight.width)
    //         .style(STROKE_OPACITY, valueLine.highlight.opacity)
    // } else if (tooltipProvider === WINDOWED_MEAN_VALUE_TOOLTIP_PROVIDER) {
    //     // Use d3 to select element, change color and size
    //     d3.select<SVGPathElement, Datum>(event.currentTarget)
    //         .style(STROKE_COLOR, windowedMeanValueLine.highlight.color)
    //         .style(STROKE_WIDTH, windowedMeanValueLine.highlight.width)
    //         .style(STROKE_OPACITY, windowedMeanValueLine.highlight.opacity)
    // }

    const barSeriesStyle = barStyles.get(categoryName) || defaultBarSeriesStyle
    const lineStyle = lineStyleFor(tooltipProvider, barSeriesStyle)
    if (lineStyle !== undefined) {
        d3.select<SVGPathElement, Datum>(event.currentTarget)
            .style(STROKE_COLOR, lineStyle.highlight.color)
            .style(STROKE_WIDTH, lineStyle.highlight.width)
            .style(STROKE_OPACITY, lineStyle.highlight.opacity)
    }

    if (mouseOverHandlerFor && allowTooltip) {
        // the contract for the mouse over handler is for a series
        mouseOverHandlerFor(categoryName, value, {series: selectedData, metadata: seriesStats}, [x, y])
    }
}

/**
 * Unselects the time series and calls the mouse-leave-series handler registered for this series.
 * @param seriesName The name of the series (i.e. the neuron ID)
 * @param segment The SVG line element representing the spike, over which the mouse is hovering.
 * @param seriesStyles The styles for the series (for (un)highlighting)
 * @param defaultBarSeriesStyle The default bar series style that is used if no style is found for the series
 * @param mouseLeaverHandlerFor Registered handler for the series when the mouse leaves
 * @param tooltipProvider The tooltip provider ID for the mouse-over event
 */
function handleMouseLeaveSeries(
    seriesName: string,
    segment: SVGLineElement,
    seriesStyles: Map<string, BarSeriesStyle>,
    defaultBarSeriesStyle: BarSeriesStyle,
    mouseLeaverHandlerFor: ((seriesName: string) => void) | undefined,
    tooltipProvider?: string
): void {
    const barSeriesStyle = seriesStyles.get(seriesName) || defaultBarSeriesStyle
    const lineStyle = lineStyleFor(tooltipProvider, barSeriesStyle)
    if (lineStyle !== undefined) {
        d3.select<SVGPathElement, Datum>(segment)
            .style(STROKE_COLOR, lineStyle.regular.color)
            .style(STROKE_WIDTH, lineStyle.regular.width)
            .style(STROKE_OPACITY, lineStyle.regular.opacity)
    }

    if (mouseLeaverHandlerFor) {
        mouseLeaverHandlerFor(seriesName)
    }
}

function lineStyleFor(tooltipProvider: string | undefined, barSeriesStyle: BarSeriesStyle): LineStyle | undefined {
    const {valueLine, windowedMeanValueLine} = barSeriesStyle
    switch (tooltipProvider) {
        case BAR_CHART_TOOLTIP_PROVIDER_IDS.currentValue:
            return valueLine
        case BAR_CHART_TOOLTIP_PROVIDER_IDS.windowedMeanValue:
            return windowedMeanValueLine
        default:
            return undefined
    }
}
