import {type RefObject, useCallback, useEffect, useEffectEvent, useMemo, useRef} from "react";
import {Optional} from "result-fn";
import {
    axesForSeriesGen,
    type ContinuousNumericAxis,
    continuousAxisIntervals,
    continuousAxisRanges,
    continuousAxisZoomHandler,
    defaultLineStyle,
    panHandler,
    type SeriesLineStyle,
} from "../axes/axes";
import {AxisInterval} from "../axes/AxisInterval";
import {ContinuousAxisRange} from "../axes/ContinuousAxisRange";
import type {CanvasContext} from "../d3types";
import type {StreamingDataSource} from "../datasources/StreamingDataSource";
import {useChart} from "../hooks/useChart";
import {useHoveredSeries} from "../hooks/useHoveredSeries";
import {usePlotDimensions} from "../hooks/usePlotDimensions";
import {useStreamingSettings} from "../hooks/useDataSource";
import type {ChartData} from "../observables/ChartData";
import type {BaseSeries} from "../series/baseSeries";
import {type AxisTimesFor, timeAxisViewDriverFor, TimeWindowBehavior} from "../subscriptions/viewDrivers";
import {noop} from "../utils";
import {type AxesAssignment, currentIntervalsFrom} from "./plot";
import {useCanvasZoomPan} from "./useCanvasZoomPan";

/**
 * The options for {@link useStreamingTimeAxes}
 * @template CD The type of the chart data
 * @template D The type of the series' datum
 */
export interface StreamingTimeAxesOptions<CD extends ChartData, D> {
    /**
     * The plot's canvas context (`null` until the canvas exists)
     */
    canvasContext: CanvasContext | null
    /**
     * The data source (and whether it's running)
     */
    dataSource: StreamingDataSource<CD, D> | undefined
    running: boolean
    /**
     * The series the data source held when it was handed to the chart (see `useInitialData`)
     */
    initialData: Array<BaseSeries<D>>
    /**
     * The time of a datum (its x-value)
     */
    timeOf: (datum: D) => number
    /**
     * Gives the current time of each x-axis that a chunk of data has new points for (see
     * `timeSeriesAxisTimes` and `outlierAxisTimes`)
     */
    axisTimesFor: AxisTimesFor<CD>
    /**
     * The assignment of the series to their x- and y-axes
     */
    axisAssignments: Map<string, AxesAssignment>
    /**
     * Draws the plot (registers its draw function with the canvas context, and requests a redraw)
     */
    updatePlot: (canvasContext: CanvasContext) => void
    /**
     * Resets the plot's own references to the data, when the data source is replaced -- called just
     * before the axes are reset and the plot is redrawn
     */
    onDataReset: () => void
    /**
     * Whether the plot may show tooltips: when given, it's cleared while panning and while the data
     * source is running, and restored afterward
     */
    allowTooltipRef?: RefObject<boolean>
    /**
     * Panning and zooming (see {@link useCanvasZoomPan})
     */
    panEnabled: boolean
    zoomEnabled: boolean
    zoomKeyModifiersRequired: boolean
    /**
     * The plot's `onZoomReset` property (see {@link useCanvasZoomPan})
     */
    onZoomReset?: (resetZoom: () => void) => void
    /**
     * The time (ms) between cadence ticks (none, when undefined -- see `timeAxisViewDriverFor`)
     */
    withCadenceOf?: number
    /**
     * Whether the time axes scroll or squeeze as data passes their ends (defaults to SCROLL)
     */
    timeWindowBehavior?: TimeWindowBehavior
    /**
     * When true, the x- and y-axes of the hovered series are highlighted (in the series' own
     * highlight color and width)
     */
    highlightAxesOnMouseOver: boolean
}

/**
 * The time (x-) axes of a streaming time plot (the scatter, raster, and outlier plots): keeps each
 * x-axis's range in step with the data, and with the user's panning and zooming, and reports the
 * ranges.
 *
 * - **The ranges.** One map of the x-axes' ranges, built once and mutated in place: the zoom and
 *   pan handlers, and the view driver, all work on the same map, so that neither undoes the
 *   other (the view driver hands its map back through `updateTimingAndPlot`, which re-points the
 *   map at it).
 * - **The view driver.** While the data source runs, a view driver (see `timeAxisViewDriverFor`)
 *   advances the ranges as the data arrives (or with cadence), records each axis's current time,
 *   and redraws the plot. It belongs to this plot alone, and is torn down with it.
 * - **Panning and zooming.** While running, the zoom pivots on each axis's current time ("now");
 *   while paused, on the mouse. A zoom reset restores the axes' original ranges (as captured when
 *   the data source was handed to the plot).
 * - **Reporting.** The axes' intervals are reported to the chart's `onUpdateAxesBounds` (at most
 *   once per animation frame, since zooming and panning fire many events).
 * - **A new data source** (new initial data) resets the plot's data, the axes' ranges (starting at
 *   the data's first time), and the original ranges a zoom reset restores.
 * - **Highlighting.** Optionally, highlights the hovered series' axes.
 * @param options The plot's canvas, data, handlers, and settings
 * @template CD The type of the chart data
 * @template D The type of the series' datum
 */
