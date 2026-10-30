import {type AxesAssignment, clipToArea} from "./plot";
import {useCanvasZoomPan} from "./useCanvasZoomPan";
import * as d3 from "d3";
import {noop} from "../utils";
import {useChart} from "../hooks/useChart";
import {useCallback, useEffect, useEffectEvent, useMemo, useRef} from "react";
import type {CanvasContext} from "../d3types";
import {seriesAt, canvasLocalPoint, type SeriesGeometry} from "./hitTesting";
import {
    axesForSeriesGen,
    type BaseAxis,
    type ContinuousNumericAxis,
    AxisType,
    checkAxisType,
    ordinalAxisIntervals,
    ordinalAxisRanges,
    ordinalAxisZoomHandler,
    ordinalPanHandler,
    type OrdinalStringAxis
} from "../axes/axes";
import type {Dimensions, Margin} from "../styling/margins";
import {ordinalViewDriverFor} from "../subscriptions/viewDrivers";
import {useDataSource, useDataSourceRunning, useInitialData, useStreamingSettings} from "../hooks/useDataSource";
import {initialOrdinalStats, type WindowedOrdinalStats} from "../datasources/ordinalDataSource";
import {usePlotDimensions} from "../hooks/usePlotDimensions";
import {type OrdinalChartData} from "../observables/ordinals";
import type {BaseSeries} from "../series/baseSeries";
import {type OrdinalDatum} from "../series/ordinalSeries";
import {applyFillStyle, applyStrokeStyle} from "../styling/canvasStyle";
import type {SvgFillStyle, SvgStrokeStyle} from "../styling/svgStyle";
import {type BarSeriesStyle, type BarStyle, defaultBarSeriesStyle} from "../styling/barPlotStyle";
import type {TooltipData} from "../hooks/useTooltip";
import {OrdinalAxisRange} from "../axes/OrdinalAxisRange";
import {Optional} from "result-fn";
import {BAR_CHART_TOOLTIP_PROVIDER_IDS} from "./constants";
import {AxisInterval} from "../axes/AxisInterval";
import {extentOf, extentWith} from "../axes/autoScale";
import {type AutoScaleAxes, growAutoScaledYAxes, useAutoScaleRestart} from "./autoScaleYAxes";

/**
 * A snapshot of the bar plot's zoom/pan state, in a form that can be held outside the plot (e.g.
 * in an application store) and handed back to a later instance of the plot (see the
 * {@link Props.zoomState} and {@link Props.onZoomStateChange} props) -- so that zooming, navigating
 * away, and navigating back doesn't reset the zoom.
 */
export interface BarPlotZoomState {
    /**
     * d3-zoom's cumulative scale factor (`transform.k`) at the time of the snapshot. The ordinal
     * zoom math depends on this matching the axis ranges (see `OrdinalAxisRange.scaledCumulative`),
     * so it must be restored onto the new canvas along with the ranges.
     */
    k: number
    /**
     * Maps each ordinal x-axis ID to its current (zoomed/panned) pixel range, expressed as
     * fractions of the axis' original (un-zoomed) pixel extent, so that the snapshot remains valid
     * if the plot is a different width when it is restored.
     */
    ranges: Record<string, [startFraction: number, endFraction: number]>
}

// typescript doesn't support enums with computed string values, even though they are all constants...
/**
 * An ID (e.g. a tooltip provider ID) for each of the five kinds of element the bar plot draws for
 * each series
 */
export type BarChartElementId = {
    readonly currentValue: string
    readonly meanValue: string
    readonly minMax: string
    readonly windowedMeanValue: string
    readonly windowedMinMax: string
}

/**
 * The properties of the {@link BarPlot}
 */
export interface Props {
    /**
     * Holds the mapping between a series and the axis it uses (is assigned). The
     * map's key holds the series name, and the value is an {@link AxesAssignment}
     * object holding the ID of the assigned x-axis and y-axis.
     */
    axisAssignments?: Map<string, AxesAssignment>
    /**
     * Whether to show each series' lifetime min/max bar (default is true)
     */
    showMinMaxBars?: boolean
    /**
     * Whether to show each series' windowed min/max bar (default is true)
     */
    showWindowedMinMaxBars?: boolean
    /**
     * Whether to show each series' current-value line (default is true)
     */
    showValueLines?: boolean
    /**
     * Whether to show each series' lifetime mean-value line (default is true)
     */
    showMeanValueLines?: boolean
    /**
     * Whether to show each series' windowed mean-value line (default is true)
     */
    showWindowedMeanValueLines?: boolean
    /**
     * Enables panning (default is false)
     */
    panEnabled?: boolean
    /**
     * Enables zooming (default is false)
     */
    zoomEnabled?: boolean
    /**
     * When true, requires that the shift or control key be pressed while scrolling
     * in order to activate the zoom
     */
    zoomKeyModifiersRequired?: boolean
    /**
     * The (optional, default = 2 pixels) left and right margin (in pixels) between each category's
     * edges and its lines. Margins on individual series can also be set through the
     * {@link ChartProps.seriesStyles} property.
     */
    barMargin?: number
    /**
     * The (optional) default style for the bar series that are used if no other styles are specified
     */
    barSeriesStyle?: BarSeriesStyle
    /**
     * When true, hovering over any element (bar, line) of a series also highlights the x- and
     * y-axes it is plotted against, using the axis' own default highlight color/width (bar series
     * styles don't carry a single flat highlight color/width the way line-series styles do, so
     * this doesn't attempt to match a specific element's highlight style). Defaults to `false`.
     */
    highlightAxesOnMouseOver?: boolean
    /**
     * An (optional) zoom/pan state to restore when this plot mounts -- commonly the last value
     * reported through {@link onZoomStateChange} and held by the application (e.g. in a store)
     * so that the zoom survives the plot being unmounted and remounted (e.g. navigating away
     * and back). Only read once, when the plot's axes are first available; later changes to this
     * prop are ignored.
     */
    zoomState?: BarPlotZoomState
    /**
     * (Optional) callback that is handed the plot's zoom/pan state after each zoom event and at
     * the end of each pan, so the application can hold on to it (see {@link BarPlotProps.zoomState}).
     */
    onZoomStateChange?: (zoomState: BarPlotZoomState) => void
    /**
     * Called whenever this plot (re)creates its zoom behavior, handing
     * the caller a `resetZoom` function that programmatically clears d3-zoom's own accumulated
     * scale state back to identity and restores the ordinal x-axes to their original (un-zoomed,
     * un-panned) ranges. See {@link ScatterPlot}'s identical prop for the full explanation of why
     * this is needed. Only meaningful (called) while `zoomEnabled` is true.
     */
    onZoomReset?: (resetZoom: () => void) => void
}

/**
 * Maps the short element-type keys used internally for hit-testing geometry (`minMax`,
 * `windowedMinMax`, `meanValue`, `windowedMeanValue`, `currentValue`) to the actual provider IDs
 * (`BAR_CHART_TOOLTIP_PROVIDER_IDS`) that `mouseOverHandlerFor`/`mouseLeaveHandlerFor` expect.
 */
const PROVIDER_ID_FOR_ELEMENT_TYPE: Record<string, string> = {
    minMax: BAR_CHART_TOOLTIP_PROVIDER_IDS.minMax,
    windowedMinMax: BAR_CHART_TOOLTIP_PROVIDER_IDS.windowedMinMax,
    meanValue: BAR_CHART_TOOLTIP_PROVIDER_IDS.meanValue,
    windowedMeanValue: BAR_CHART_TOOLTIP_PROVIDER_IDS.windowedMeanValue,
    currentValue: BAR_CHART_TOOLTIP_PROVIDER_IDS.currentValue,
}

/**
 * Renders a streaming bar plot for the series held by the {@link StreamingDataSource} handed to the
 * {@link Chart} (its `dataSource` prop) -- along with each series' lifetime and windowed stats,
 * which an {@link OrdinalDataSource} keeps. This component uses the {@link useChart}
 * hook, and therefore must be a child of the {@link Chart} to be plugged in to the
 * chart ecosystem (axes, tracker, tooltip).
 *
 * Internally, this no longer creates/updates SVG `<rect>`/`<line>` elements. Instead, it registers
 * a single draw function with the chart's {@link CanvasContext} that redraws every series' bars
 * and lines from scratch each time the canvas repaints. Mouse hover (for the tooltip and the
 * value-line/windowed-mean-line highlight) is handled by hit-testing the mouse position against
 * the last-drawn geometry, keyed per `${seriesName}::${elementType}` so the five overlaid visual
 * elements (min-max bar, windowed min-max bar, mean line, windowed mean line, value line) can be
 * hit-tested and highlighted independently, matching the old per-element SVG mouseover behavior.
 *
 * For a relatively complete example of how to use this plot component, see the
 * <a href="https://github.com/robphilipp/stream-charts-examples">`StreamingBarChart` example</a>
 *
 * @param props The properties associated with the bar plot
 * @return `null` (the plot draws onto the chart's canvas)
 * @example
 * ```typescript
 * <BarPlot
 *     barMargin={1}
 *     panEnabled={true}
 *     zoomEnabled={true}
 *     zoomKeyModifiersRequired={true}
 *
 *     showMinMaxBars={true}
 *     showValueLines={true}
 *     showMeanValueLines={true}
 *     showWindowedMinMaxBars={true}
 *     showWindowedMeanValueLines={true}
 * />
 * ```
 */