export function useStreamingTimeAxes<CD extends ChartData, D>(options: StreamingTimeAxesOptions<CD, D>): void {
    const {
        canvasContext, dataSource, running, initialData, timeOf, axisTimesFor, axisAssignments,
        updatePlot, onDataReset, allowTooltipRef,
        panEnabled, zoomEnabled, zoomKeyModifiersRequired, onZoomReset,
        withCadenceOf, timeWindowBehavior = TimeWindowBehavior.SCROLL,
        highlightAxesOnMouseOver,
    } = options

    const {chartId, color, axes, seriesStyles} = useChart<D, SeriesLineStyle, unknown, ContinuousAxisRange, ContinuousNumericAxis>()
    const {xAxesState, yAxesState, setAxisIntervalFor, updateAxisRanges = noop, onUpdateAxesInterval} = axes
    const {plotDimensions, margin} = usePlotDimensions()
    const {windowingTime, dataUpdatePeriod} = useStreamingSettings()
    const {hoveredSeriesName} = useHoveredSeries()

    // the x-axes' ranges: built once, and mutated in place by the zoom and pan handlers (and
    // re-pointed at the view driver's map by `updateTimingAndPlot`)
    const timeRangesRef = useRef<Map<string, ContinuousAxisRange>>(new Map())
    // map(axis_id -> current_time), recorded by the view driver; the zoom pivots on it while
    // running. Empty (rather than 0 per axis) until the driver records a time, so that the zoom
    // pivot falls back to the axis' own domain
    const currentTimeRef = useRef<Map<string, number>>(new Map())
    // the axes' true original (un-zoomed) bounds, which a zoom reset restores, and each axis' pinned
    // start time for SQUEEZE -- captured when the data source is handed to the plot (see
    // `resetForNewData`), rather than via a `useMemo` on the axes context, which re-samples the
    // ranges' `.original` as auto-scroll moves it
    const initialAxisIntervalsRef = useRef<Map<string, [start: number, end: number]>>(new Map())
    const initialTimesRef = useRef<Map<string, number>>(new Map())

    // the latest draw and axis-range-update functions (called from the view driver, and the zoom
    // and pan handlers)
    const updatePlotRef = useRef(updatePlot)
    useEffect(() => {
        updatePlotRef.current = updatePlot
    }, [updatePlot])
    const updateAxisRangesRef = useRef(updateAxisRanges)
    useEffect(() => {
        updateAxisRangesRef.current = updateAxisRanges
    }, [updateAxisRanges])

    // reports the axes' intervals to the chart's `onUpdateAxesBounds`, at most once per animation
    // frame (zooming and panning fire many events per gesture, and the callback generally updates
    // the application's state). Coalescing loses nothing: the deferred notification reports the
    // *latest* ranges (`pendingRangesRef`), not those of the call that scheduled it -- the ranges
    // map is sometimes replaced (e.g. on a reset), and reporting a stale map would write stale
    // intervals into the application's state.
    const notifyIntervalsRef = useRef<(ranges: Map<string, ContinuousAxisRange>) => void>(noop)
    const notifyFrameRef = useRef<number>(0)
    const pendingRangesRef = useRef<Map<string, ContinuousAxisRange>>(new Map())
    useEffect(() => {
        notifyIntervalsRef.current = onUpdateAxesInterval === undefined ?
            noop :
            ranges => {
                pendingRangesRef.current = ranges
                if (notifyFrameRef.current !== 0) return
                notifyFrameRef.current = requestAnimationFrame(() => {
                    notifyFrameRef.current = 0
                    onUpdateAxesInterval(currentIntervalsFrom(pendingRangesRef.current))
                })
            }
    }, [onUpdateAxesInterval])
    // don't leave a scheduled notification pointing at an unmounted plot
    useEffect(() => () => {
        if (notifyFrameRef.current !== 0) {
            cancelAnimationFrame(notifyFrameRef.current)
            notifyFrameRef.current = 0
        }
    }, [])

    // new x-axes: forget the current times (see `currentTimeRef`)
    useEffect(() => {
        currentTimeRef.current = new Map()
    }, [xAxesState])

    // highlights the hovered series' x- and y-axes, and un-highlights them (in the effect's
    // cleanup) when the hover moves to a different series, or ends
    useEffect(() => {
        if (!highlightAxesOnMouseOver || hoveredSeriesName === null) return
        const assignment = axisAssignments.get(hoveredSeriesName)
        const xAxis = xAxesState.axisFor(assignment?.xAxis || "").getOrUndefined()
        const yAxis = yAxesState.axisFor(assignment?.yAxis || "").getOrUndefined()
        const {highlightColor, highlightWidth} = seriesStyles.get(hoveredSeriesName) || defaultLineStyle()
        xAxis?.setHighlighted(true, highlightColor, highlightWidth)
        yAxis?.setHighlighted(true, highlightColor, highlightWidth)
        return () => {
            xAxis?.setHighlighted(false)
            yAxis?.setHighlighted(false)
        }
    }, [highlightAxesOnMouseOver, hoveredSeriesName, axisAssignments, xAxesState, yAxesState, seriesStyles])

    // the distinct x-axes that the series use
    const axesForSeries = useMemo(
        (): Array<string> => axesForSeriesGen<D, ContinuousNumericAxis>(initialData, axisAssignments, xAxesState),
        [initialData, axisAssignments, xAxesState]
    )

    // hands new ranges to the axes, makes them the plot's ranges (see `timeRangesRef`), redraws the
    // plot, and reports the axes' intervals
    const updateTimingAndPlot = useCallback(
        (ranges: Map<string, ContinuousAxisRange>): void => {
            if (canvasContext === null) return
            updateAxisRangesRef.current(ranges)
            timeRangesRef.current = ranges
            updatePlotRef.current(canvasContext)
            notifyIntervalsRef.current(ranges)
        },
        [canvasContext]
    )

    // a new data source (new initial data): resets the plot's data, the current times, and the
    // original bounds (for a zoom reset), and starts each axis at the data's first time. (An effect
    // event, so that it runs only when the initial data changes, with the latest everything else.)
    const resetForNewData = useEffectEvent(() => {
        onDataReset()
        currentTimeRef.current = new Map()

        const freshRanges = continuousAxisRanges(xAxesState.axes)
        initialAxisIntervalsRef.current = new Map(
            Array.from(freshRanges.entries()).map(([id, range]) => [id, range.original.asTuple()])
        )
        initialTimesRef.current = new Map(
            Array.from(freshRanges.entries()).map(([id, range]) => [id, range.original.start])
        )

        updateTimingAndPlot(new Map(Array.from(freshRanges.entries()).map(([id, range]) => {
            const [start, end] = range.original.asTuple()
            const firstTime = initialData
                .filter(series => axisAssignments.get(series.name)?.xAxis === id)
                .reduce((tMin, series) => Math.min(tMin, !series.isEmpty() ? timeOf(series.data[0]) : tMin), Infinity)
            const startTime = firstTime === Infinity ? 0 : firstTime
            return [id, ContinuousAxisRange.from(startTime, startTime + end - start)]
        })))
    })
    useEffect(() => {
        resetForNewData()
    }, [initialData])

    // pans the axes (in place) by the dragged amount
    const onPan = useCallback(
        (x: number, ranges: Map<string, ContinuousAxisRange>) =>
            panHandler(axesForSeries, margin, setAxisIntervalFor, xAxesState)(x, plotDimensions, ranges),
        [axesForSeries, margin, setAxisIntervalFor, xAxesState, plotDimensions]
    )

    // zooms the axes (in place) by the incremental zoom factor, around each axis's pivot
    const onZoom = useCallback(
        (zoomFactor: number, pivotFor: (axisId: string, axis: ContinuousNumericAxis) => number, ranges: Map<string, ContinuousAxisRange>) =>
            continuousAxisZoomHandler(axesForSeries, margin, setAxisIntervalFor, xAxesState)(zoomFactor, pivotFor, plotDimensions, ranges),
        [axesForSeries, margin, setAxisIntervalFor, xAxesState, plotDimensions]
    )

    // what the zoom pivots on: while running, each axis's "now" (so the newest data stays put,
    // whether or not the axis has started scrolling yet -- falling back to the axis' right edge
    // until the view driver records a time); while paused, the mouse
    const zoomPivotFor = useCallback(
        (offsetX: number): (axisId: string, axis: ContinuousNumericAxis) => number =>
            running ?
                (axisId, axis) => currentTimeRef.current.get(axisId) ?? axis.scale.domain()[1] :
                (_axisId, axis) => axis.scale.invert(offsetX - margin.left),
        [running, margin]
    )

    useCanvasZoomPan(canvasContext, {
        panEnabled,
        zoomEnabled,
        keyModifiersRequired: zoomKeyModifiersRequired,
        scaleExtent: [0, 10],
        translateExtent: [[margin.left, margin.top], [plotDimensions.width, plotDimensions.height]],
        // (tooltips are suppressed while panning, so that one isn't left behind)
        onPanStart: () => {
            if (allowTooltipRef !== undefined) allowTooltipRef.current = false
        },
        onPan: dx => {
            if (canvasContext === null) return
            onPan(dx, timeRangesRef.current)
            updatePlotRef.current(canvasContext)
            // the pan updated the axes' ranges in place, so report the new intervals
            notifyIntervalsRef.current(timeRangesRef.current)
        },
        onPanEnd: () => {
            if (allowTooltipRef !== undefined) allowTooltipRef.current = !(dataSource?.running ?? false)
        },
        onZoom: ({factor, x}) => {
            if (canvasContext === null) return
            onZoom(factor, zoomPivotFor(x), timeRangesRef.current)
            updatePlotRef.current(canvasContext)
            // the zoom updated the axes' ranges in place, so report the new intervals
            notifyIntervalsRef.current(timeRangesRef.current)
        },
        onZoomReset,
        // restores each axis to its true original bounds (see `initialAxisIntervalsRef`), and does
        // a full sync (through `updateTimingAndPlot`), so that the AxesProvider's own ranges pick up
        // the reset `.original` too -- otherwise a reset while paused (with no ticks left to resync
        // them) would leave them at the zoomed bounds, which a store-backed domain then reads back
        resetView: () => {
            initialAxisIntervalsRef.current.forEach(([start, end], axisId) => {
                timeRangesRef.current.set(axisId, ContinuousAxisRange.from(start, end))
                xAxesState.axisFor(axisId).ifPresent(
                    axis => axis.update(AxisInterval.from(start, end), plotDimensions, margin)
                )
            })
            updateTimingAndPlot(timeRangesRef.current)
        },
    })

    // keeps the ranges in step with the axes when the canvas, the axes, or the plot's dimensions
    // change (creating them the first time, and afterward updating them in place, so that their
    // `.original` -- and the map's identity -- survive), and redraws
    useEffect(() => {
        if (canvasContext === null) return
        if (timeRangesRef.current.size === 0) {
            continuousAxisRanges(xAxesState.axes).forEach((range, id) => timeRangesRef.current.set(id, range))
        } else {
            const intervals = continuousAxisIntervals(xAxesState.axes)
            timeRangesRef.current.forEach((range, id, rangesMap) => {
                const [start, end] = Optional.ofNullable(intervals.get(id))
                    .map(interval => interval.asTuple())
                    .getOrThrow(() => new Error(`Unable to retrieve interval for axis; axis_id: ${id}`))
                if (!isNaN(start) && !isNaN(end)) {
                    rangesMap.set(id, range.update(start, end))
                }
            })
        }
        updatePlot(canvasContext)
    }, [chartId, color, canvasContext, plotDimensions, updatePlot, xAxesState])

    // the latest `updateTimingAndPlot`, for the view driver (created once per run) to call
    const updateTimingAndPlotRef = useRef(updateTimingAndPlot)
    useEffect(() => {
        updateTimingAndPlotRef.current = updateTimingAndPlot
    }, [updateTimingAndPlot])

    // creates the view driver, with the current settings (an effect event, so that the driver is
    // created only when the run starts, with the settings as they are then)
    const createViewDriver = useEffectEvent(
        (source: StreamingDataSource<CD, D>) => timeAxisViewDriverFor(
            source, xAxesState, axisTimesFor,
            ranges => updateTimingAndPlotRef.current(ranges),
            (axisId, end) => currentTimeRef.current.set(axisId, end),
            {
                windowingTime,
                dataUpdatePeriod,
                cadencePeriod: withCadenceOf,
                timeWindowBehavior,
                initialTimes: initialTimesRef.current,
            }
        )
    )

    // while the data source runs (and the plot has a canvas and x-axes), drives the view from the
    // data source's updates. The driver belongs to this plot alone, and is always torn down with it.
    const hasXAxes = xAxesState.axes.size > 0
    useEffect(() => {
        if (dataSource === undefined || !running || canvasContext === null || !hasXAxes) return
        if (allowTooltipRef !== undefined) allowTooltipRef.current = false
        const driver = createViewDriver(dataSource)
        return () => {
            driver.unsubscribe()
            if (allowTooltipRef !== undefined) allowTooltipRef.current = true
        }
    }, [dataSource, running, canvasContext, hasXAxes, allowTooltipRef])
}