export function BarPlot(props: Props): null {
    const {
        chartId,
        canvasContext,
        axes,
        seriesStyles,
        seriesFilter,
        mouse
    } = useChart<OrdinalDatum, BarSeriesStyle, WindowedOrdinalStats, OrdinalAxisRange, OrdinalStringAxis>()

    const {
        xAxesState,
        yAxesState,
        setAxisAssignments,
        setAxisIntervalFor,
        setOriginalAxisIntervalFor,
        axesRanges,
        axisRangeFor,
        updateAxisRanges,
    } = axes


    const {mouseOverHandlerFor, mouseLeaveHandlerFor} = mouse

    const {plotDimensions, margin} = usePlotDimensions()

    const {
        windowingTime = 100,
        onUpdateChartTime = noop
    } = useStreamingSettings()

    // the application-owned source of the data, and whether it's running (streaming)
    const dataSource = useDataSource<OrdinalChartData, OrdinalDatum>()
    const running = useDataSourceRunning(dataSource)

    const {initialData} = useInitialData<OrdinalDatum>()

    const {
        axisAssignments = new Map<string, AxesAssignment>(),
        panEnabled = false,
        zoomEnabled = false,
        zoomKeyModifiersRequired = true,
        showMinMaxBars = true,
        showWindowedMinMaxBars = true,
        showValueLines = true,
        showMeanValueLines = true,
        showWindowedMeanValueLines = true,
        barMargin = 2,
        barSeriesStyle = defaultBarSeriesStyle(),
        highlightAxesOnMouseOver = false,
        zoomState = undefined,
        onZoomStateChange = noop,
        onZoomReset = noop,
    } = props

    // why do "dataRef" and "seriesRef" both hold on to the same underlying data? for performance.
    //
    // the "dataRef" and "seriesRef" both point to the same underlying data, a collection
    // of series (held, and updated as new data is streamed in, by the data source). The series in
    // "dataRef" are read by the canvas draw function, and the "seriesRef" map is for looking a
    // series up by its name.
    //
    // the "dataRef" object holds on to a copy of the initial data (which is an array of
    // time-series, e.i. an array of BaseSeries<OrdinalDatum> objects). The slice just creates a copy of
    // the array, but the references to the BaseSeries objects are the same and still point to the same
    // data as the "initialData" array.
    //
    // the "seriesRef" object is a reference to a map (series_name -> BaseSeries<OrdinalDatum>), used
    // to find the series under the mouse (for the tooltip).
    //
    // the series in the "dataRef" object are the ones read by the next redraw, so as these are
    // updated, the next canvas repaint picks up the new data.
    const dataRef = useRef<Array<BaseSeries<OrdinalDatum>>>(initialData.slice())
    const seriesRef = useRef<Map<string, BaseSeries<OrdinalDatum>>>(
        new Map(initialData.map(series => [series.name, series]))
    )
    // the lifetime and windowed stats for each series -- kept by the data source (when it's an
    // ordinal data source), so they keep accumulating while this plot is unmounted
    const statsRef = useRef<WindowedOrdinalStats>(statsFrom(dataSource, initialData))

    // map(axis_id -> current_time) -- maps the axis ID to the current time for that axis
    const currentTimeRef = useRef<number>(0)

    // tooltips are only shown while the data source is paused (and not while panning)
    const allowTooltipRef = useRef<boolean>(!(dataSource?.running ?? false))

    // the last-drawn geometry for each `${seriesName}::${elementType}`, in canvas coordinates,
    // used for hit-testing mouse hover on `mousemove` (see the effect below that wires up the
    // listener)
    const geometryRef = useRef<Map<string, SeriesGeometry>>(new Map())
    // which specific element (series + type) the mouse was over on the previous `mousemove`, so
    // we know when to fire a "leave" before firing an "over" for a different element -- unlike
    // Scatter/Raster, BarPlot doesn't use the shared `hoveredSeriesName` chart state, since here
    // hover is scoped to one of five element *types* per series, not the series as a whole
    const lastHoveredRef = useRef<{seriesName: string, elementType: string} | undefined>(undefined)

    /**
     * (Re-)registers this plot's draw function with the canvas context and requests a redraw.
     * Replaces the old version, which directly mutated SVG `<rect>`/`<line>` elements bound via
     * d3's enter/update/exit join. Canvas has no persistent elements to join against, so the draw
     * function just redraws every element from current data/scale state each time it's invoked.
     *
     * Pan/zoom behavior setup lives in a separate effect (see below), not here -- this function
     * runs on every data tick (each `windowingTime` interval), and recreating/reattaching a
     * `d3.drag()`/`d3.zoom()` behavior that often is pure overhead unrelated to drawing the new
     * data.
     * @param cc The canvas context to register the draw function with
     */
    const updatePlot = useCallback(
        (cc: CanvasContext) => {
            const draw = (context: CanvasContext) => {
                const {context2D} = context

                context2D.save()
                clipToArea(context, plotDimensions, {x: margin.left, y: margin.top})
                context2D.translate(margin.left, margin.top)

                const newGeometry = new Map<string, SeriesGeometry>()
                const hovered = lastHoveredRef.current

                // enter, update, delete the bar data
                dataRef.current.forEach(series => {
                    const [xAxis, yAxis] = axesFor(
                        series.name,
                        axisAssignments,
                        axisId => xAxesState.axisFor(axisId).getOrUndefined(),
                        axisId => yAxesState.axisFor(axisId).getOrUndefined()
                    )
                    if (xAxis === undefined || yAxis === undefined) return

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
                    const plotData = series.name.match(seriesFilter) && series.data.length > 0 ?
                        [series.data[series.data.length - 1]] :
                        []
                    if (plotData.length === 0) return

                    // grab the functions for determining the lower and upper bounds of the category
                    const {lower, upper} = xAxisCategoryBoundsFn(xAxis.scale.bandwidth(), valueLineStyle.regular.width, categoryMargin)

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
                    drawBar(context2D, totalBar, barStyleFor(showMinMaxBars, minMaxBarStyle))
                    newGeometry.set(`${series.name}::minMax`, {
                        points: [],
                        rects: [{
                            x: totalBar.upperX + margin.left,
                            y: totalBar.upperY + margin.top,
                            width: totalBar.width,
                            height: totalBar.height
                        }],
                        hitRadius: 0
                    })

                    //
                    // windowed-mean line and windowed min/max bar, when the windowed stats are defined for the series
                    const seriesWindowedStats = statsRef.current.windowedValueStatsForSeries.get(series.name)
                    if (seriesWindowedStats !== undefined) {
                        const windowedBar = barDimensions(
                            windowedBarStyle.widthFraction,
                            lower(x), upper(x),
                            seriesWindowedStats.min.value, seriesWindowedStats.max.value,
                            yAxis
                        )
                        drawBar(context2D, windowedBar, barStyleFor(showWindowedMinMaxBars, windowedBarStyle))
                        newGeometry.set(`${series.name}::windowedMinMax`, {
                            points: [],
                            rects: [{
                                x: windowedBar.upperX + margin.left,
                                y: windowedBar.upperY + margin.top,
                                width: windowedBar.width,
                                height: windowedBar.height
                            }],
                            hitRadius: 0
                        })

                        //
                        // mean line
                        if (showMeanValueLines) {
                            const meanLineY = yAxis.scale(statsRef.current.valueStatsForSeries.get(series.name)?.mean || 0)
                            drawLine(context2D, lower(x), meanLineY, upper(x), meanLineY, meanValueLineStyle.regular)
                            newGeometry.set(`${series.name}::meanValue`, {
                                points: [],
                                segments: [[
                                    [lower(x) + margin.left, meanLineY + margin.top],
                                    [upper(x) + margin.left, meanLineY + margin.top]
                                ]],
                                hitRadius: Math.max(4, meanValueLineStyle.regular.width ?? 1)
                            })
                        }

                        //
                        // windowed-mean line
                        if (showWindowedMeanValueLines) {
                            const windowedMeanLineY = yAxis.scale(isNaN(seriesWindowedStats.mean) ? 0 : seriesWindowedStats.mean)
                            const isHovered = hovered?.seriesName === series.name && hovered.elementType === 'windowedMeanValue'
                            const style = isHovered ? windowedMeanLineStyle.highlight : windowedMeanLineStyle.regular
                            drawLine(context2D, lower(x), windowedMeanLineY, upper(x), windowedMeanLineY, style)
                            newGeometry.set(`${series.name}::windowedMeanValue`, {
                                points: [],
                                segments: [[
                                    [lower(x) + margin.left, windowedMeanLineY + margin.top],
                                    [upper(x) + margin.left, windowedMeanLineY + margin.top]
                                ]],
                                hitRadius: Math.max(4, style.width ?? 1)
                            })
                        }
                    }

                    //
                    // value line
                    if (showValueLines) {
                        const datum = plotData[0]
                        const valueLineY = yAxis.scale(datum.value)
                        const isHovered = hovered?.seriesName === series.name && hovered.elementType === 'currentValue'
                        const style = isHovered ? valueLineStyle.highlight : valueLineStyle.regular
                        drawLine(context2D, lower(x), valueLineY, upper(x), valueLineY, style)
                        newGeometry.set(`${series.name}::currentValue`, {
                            points: [],
                            segments: [[
                                [lower(x) + margin.left, valueLineY + margin.top],
                                [upper(x) + margin.left, valueLineY + margin.top]
                            ]],
                            hitRadius: Math.max(4, style.width ?? 1)
                        })
                    }
                })

                geometryRef.current = newGeometry

                context2D.restore()
            }

            /**
             * Grows the auto-scaling y-axes (see `ContinuousAxis`'s `autoScale` prop) to fit what's
             * shown of the series whose categories are on screen (within the x-axis' current,
             * possibly zoomed, window): the min/max bars, the windowed min/max bars, the mean and
             * windowed-mean lines, and the value lines -- each only when it's shown. Registered to
             * run before the axes draw (they're at z-index 0), so the axes and the bars are drawn
             * with the grown domain in the same frame.
             */
            const autoScaleYAxes = (): void => {
                const extents = new Map<string, [min: number, max: number]>()
                dataRef.current.forEach(series => {
                    if (!series.name.match(seriesFilter) || series.data.length === 0) return
                    const [xAxis, yAxis] = axesFor(
                        series.name,
                        axisAssignments,
                        axisId => xAxesState.axisFor(axisId).getOrUndefined(),
                        axisId => yAxesState.axisFor(axisId).getOrUndefined()
                    )
                    if (xAxis === undefined || yAxis?.autoScale === undefined) return

                    // only the categories (at least partly) on screen
                    const x = xAxis.scale(series.name)
                    if (x === undefined || x + xAxis.scale.bandwidth() <= 0 || x >= plotDimensions.width) return

                    // what's shown of the series (mirrors the draw function above)
                    const values: Array<number> = []
                    const stats = statsRef.current.valueStatsForSeries.get(series.name)
                    if (showMinMaxBars && stats !== undefined) values.push(stats.min.value, stats.max.value)
                    const windowedStats = statsRef.current.windowedValueStatsForSeries.get(series.name)
                    if (windowedStats !== undefined) {
                        if (showWindowedMinMaxBars) values.push(windowedStats.min.value, windowedStats.max.value)
                        if (showMeanValueLines && stats !== undefined) values.push(stats.mean)
                        if (showWindowedMeanValueLines) values.push(windowedStats.mean)
                    }
                    if (showValueLines) values.push(series.data[series.data.length - 1].value)

                    const seriesExtent = extentOf(values, yAxis.scale)
                    if (seriesExtent === undefined) return
                    const extent = extents.get(yAxis.axisId)
                    extents.set(
                        yAxis.axisId,
                        extent === undefined ? seriesExtent : extentWith(extentWith(extent, seriesExtent[0]), seriesExtent[1])
                    )
                })
                // (the y-axes are continuous axes, even though this plot's axes context is typed
                // for its ordinal x-axes)
                growAutoScaledYAxes(extents, {
                    yAxes: yAxesState.axes,
                    axisRangeFor,
                    updateAxisRanges: updateAxisRanges as unknown as AutoScaleAxes['updateAxisRanges'],
                })
            }

            cc.register(`bar-plot-autoscale-${chartId}`, autoScaleYAxes, -10)
            cc.register(`bar-plot-${chartId}`, draw, 10)
            cc.requestRedraw()
        },
        [
            chartId, plotDimensions, axisAssignments, xAxesState, yAxesState, barMargin, seriesStyles,
            barSeriesStyle, seriesFilter, showValueLines, showMinMaxBars, showMeanValueLines,
            showWindowedMeanValueLines, showWindowedMinMaxBars, axisRangeFor, updateAxisRanges,
            margin.left, margin.top
        ]
    )

    // new data, new scale: restarts the auto-scaling y-axes when the data source is replaced
    useAutoScaleRestart(dataSource, {
        yAxes: yAxesState.axes,
        axisRangeFor,
        updateAxisRanges: updateAxisRanges as unknown as AutoScaleAxes['updateAxisRanges'],
    })

    // need to keep the function references for use by the subscription, which forms a closure
    // on them. without the references, the closures become stale, and resizing during streaming
    // doesn't work properly
    const updatePlotRef = useRef<(cc: CanvasContext) => void>(updatePlot)
    useEffect(
        () => {
            updatePlotRef.current = updatePlot
        },
        [updatePlot]
    )

    useEffect(
        () => {
            currentTimeRef.current = 0
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

    // calculates the distinct series IDs that cover all the series in the plot
    const axesForSeries = useMemo(
        () => axesForSeriesGen<OrdinalDatum, OrdinalStringAxis>(initialData, axisAssignments, xAxesState),
        [initialData, axisAssignments, xAxesState]
    )

    // redraws the plot for newly arrived data and reports the chart time, using the updatePlot
    // reference (to avoid a stale updatePlot). Deliberately leaves the axes' ranges
    // (`ordinalRangesRef`) alone: the ordinal axes don't scroll as data arrives, so only this plot's
    // own zoom, pan, and resize handling changes them -- replacing them here (as a previous version
    // did, with the y-axes' ranges) left the x-axis zoom/pan handlers with nothing to act on until
    // something else happened to rebuild the map.
    const updateTimingAndPlot = useCallback(
        (): void => {
            if (canvasContext !== null) {
                // (one redraw request is enough: `onUpdateChartTime` only reports the time to the
                // application, and redraw requests are coalesced into one animation frame anyway)
                updatePlotRef.current(canvasContext)
                onUpdateChartTime(currentTimeRef.current)
            }
        },
        [canvasContext, onUpdateChartTime]
    )

    // when the initial data changes, then reset the plot. note that the initial data doesn't change
    // during the normal course of updates from the data source, only when the data source is replaced.
    useEffect(
        () => {
            dataRef.current = initialData.slice()
            seriesRef.current = new Map(initialData.map(series => [series.name, series]))
            currentTimeRef.current = 0
            statsRef.current = statsFrom(dataSource, dataRef.current)
        },
        [initialData, dataSource]
    )

    /**
     * Adjusts the ordinal x-axes' ranges when the plot is dragged to the left or right (the caller
     * redraws the plot)
     * @param x The amount that the plot is dragged
     * @param plotDimensions The dimensions of the plot
     * @param series An array of series names
     * @param ranges A map holding the axis ID and its associated range
     */
    const onPan = useCallback(
        (x: number,
         plotDimensions: Dimensions,
         series: Array<string>,
         ranges: Map<string, OrdinalAxisRange>
        ) => ordinalPanHandler(axesForSeries, margin, setAxisIntervalFor, xAxesState)(x, plotDimensions, series, ranges),
        [axesForSeries, margin, setAxisIntervalFor, xAxesState]
    )

    /**
     * Called when the user uses the scroll wheel (or scroll gesture) to zoom in or out. Zooms in/out
     * at the location of the mouse when the scroll wheel or gesture was applied.
     * @param zoomFactor The *cumulative* zoom scale factor for this event -- d3-zoom's own
     * `event.transform.k`, passed through unmodified. See {@link OrdinalAxisRange.scaledCumulative}
     * for why the ordinal x-axis needs this cumulative factor (from which it derives the
     * incremental step itself, and which it snaps back to `.original` at exactly 1).
     * @param x The x-position of the mouse when the scroll wheel or gesture is used
     * @param plotDimensions The dimensions of the plot
     * @param ranges A map holding the axis ID and its associated range
     */
    const onZoom = useCallback(
        (
            zoomFactor: number,
            x: number,
            plotDimensions: Dimensions,
            ranges: Map<string, OrdinalAxisRange>,
        ) => ordinalAxisZoomHandler(axesForSeries, margin, setAxisIntervalFor, setOriginalAxisIntervalFor, xAxesState)(zoomFactor, x, plotDimensions, ranges),
        [axesForSeries, margin, setAxisIntervalFor, setOriginalAxisIntervalFor, xAxesState]
    )

    // holds the current per-axis ordinal ranges, kept in sync by the effect below. Replaces
    // threading `ordinalRanges` through as an explicit `updatePlot` parameter, so the pan/zoom
    // handlers (now set up once, in a separate effect below, rather than inside `updatePlot`
    // itself) can always read the current ranges without needing `updatePlot` to be recreated
    // every time the ranges change.
    const ordinalRangesRef = useRef<Map<string, OrdinalAxisRange>>(new Map())

    // hands the current zoom/pan state (the ordinal x-axes' ranges, as fractions of their
    // original extent, and d3-zoom's cumulative `k`) to the `onZoomStateChange` callback
    const reportZoomState = useCallback(
        (cc: CanvasContext): void => {
            const ranges: Record<string, [number, number]> = {}
            ordinalRangesRef.current.forEach((range, axisId) => {
                const extent = range.original.measure()
                if (xAxesState.axes.has(axisId) && extent > 0) {
                    ranges[axisId] = [
                        (range.current.start - range.original.start) / extent,
                        (range.current.end - range.original.start) / extent
                    ]
                }
            })
            onZoomStateChange({k: d3.zoomTransform(cc.canvas).k, ranges})
        },
        [onZoomStateChange, xAxesState.axes]
    )

    // panning (dragging) and zooming (the mouse wheel) -- see `useCanvasZoomPan`. The ordinal zoom
    // takes d3-zoom's cumulative scale (`k`), rather than the incremental factor, so that it can
    // snap back to the original range exactly when fully zoomed out (see `OrdinalAxisRange.scale`)
    const {setZoomScale} = useCanvasZoomPan(canvasContext, {
        panEnabled,
        zoomEnabled,
        keyModifiersRequired: zoomKeyModifiersRequired,
        scaleExtent: [1, 10],
        translateExtent: [[margin.left, margin.top], [plotDimensions.width, plotDimensions.height]],
        // (tooltips are suppressed while panning, so that one isn't left behind)
        onPanStart: () => {
            allowTooltipRef.current = false
        },
        onPan: dx => {
            if (canvasContext === null) return
            onPan(dx, plotDimensions, dataRef.current.map(series => series.name), ordinalRangesRef.current)
            updatePlotRef.current(canvasContext)
        },
        onPanEnd: () => {
            allowTooltipRef.current = !(dataSource?.running ?? false)
            if (canvasContext !== null) reportZoomState(canvasContext)
        },
        onZoom: ({k, x}) => {
            if (canvasContext === null) return
            onZoom(k, x - margin.left, plotDimensions, ordinalRangesRef.current)
            updatePlotRef.current(canvasContext)
            reportZoomState(canvasContext)
        },
        onZoomReset,
        // restores each axis's range to its original
        resetView: () => {
            ordinalRangesRef.current.forEach((range, axisId) => {
                xAxesState.axisFor(axisId).ifPresent(axis => {
                    ordinalRangesRef.current.set(axisId, range.update(range.original.start, range.original.end))
                    setAxisIntervalFor(axisId, range.original)
                    axis.update(axis.scale.domain(), range.original, range.original, plotDimensions, margin)
                })
            })
            if (canvasContext !== null) updatePlotRef.current(canvasContext)
        },
    })

    // the zoom state to restore, captured once at mount (see the `zoomState` prop); cleared once
    // it has been applied (see `restoreZoomState` below), so it's only ever applied once
    const pendingZoomStateRef = useRef<BarPlotZoomState | undefined>(zoomState)

    // applies the pending zoom state (if any) to the ordinal x-axes' ranges and to d3-zoom's
    // transform on the canvas -- a remounted plot has a brand-new canvas, whose d3-zoom transform
    // starts at identity (k = 1). Both must be restored together: the ordinal zoom math derives
    // its incremental step from d3's cumulative `k` relative to the range's current/original width
    // ratio, and treats `k === 1` as "snap back to fully zoomed out" (see
    // `OrdinalAxisRange.scaledCumulative`), so restoring the ranges without `k` would make the
    // very next wheel tick jump. Waits (leaving the state pending) until every axis in the
    // snapshot exists, since the axes register themselves with the chart asynchronously.
    const restoreZoomState = useCallback(
        (): void => {
            const pending = pendingZoomStateRef.current
            if (pending === undefined) return
            const axisIds = Object.keys(pending.ranges)
            const ready = axisIds.every(axisId =>
                ordinalRangesRef.current.has(axisId) && xAxesState.axisFor(axisId).getOrUndefined() !== undefined
            )
            if (!ready || plotDimensions.width <= 0) return

            axisIds.forEach(axisId => {
                const range = ordinalRangesRef.current.get(axisId)
                const axis = xAxesState.axisFor(axisId).getOrUndefined()
                if (range === undefined || axis === undefined) return
                const [startFraction, endFraction] = pending.ranges[axisId]
                const {start: originalStart} = range.original
                const extent = range.original.measure()
                const current = AxisInterval.from(originalStart + startFraction * extent, originalStart + endFraction * extent)
                ordinalRangesRef.current.set(axisId, range.update(current.start, current.end))
                setAxisIntervalFor(axisId, current)
                axis.update(axis.scale.domain(), current, range.original, plotDimensions, margin)
            })
            // (set directly, without dispatching a "zoom" event -- see `setZoomScale`)
            setZoomScale(pending.k)
            pendingZoomStateRef.current = undefined
        },
        [margin, plotDimensions, setAxisIntervalFor, xAxesState, setZoomScale]
    )



    useEffect(
        () => {
            if (canvasContext) {
                const ordinalAxesRanges = axesRanges()
                // so this gets a bit complicated. the ordinal-ranges need to be updated whenever the ordinal-ranges
                // change. for example, when the window is resized, and then we need to update the
                // ordinal-range. however, we want to keep the ordinal-ranges to reflect their original scale so that
                // we can zoom properly (so the updates can't fuck with the scale).
                if (ordinalAxesRanges.size === 0) {
                    // when no time-ranges have yet been created, then create them and populate the
                    // existing ref's map in place (rather than replacing it -- reassigning `.current`
                    // once it's already in play elsewhere, e.g. the zoom/pan handlers, isn't allowed
                    // by react-hooks/immutability)
                    ordinalRangesRef.current.clear()
                    ordinalAxisRanges(xAxesState.axes)
                        .forEach((range, id) => ordinalRangesRef.current.set(id, range))
                } else {
                    // when the ordinal-ranges already exist, then we want to update the ordinal-ranges for each
                    // existing ordinal-range in a way that maintains the original scale.
                    const intervals = ordinalAxisIntervals(xAxesState.axes)
                    // todo instead of updating the underlying map, this should use setter methods to make the updates
                    ordinalAxesRanges
                        .forEach((range: OrdinalAxisRange, id: string, rangesMap: Map<string, OrdinalAxisRange>) => {
                            Optional
                                .ofNullable(intervals.get(id))
                                .map(intervalInfo => intervalInfo.interval.asTuple())
                                .ifPresent(([start, end]) => {
                                    // update the reference map with the new (start, end) portion of the range,
                                    // while keeping the original scale intact
                                    rangesMap.set(id, range.update(start, end) as OrdinalAxisRange)
                                })
                        })
                    ordinalRangesRef.current.clear()
                    ordinalAxesRanges.forEach((range, id) => ordinalRangesRef.current.set(id, range))
                }
                // restore a zoom state handed in from a previous instance (only does anything the
                // first time the axes are all available -- see `restoreZoomState`)
                restoreZoomState()
                updatePlot(canvasContext)
            }
        },
        [axesRanges, canvasContext, plotDimensions.width, updatePlot, xAxesState.axes, restoreZoomState]
    )

    // wires up a single mousemove/mouseleave listener on the shared canvas to replace the old
    // per-element SVG mouseover/mouseleave handlers. Hit-tests the mouse position against the
    // last-drawn geometry (see `geometryRef`, populated by the draw function above), keyed per
    // `${seriesName}::${elementType}` so the five overlaid elements resolve independently.
    useEffect(
        () => {
            if (!canvasContext) return

            const canvas = canvasContext.canvas

            // highlights (or un-highlights) the x- and y-axes a series is plotted against --
            // keyed on the series name alone (not the specific hovered element type), so moving
            // the mouse between a series' own bar/lines doesn't flicker the highlight off and on.
            // Unlike Scatter/Outlier, bar series styles don't carry a single flat highlight
            // color/width (they're nested per element type), so this uses the axis' own default
            // highlight styling rather than trying to match a specific element's highlight style.
            const highlightAxesFor = (seriesName: string, isHighlighted: boolean): void => {
                if (!highlightAxesOnMouseOver) return
                const [xAxis, yAxis] = axesFor(
                    seriesName,
                    axisAssignments,
                    axisId => xAxesState.axisFor(axisId).getOrUndefined(),
                    axisId => yAxesState.axisFor(axisId).getOrUndefined()
                )
                xAxis?.setHighlighted(isHighlighted)
                yAxis?.setHighlighted(isHighlighted)
            }

            const handleMove = (event: MouseEvent) => {
                const [x, y] = canvasLocalPoint(event, canvas)
                const hit = seriesAt(x, y, geometryRef.current)
                // geometry keys are "${seriesName}::${elementType}"; split back apart
                const [hitSeriesName, hitElementType] = hit !== undefined ? hit.name.split('::') : [undefined, undefined]

                const previous = lastHoveredRef.current
                const sameAsBefore = previous !== undefined && hitSeriesName === previous.seriesName && hitElementType === previous.elementType

                if (previous?.seriesName !== hitSeriesName) {
                    if (previous !== undefined) highlightAxesFor(previous.seriesName, false)
                    if (hitSeriesName !== undefined) highlightAxesFor(hitSeriesName, true)
                }

                if (!sameAsBefore) {
                    if (previous !== undefined) {
                        handleMouseLeaveSeries(
                            previous.seriesName,
                            mouseLeaveHandlerFor(`tooltip-${chartId}`, PROVIDER_ID_FOR_ELEMENT_TYPE[previous.elementType])
                        )
                    }

                    if (hitSeriesName !== undefined && hitElementType !== undefined) {
                        const series = seriesRef.current.get(hitSeriesName)
                        const yAxis = axesFor(
                            hitSeriesName,
                            axisAssignments,
                            axisId => xAxesState.axisFor(axisId).getOrUndefined(),
                            axisId => yAxesState.axisFor(axisId).getOrUndefined()
                        )[1]
                        const showingByType: Record<string, boolean> = {
                            minMax: showMinMaxBars,
                            windowedMinMax: showWindowedMinMaxBars,
                            meanValue: showMeanValueLines,
                            windowedMeanValue: showWindowedMeanValueLines,
                            currentValue: showValueLines,
                        }
                        if (series !== undefined && yAxis !== undefined && allowTooltipRef.current && showingByType[hitElementType]) {
                            handleMouseOverBar(
                                yAxis,
                                series,
                                statsRef.current,
                                [x, y],
                                margin,
                                mouseOverHandlerFor(`tooltip-${chartId}`, PROVIDER_ID_FOR_ELEMENT_TYPE[hitElementType])
                            )
                        }
                    }

                    lastHoveredRef.current = hitSeriesName !== undefined && hitElementType !== undefined ?
                        {seriesName: hitSeriesName, elementType: hitElementType} :
                        undefined

                    // the value-line and windowed-mean-line highlight depends on hover state, so
                    // request a redraw when it changes
                    canvasContext.requestRedraw()
                }
            }

            const handleLeaveCanvas = () => {
                const previous = lastHoveredRef.current
                if (previous !== undefined) {
                    handleMouseLeaveSeries(previous.seriesName, mouseLeaveHandlerFor(`tooltip-${chartId}`, PROVIDER_ID_FOR_ELEMENT_TYPE[previous.elementType]))
                    highlightAxesFor(previous.seriesName, false)
                    lastHoveredRef.current = undefined
                    canvasContext.requestRedraw()
                }
            }

            canvas.addEventListener('mousemove', handleMove)
            canvas.addEventListener('mouseleave', handleLeaveCanvas)
            return () => {
                canvas.removeEventListener('mousemove', handleMove)
                canvas.removeEventListener('mouseleave', handleLeaveCanvas)
            }
        },
        [
            canvasContext, chartId, margin, axisAssignments, xAxesState, yAxesState,
            mouseOverHandlerFor, mouseLeaveHandlerFor,
            showMinMaxBars, showWindowedMinMaxBars, showMeanValueLines, showWindowedMeanValueLines, showValueLines,
            highlightAxesOnMouseOver
        ]
    )

    // the latest `updateTimingAndPlot`, for the view driver to call -- the driver is created once
    // per run (see below), so it must not capture a stale one (e.g. bound to an older canvas)
    const updateTimingAndPlotRef = useRef(updateTimingAndPlot)
    useEffect(
        () => {
            updateTimingAndPlotRef.current = updateTimingAndPlot
        },
        [updateTimingAndPlot]
    )

    // creates the view driver that keeps this plot's view in step with the data source, using the
    // current settings -- see `useStreamingTimeAxes`'s identical effect event
    const createViewDriver = useEffectEvent(
        (source: NonNullable<typeof dataSource>) => ordinalViewDriverFor(
            source,
            windowingTime,
            () => updateTimingAndPlotRef.current(),
            currentTime => currentTimeRef.current = currentTime,
        )
    )

    // while the data source is running (and this plot has a canvas), drive the view from the
    // data source's updates -- see `useStreamingTimeAxes`'s identical effect. The driver belongs to this plot
    // instance alone and is always torn down with it.
    useEffect(
        () => {
            if (dataSource === undefined || !running || canvasContext === null) return
            allowTooltipRef.current = false
            const driver = createViewDriver(dataSource)
            return () => {
                driver.unsubscribe()
                allowTooltipRef.current = true
            }
        },
        [dataSource, running, canvasContext]
    )

    // this plot needs a data source (see the `Chart`'s `dataSource` prop)
    useEffect(
        () => {
            if (dataSource === undefined) {
                console.error("BarPlot requires a data source; set the enclosing Chart's `dataSource` prop")
            }
        },
        [dataSource]
    )

    // unregister this plot's draw function on unmount
    useEffect(
        () => {
            return () => {
                if (canvasContext) {
                    canvasContext.unregister(`bar-plot-autoscale-${chartId}`)
                    canvasContext.unregister(`bar-plot-${chartId}`)
                }
            }
        },
        [canvasContext, chartId]
    )

    return null
}

/*
    Helper functions and types
 */

type BarDimensions = {
    upperX: number
    upperY: number
    width: number
    height: number
}

/**
 * The bar style, made fully transparent when the bar isn't shown
 * @param isVisible Whether the bar is shown
 * @param style The bar's style
 * @return The style (with its fill and stroke opacities 0 when the bar isn't shown)
 */
function barStyleFor(isVisible: boolean, style: BarStyle): BarStyle {
    return {
        ...style,
        fill: updateOpacityFor<SvgFillStyle>(isVisible, style.fill),
        stroke: updateOpacityFor<SvgStrokeStyle>(isVisible, style.stroke)
    }
}

/**
 * The fill or stroke style, made fully transparent when its element isn't shown
 * @param isVisible Whether the element is shown
 * @param style The fill or stroke style
 * @return The style (with an opacity of 0 when the element isn't shown)
 */
function updateOpacityFor<S extends SvgFillStyle | SvgStrokeStyle>(isVisible: boolean, style: S): S {
    return {
        ...style,
        opacity: isVisible ? style.opacity : 0
    }
}

/**
 * Draws a bar (rectangle) onto the canvas context. Replaces the old `barFor`, which set SVG
 * `<rect>` attributes via a d3 selection.
 * @param context The canvas 2D context
 * @param dimensions The bar's dimensions
 * @param style The bar style holding the fill and stroke styles
 */
function drawBar(
    context: CanvasRenderingContext2D,
    dimensions: BarDimensions,
    style: BarStyle
): void {
    if (dimensions.width <= 0 || dimensions.height <= 0) return

    applyFillStyle(context, style.fill)
    context.fillRect(dimensions.upperX, dimensions.upperY, dimensions.width, dimensions.height)

    if ((style.stroke.width ?? 0) > 0) {
        applyStrokeStyle(context, style.stroke)
        context.strokeRect(dimensions.upperX, dimensions.upperY, dimensions.width, dimensions.height)
    }
}

/**
 * Draws a horizontal line segment (used for the value/mean/windowed-mean lines) onto the canvas
 * context. Replaces the old `lineFor`, which set SVG `<line>` attributes via a d3 selection.
 * @param context The canvas 2D context
 * @param x1 The line's start x-coordinate
 * @param y1 The line's start y-coordinate
 * @param x2 The line's end x-coordinate
 * @param y2 The line's end y-coordinate
 * @param strokeStyle The stroke style
 */
function drawLine(
    context: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    strokeStyle: Partial<SvgStrokeStyle>
): void {
    applyStrokeStyle(context, strokeStyle)
    context.beginPath()
    context.moveTo(x1, y1)
    context.lineTo(x2, y2)
    context.stroke()
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
 * @param dataSource The chart's data source
 * @param series The series to calculate the stats for when the data source doesn't keep them
 * @return The data source's (live) stats when it keeps them (i.e. an ordinal data source);
 * otherwise, the stats calculated from the specified series
 */
function statsFrom(dataSource: unknown, series: Array<BaseSeries<OrdinalDatum>>): WindowedOrdinalStats {
    return dataSource !== null && typeof dataSource === 'object' && 'stats' in dataSource ?
        (dataSource as {stats: WindowedOrdinalStats}).stats :
        initialOrdinalStats(series)
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
 * Attempts to locate the x- and y-axes for the specified series. If the series has no axis
 * assignment, then uses the default (first) x- and y-axes.
 * @param seriesName Name of the series for which to retrieve the axis
 * @param axisAssignments A map holding the series name and the associated x- and y-axes assigned
 * to that series. Note that the series in the axis-assignment map is merely a subset of the set
 * of series names.
 * @param xAxisFor The function that accepts an axis ID and returns the corresponding x-axis
 * @param yAxisFor The function that accepts an axis ID and returns the corresponding y-axis
 * @return A 2d tuple holding the category x-axis as its first element and the linear y-axis as
 * the second element (either is actually `undefined` when it isn't found, despite the type).
 * @throws Error when the x-axis isn't a category axis, or the y-axis isn't a continuous numeric axis
 */
function axesFor(
    seriesName: string,
    axisAssignments: Map<string, AxesAssignment>,
    xAxisFor: (id: string) => BaseAxis | undefined,
    yAxisFor: (id: string) => BaseAxis | undefined,
): [xAxis: OrdinalStringAxis, yAxis: ContinuousNumericAxis] {
    const axes = axisAssignments.get(seriesName)
    const xAxis = xAxisFor(axes?.xAxis || "")
    checkAxisType("BarPlot", "x", xAxis, AxisType.OrdinalString)
    const xAxisCategory = xAxis as OrdinalStringAxis
    const yAxis = yAxisFor(axes?.yAxis || "")
    checkAxisType("BarPlot", "y", yAxis, AxisType.ContinuousNumeric)
    const yAxisContinuous = yAxis as ContinuousNumericAxis
    return [xAxisCategory, yAxisContinuous]
}

/**
 * Calculates the lower (left) and upper (right) x-coordinates of a category's lines, inside its
 * margins
 * @param categorySize The size of the category (i.e. plot_width / num_series)
 * @param lineWidth The width of the series line
 * @param margin The margin applied to the left and right of the category's lines (horizontal spacing)
 * @return An object with two functions, that when handed the category's (left) x-coordinate,
 * return the location of the start (lower) or end (upper) of its lines (when the category is no
 * wider than the margin, the lines are just the line width long)
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
 * Reports a tooltip for the hovered element of a series in the bar chart (see {@link BarPlotTooltipContent}).
 * Replaces the old version, which also mutated the hovered SVG element's stroke directly for the
 * two element types that support a highlight (`currentValue`, `windowedMeanValue`); that highlight
 * is now handled by the draw function checking the hover state (see `updatePlot`'s `draw`) rather
 * than by touching an element here.
 * @param yAxis The y-axis
 * @param selectedSeries The selected series
 * @param seriesStats The statistics about the current series
 * @param mouseCoords The `[x, y]` position of the mouse, in canvas coordinates
 * @param margin The plot margin
 * @param mouseOverHandlerFor The handler for the mouse over (registered by the <Tooltip/>)
 */
function handleMouseOverBar(
    yAxis: ContinuousNumericAxis,
    selectedSeries: BaseSeries<OrdinalDatum>,
    seriesStats: WindowedOrdinalStats,
    mouseCoords: [x: number, y: number],
    margin: Margin,
    mouseOverHandlerFor: ((
        seriesName: string,
        value: number,
        tooltipData: TooltipData<OrdinalDatum, WindowedOrdinalStats>,
        mouseCoords: [x: number, y: number]
    ) => void) | undefined,
): void {
    const [, y] = mouseCoords
    const value = yAxis.scale.invert(y - margin.top)

    const {name: categoryName, data: selectedData} = selectedSeries

    if (mouseOverHandlerFor) {
        // the contract for the mouse over handler is for a series
        mouseOverHandlerFor(categoryName, value, {series: selectedData, metadata: seriesStats}, mouseCoords)
    }
}

/**
 * Calls the mouse-leave-series handler registered for this series. Replaces the old version, which
 * also reset the hovered SVG element's stroke color/width directly; that reset is now implicit --
 * once the hover state no longer matches this element, the next redraw simply paints it in its
 * normal (non-highlighted) style.
 * @param seriesName The name of the series (i.e. the neuron ID)
 * @param mouseLeaverHandlerFor Registered handler for the series when the mouse leaves
 */
function handleMouseLeaveSeries(
    seriesName: string,
    mouseLeaverHandlerFor: ((seriesName: string) => void) | undefined,
): void {
    if (mouseLeaverHandlerFor) {
        mouseLeaverHandlerFor(seriesName)
    }
}
