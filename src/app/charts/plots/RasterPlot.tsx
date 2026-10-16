import {type AxesAssignment, clipToArea, currentIntervalsFrom, type Series} from "./plot";
import * as d3 from "d3";
import {type D3DragEvent, type D3ZoomEvent} from "d3";
import {noop} from "../utils";
import {useChart} from "../hooks/useChart";
import type {RasterTooltipMetadata} from "../tooltips/tooltipUtils";
import {useCallback, useEffect, useEffectEvent, useMemo, useRef} from "react";
import type {Datum, TimeSeries} from "../series/timeSeries";
import {
    axesForSeriesGen,
    type BaseAxis,
    AxisType,
    continuousAxisIntervals,
    continuousAxisRanges,
    continuousAxisZoomHandler,
    type ContinuousNumericAxis,
    defaultLineStyle,
    type OrdinalStringAxis,
    panHandler,
    type SeriesLineStyle
} from "../axes/axes";
import type {CanvasContext} from "../d3types";
import {seriesAt, canvasLocalPoint, type SeriesGeometry} from "./hitTesting";
import type {Dimensions, Margin} from "../styling/margins";
import {timeSeriesViewDriverFor, timeSeriesWithCadenceViewDriverFor} from "../subscriptions/viewDrivers";
import {useDataObservable} from "../hooks/useDataObservable";
import {useDataSource, useDataSourceRunning} from "../hooks/useDataSource";
import type {TimeSeriesChartData} from "../series/timeSeriesChartData";
import {usePlotDimensions} from "../hooks/usePlotDimensions";
import {useInitialData} from "../hooks/useInitialData";
import type {TooltipData} from "../hooks/useTooltip";
import {Optional} from "result-fn";
import {ContinuousAxisRange} from "../axes/ContinuousAxisRange";
import {AxisInterval} from "../axes/AxisInterval";
import {FastShiftArray} from "fast-shift-array";

/**
 * The properties of the {@link RasterPlot}
 */
export interface Props {
    /**
     * Holds the mapping between a series and the axis it uses (is assigned). The
     * map's key holds the series name, and the value is an {@link AxesAssignment}
     * object holding the ID of the assigned x-axis and y-axis.
     */
    axisAssignments?: Map<string, AxesAssignment>
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
     * to activate the zoom
     */
    zoomKeyModifiersRequired?: boolean
    /**
     * When set, uses a cadence with the specified refresh period (in milliseconds). For plots
     * where the updates are slow (> 100 ms) using a cadence of 10 to 25 ms smooths out the
     * updates and makes the plot updates look cleaner. When updates are around 25 ms or less,
     * then setting the cadence period too small will result in poor update performance. Generally
     * at high update speeds, the cadence is unnecessary. Finally, using cadence, sets the max time
     * to the current time.
     */
    withCadenceOf?: number
    /**
     * The (optional, default = 2 pixels) top and bottom margin (in pixels) for the spike lines in the plot.
     * Margins on individual series can also be set through the {@link Chart.seriesStyles} property.
     */
    spikeMargin?: number
    /**
     * When true, hovering over a series also highlights the x- and y-axes it is plotted
     * against (in the series' own highlight color/width). Defaults to `false`.
     */
    highlightAxesOnMouseOver?: boolean
    /**
     * Called whenever this plot (re)creates its zoom behavior, handing
     * the caller a `resetZoom` function that programmatically clears d3-zoom's own accumulated
     * scale/pan state back to identity. See {@link ScatterPlot}'s identical prop for the full
     * explanation of why this is needed. Only meaningful (called) while `zoomEnabled` is true.
     */
    onZoomReset?: (resetZoom: () => void) => void
}

/**
 * Renders a streaming neuron raster plot for the series held by the {@link StreamingDataSource}
 * handed to the {@link Chart} (its `dataSource` prop). This component uses the {@link useChart}
 * hook, and therefore must be a child of the {@link Chart} in order to be plugged in to the
 * chart ecosystem (axes, tracker, tooltip).
 *
 * The plot never subscribes to the data stream itself -- see {@link ScatterPlot} for how the
 * application-owned data source and this plot's mount-scoped view driver divide the work.
 *
 * Internally, this no longer creates/updates SVG `<line>` elements. Instead, it registers a single
 * draw function with the chart's {@link CanvasContext} that redraws every series' spikes from
 * scratch each time the canvas repaints. Mouse hover (for the tooltip) is handled by hit-testing
 * the mouse position against the last-drawn spike geometry -- as *disjoint* segments, since unlike
 * a scatter series, consecutive spikes are not connected by a line (see `hitTesting.ts`). When
 * the data source is paused, hovering over a spike shows the tooltip (when there's one).
 *
 * @param props The properties associated with the raster plot
 * @return `null` (the plot draws onto the chart's canvas)
 * @example
 <RasterPlot
     axisAssignments={new Map([
        ['neuron1', assignAxes("x-axis-2", "y-axis-2")],
        ['neuron2', assignAxes("x-axis-2", "y-axis-2")],
     ])}
     spikeMargin={1}
     panEnabled={true}
     zoomEnabled={true}
     zoomKeyModifiersRequired={true}
 />
 */
export function RasterPlot(props: Props): null {
    const {
        chartId,
        canvasContext,
        axes,
        color,
        seriesStyles,
        seriesFilter,
        mouse,
        hoveredSeriesName,
    } = useChart<Datum, SeriesLineStyle, RasterTooltipMetadata, ContinuousAxisRange, ContinuousNumericAxis>()

    const {
        xAxesState,
        yAxesState,
        setAxisAssignments,
        setAxisIntervalFor,
        updateAxisRanges = noop,
        onUpdateAxesInterval,
    } = axes

    const {mouseOverHandlerFor, mouseLeaveHandlerFor} = mouse

    const {plotDimensions, margin} = usePlotDimensions()

    const {
        windowingTime = 100,
        dataUpdatePeriod,
    } = useDataObservable()

    // the application-owned source of the data, and whether it's running (streaming)
    const dataSource = useDataSource<TimeSeriesChartData, Datum, TimeSeries>()
    const running = useDataSourceRunning(dataSource)

    const {initialData} = useInitialData<Datum>()

    const {
        axisAssignments = new Map<string, AxesAssignment>(),
        panEnabled = false,
        zoomEnabled = false,
        zoomKeyModifiersRequired = true,
        withCadenceOf,
        spikeMargin = 2,
        highlightAxesOnMouseOver = false,
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
    // time-series, e.i. an array of BaseSeries<Datum> objects). The slice just creates a copy of
    // the array, but the references to the BaseSeries objects are the same and still point to the same
    // data as the "initialData" array.
    //
    // the "seriesRef" object is a reference to a map (series_name -> BaseSeries<Datum>), used to find
    // the series under the mouse (for the tooltip).
    //
    // the series in the "dataRef" object are the ones read by the next redraw, so as these are
    // updated, the next canvas repaint picks up the new data.
    const dataRef = useRef<Array<TimeSeries>>(initialData.slice())
    const seriesRef = useRef<Map<string, TimeSeries>>(
        new Map(initialData.map(
            series => [series.name, series]
            )
        )
    )
    // map(axis_id -> current_time) -- maps the axis ID to the current time for that axis
    const currentTimeRef = useRef<Map<string, number>>(new Map())

    // the last-drawn geometry for each series' spikes, in canvas coordinates, used for
    // hit-testing mouse hover on `mousemove` (see the effect below that wires up the listener)
    const geometryRef = useRef<Map<string, SeriesGeometry>>(new Map())
    // the name of the series the mouse was over on the previous `mousemove`, so we know when to
    // fire a "leave" for the old series before firing an "over" for the new one
    const lastHoveredRef = useRef<string | undefined>(undefined)

    // tooltips are only shown while the data source is paused (and not while panning)
    const allowTooltipRef = useRef<boolean>(!(dataSource?.running ?? false))

    /**
     * Calculates the upper and lower y-coordinate for the spike line
     * @param categorySize The size of the category (i.e. plot_height / num_series)
     * @param lineWidth The width of the series line
     * @param margin The margin applied to the top and bottom of the spike line (vertical spacing)
     * @return An object with two functions, that when handed a y-coordinate, return the location
     * for the start (yUpper) or end (yLower) of the spikes line.
     */
    function yCoordsFn(categorySize: number, lineWidth: number, margin: number):
        { yUpper: (y: number) => number, yLower: (y: number) => number } {
        if (categorySize <= margin) return {
            yUpper: y => y,
            yLower: y => y + lineWidth
        }
        return {
            yUpper: y => y + margin,
            yLower: y => y + categorySize - margin
        }
    }

    /**
     * (Re-)registers this plot's draw function with the canvas context and requests a redraw.
     * Replaces the old version, which directly mutated SVG `<line>` elements bound via d3's
     * enter/update/exit join. Canvas has no persistent elements to join against, so the draw
     * function just redraws every spike from current data/scale state each time it's invoked.
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

                // enter, update, delete the raster data
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
                        color: seriesColor,
                        lineWidth,
                        highlightColor,
                        highlightWidth,
                        margin: spikeLineMargin = spikeMargin
                    } = seriesStyles.get(series.name) || {
                        ...defaultLineStyle(),
                        highlightColor: defaultLineStyle().color
                    }

                    const isHovered = hoveredSeriesName === series.name
                    const strokeColor = isHovered ? highlightColor : seriesColor
                    const strokeWidth = isHovered ? (highlightWidth || lineWidth) : lineWidth

                    // only show the data for which the regex filter matches
                    const plotData: FastShiftArray<Datum> = (series.name.match(seriesFilter)) ? series.data : FastShiftArray.empty<Datum>()

                    // grab the functions that are used to determine the lower and upper coordinates of
                    // the raster line (y1, y2) and then calculate the values (y1, y2) using those functions
                    const {yUpper, yLower} = yCoordsFn(yAxis.scale.bandwidth(), lineWidth, spikeLineMargin)
                    const y = yAxis.scale(series.name) || 0
                    const y1 = yUpper(y)
                    const y2 = yLower(y)

                    context2D.strokeStyle = strokeColor
                    context2D.lineWidth = strokeWidth

                    const segments: Array<[[number, number], [number, number]]> = []
                    for (let i = 0; i < plotData.length; i++) {
                        const x = xAxis.scale(plotData[i].x)
                        context2D.beginPath()
                        context2D.moveTo(x, y1)
                        context2D.lineTo(x, y2)
                        context2D.stroke()
                        segments.push([[x + margin.left, y1 + margin.top], [x + margin.left, y2 + margin.top]])
                    }

                    newGeometry.set(series.name, {
                        points: [],
                        segments,
                        hitRadius: Math.max(4, strokeWidth)
                    })
                })

                geometryRef.current = newGeometry

                context2D.restore()
            }

            cc.register(`raster-plot-${chartId}`, draw, 10)
            cc.requestRedraw()
        },
        [
            axisAssignments, chartId, margin,
            plotDimensions,
            seriesFilter, seriesStyles,
            xAxesState, yAxesState,
            spikeMargin,
            hoveredSeriesName,
        ]
    )

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

    // grab a reference to the function used to update the time ranges and update that reference
    // if the function changes (solve for stale closures)
    const onUpdateTimeRef = useRef(updateAxisRanges)
    useEffect(
        () => {
            onUpdateTimeRef.current = updateAxisRanges
        },
        [updateAxisRanges]
    )

    // reports the axes' intervals to the code using the chart. this is held in a reference for the
    // same reason as the functions above -- the zoom and pan handlers are created inside the memoized
    // `updatePlot` and would otherwise close over a stale callback.
    //
    // the notifications are coalesced into (at most) one per animation frame because zoom and pan
    // fire many events per gesture, and the callback generally updates the application state, which
    // in turn causes a render. note that coalescing loses nothing: the deferred notification reports
    // the most recent ranges (see `pendingRangesRef`) when the frame runs, rather than those of the
    // event that scheduled it.
    const notifyIntervalsRef = useRef<(ranges: Map<string, ContinuousAxisRange>) => void>(noop)
    const notifyFrameRef = useRef<number>(0)
    // the ranges to report when the scheduled notification runs -- always the *latest* ranges
    // handed to `notifyIntervalsRef`, not those of the call that scheduled it. The zoom/pan
    // handlers mutate one map in place, but the plot also *replaces* its ranges map (e.g. on reset,
    // or when a new view driver starts); reporting the scheduling call's map would then write
    // stale intervals into the application state (e.g. undoing a Reset a frame later).
    const pendingRangesRef = useRef<Map<string, ContinuousAxisRange>>(new Map())
    useEffect(
        () => {
            notifyIntervalsRef.current = onUpdateAxesInterval === undefined ?
                noop :
                ranges => {
                    pendingRangesRef.current = ranges
                    // a notification is already scheduled for the next frame, and it will report the latest
                    // ranges when it runs
                    if (notifyFrameRef.current !== 0) return
                    notifyFrameRef.current = requestAnimationFrame(() => {
                        notifyFrameRef.current = 0
                        onUpdateAxesInterval(currentIntervalsFrom(pendingRangesRef.current))
                    })
                }
        },
        [onUpdateAxesInterval]
    )
    // don't leave a scheduled notification pointing at an unmounted plot
    useEffect(
        () => () => {
            if (notifyFrameRef.current !== 0) {
                cancelAnimationFrame(notifyFrameRef.current)
                notifyFrameRef.current = 0
            }
        },
        []
    )

    useEffect(
        () => {
            // clear to empty, not to a 0 for each axis -- see ScatterPlot's identical reset for why:
            // 0 is a legitimate (non-nullish) map value, so `zoomPivotFor`'s `?? axis.scale.domain()[1]`
            // fallback wouldn't kick in, and the next zoom would pivot on 0 until the first tick lands.
            currentTimeRef.current = new Map()
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
        () => axesForSeriesGen<Datum, ContinuousNumericAxis>(initialData, axisAssignments, xAxesState),
        [initialData, axisAssignments, xAxesState]
    )

    // the axes' true original (un-zoomed) [start, end] bounds -- see OutlierPlot's identical
    // `initialAxisIntervalsRef` for the full explanation: the axis object has no "original"
    // concept of its own once a zoom has directly mutated `scale.domain()`, so for a
    // statically-domained axis (like this one), nothing else restores the scale on reset. This
    // must be a ref populated by `resetPlotForInitialData` below (on mount, and whenever the data
    // source is replaced), rather than a `useMemo` keyed on `axesRanges` -- `axesRanges` is a fresh closure on
    // every render of `AxesProvider` (never memoized there), so such a memo recomputes on
    // essentially every render, re-sampling `.original` while it's being continuously shifted
    // forward by ordinary auto-scroll.
    const initialAxisIntervalsRef = useRef<Map<string, [start: number, end: number]>>(new Map())

    // updates the timing using the onUpdateTime and updatePlot references. This and the references
    // defined above allow the axes' times to be update properly by avoid stale reference to these
    // functions.
    const updateTimingAndPlot = useCallback((ranges: Map<string, ContinuousAxisRange>): void => {
            if (canvasContext !== null) {
                onUpdateTimeRef.current(ranges)
                // keep the single canonical ranges ref in sync -- see OutlierPlot's identical
                // assignment for the full explanation. Without this, `timeRangesRef.current` (what
                // the zoom/pan handlers below mutate) and the subscription's own internal ranges
                // map (built once at subscribe time) are two permanently separate objects: the
                // subscription's per-tick auto-scroll advance would keep overwriting the axis's
                // actual scale with its own (unzoomed) tracking on literally the next tick after
                // any zoom event, stomping the zoom's result almost immediately -- visible as the
                // zoom "mostly working" only while rapid zoom events outpaced the subscription's
                // tick rate (the stutter), then snapping back the moment the gesture ended and the
                // subscription's next tick won uncontested.
                timeRangesRef.current = ranges
                updatePlotRef.current(canvasContext)
                // the notification is deferred to the next animation frame (see `notifyIntervalsRef`),
                // so that this doesn't update the application state synchronously from within the
                // subscription's update
                notifyIntervalsRef.current(ranges)
            }
        },
        [canvasContext]
    )

    // when the initial data changes, then reset the plot. note that the initial data doesn't change
    // during the normal course of updates from the data source, only when the data source is replaced. the
    // reset itself should always use the current xAxesState/axisAssignments/updateTimingAndPlot, not
    // whatever they were when this effect last ran -- that's exactly what an effect event gives us,
    // without having to (falsely) declare them as dependencies that would re-trigger the reset.
    const resetPlotForInitialData = useEffectEvent(() => {
        dataRef.current = initialData.slice()
        seriesRef.current = new Map(initialData.map(series => [series.name, series]))
        // see the identical `currentTimeRef` reset above for why this is an empty map, not a 0 per axis
        currentTimeRef.current = new Map()

        const freshRanges = continuousAxisRanges(xAxesState.axes as Map<string, ContinuousNumericAxis>)

        // capture the axes' true original bounds at this reset point, for `onZoomReset` (see the
        // pan/zoom effect below) to restore to later -- see `initialAxisIntervalsRef`'s
        // declaration above for why this must be captured here rather than via a `useMemo`
        initialAxisIntervalsRef.current = new Map(
            Array.from(freshRanges.entries()).map(([id, range]) => [id, range.original.asTuple()])
        )

        updateTimingAndPlot(new Map(Array.from(freshRanges.entries())
                .map(([id, range]) => {
                    // grab the current range, then calculate the minimum time from the initial data, and
                    // set that as the start, and then add the range to it for the end time
                    const [start, end] = range.original.asTuple()
                    const minTime = initialData
                        .filter(srs => axisAssignments.get(srs.name)?.xAxis === id)
                        .reduce(
                            (tMin: number, series: TimeSeries) => Math.min(
                                tMin,
                                !series.isEmpty() ? series.data[0].x : tMin
                            ),
                            Infinity
                        )
                    const startTime = minTime === Infinity ? 0 : minTime
                    return [id, ContinuousAxisRange.from(startTime, startTime + end - start)]
                })
            )
        )
    })

    useEffect(
        () => {
            resetPlotForInitialData()
        },
        [initialData]
    )

    // highlights the x- and y-axes associated with the hovered series (in the series' own
    // highlight color/width, matching the line highlight above), and un-highlights them again --
    // via the effect's cleanup -- when the hover moves to a different series or ends
    useEffect(
        () => {
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
        },
        [highlightAxesOnMouseOver, hoveredSeriesName, axisAssignments, xAxesState, yAxesState, seriesStyles]
    )

    /**
     * Adjusts the time-range and updates the plot when the plot is dragged to the left or right
     * @param x The amount that the plot is dragged
     * @param plotDimensions The dimensions of the plot
     * @param ranges A map holding the axis ID and its associated time range
     */
    const onPan = useCallback(
        (x: number,
         plotDimensions: Dimensions,
         ranges: Map<string, ContinuousAxisRange>
        ) => panHandler(axesForSeries, margin, setAxisIntervalFor, xAxesState)(x, plotDimensions, ranges),
        [axesForSeries, margin, setAxisIntervalFor, xAxesState]
    )

    /**
     * Called when the user uses the scroll wheel (or scroll gesture) to zoom in or out.
     * @param zoomFactor The *incremental* zoom scale factor for this event (see ScatterPlot's
     * `lastZoomKRef` for how d3-zoom's cumulative `k` is converted to it)
     * @param pivotDomainValueFor Given an axis ID and its axis, returns the domain value to pivot
     * that axis's zoom around (see `zoomPivotFor`, below)
     * @param plotDimensions The dimensions of the plot
     * @param ranges A map holding the axis ID and its associated time-range
     */
    const onZoom = useCallback(
        (
            zoomFactor: number,
            pivotDomainValueFor: (axisId: string, axis: ContinuousNumericAxis) => number,
            plotDimensions: Dimensions,
            ranges: Map<string, ContinuousAxisRange>,
        ) => continuousAxisZoomHandler(axesForSeries, margin, setAxisIntervalFor, xAxesState)(zoomFactor, pivotDomainValueFor, plotDimensions, ranges),
        [axesForSeries, margin, setAxisIntervalFor, xAxesState]
    )

    // The zoom pivot -- the domain value that stays fixed on screen while the window widens or
    // narrows around it -- depends on whether the chart is actively streaming: while running,
    // pivot on the axis's own "now" (`currentTimeRef`, updated by the view driver on every data
    // update and cadence tick, regardless of zoom activity) instead of the mouse position, so "now" stays fixed on screen
    // throughout the whole gesture -- see ScatterPlot's identical `zoomPivotFor` for the full
    // explanation of why this replaced a previous design that pivoted on the mouse and then tried
    // to correct the result back towards "now" after the fact. While paused, pivot on the mouse
    // position as usual, since there's no "now" moving target to chase.
    const zoomPivotFor = useCallback(
        (offsetX: number): (axisId: string, axis: ContinuousNumericAxis) => number =>
            running ?
                (axisId, axis) => currentTimeRef.current.get(axisId) ?? axis.scale.domain()[1] :
                (_axisId, axis) => axis.scale.invert(offsetX - margin.left),
        [running, margin]
    )

    // the last d3-zoom `event.transform.k` this plot applied -- see ScatterPlot's identical
    // `lastZoomKRef` for the full explanation: d3-zoom's `k` is cumulative, but the zoom math is
    // incremental, so each event's `k` must be divided by this ref (then this ref updated to that
    // `k`) before being passed to `onZoom`. Reset to 1 wherever d3-zoom's own transform is reset to
    // identity (see `onZoomReset` below).
    const lastZoomKRef = useRef<number>(1)

    // sets up panning and zooming exactly once (and again only when something pan/zoom-relevant
    // actually changes -- e.g. a resize), rather than on every data tick. This used to live inside
    // `updatePlot`, which runs every `windowingTime` interval; recreating a `d3.drag()`/`d3.zoom()`
    // behavior and reattaching it to the canvas that often was pure overhead unrelated to drawing
    // the new data, and the constant allocation churn is a plausible contributor to the plot
    // getting choppier the longer a stream runs.
    useEffect(
        () => {
            if (!canvasContext) return
            const cc = canvasContext
            const canvasSelection = d3.select<HTMLCanvasElement, unknown>(cc.canvas)

            if (panEnabled) {
                const drag = d3.drag<HTMLCanvasElement, unknown>()
                    .on("start", () => {
                        canvasSelection.style("cursor", "move")
                        allowTooltipRef.current = false
                    })
                    .on("drag", (event: D3DragEvent<HTMLCanvasElement, unknown, ContinuousNumericAxis>) => {
                        onPan(event.dx, plotDimensions, timeRangesRef.current)
                        // need to update the plot with the new time-ranges
                        updatePlotRef.current(cc)
                        // the pan updated the axes' ranges in place, so report the new intervals
                        notifyIntervalsRef.current(timeRangesRef.current)
                    })
                    .on("end", () => {
                        canvasSelection.style("cursor", "auto")
                        allowTooltipRef.current = !(dataSource?.running ?? false)
                    })

                canvasSelection.call(drag)
            }

            if (zoomEnabled) {
                const zoom = d3.zoom<HTMLCanvasElement, unknown>()
                    // restricted to wheel events -- d3-zoom's default filter also accepts
                    // mousedown (for its own built-in drag-to-pan/zoom gesture), but this app
                    // already attaches a separate, dedicated `d3.drag()` (above) for panning on
                    // the same canvas. Without this, holding shift/ctrl while dragging (as users
                    // naturally do, since that's this app's own zoom-key convention) fed the same
                    // mousedown/mousemove/mouseup sequence to BOTH behaviors at once.
                    .filter((event: KeyboardEvent) => event.type === 'wheel' && (!zoomKeyModifiersRequired || event.shiftKey || event.ctrlKey))
                    .scaleExtent([0, 10])
                    .translateExtent([[margin.left, margin.top], [plotDimensions.width, plotDimensions.height]])
                    .on("zoom", (event: D3ZoomEvent<HTMLCanvasElement, unknown>) => {
                            // a `null` sourceEvent means this "zoom" wasn't a real user gesture
                            // but a programmatic `.transform(...)` call (see `resetZoom` below)
                            if (event.sourceEvent === null) return

                            // convert d3-zoom's cumulative `k` to the incremental factor this
                            // event represents -- see `lastZoomKRef`'s declaration above
                            const zoomFactor = event.transform.k / lastZoomKRef.current
                            lastZoomKRef.current = event.transform.k

                            onZoom(
                                zoomFactor,
                                zoomPivotFor(event.sourceEvent.offsetX),
                                plotDimensions,
                                timeRangesRef.current,
                            )
                            updatePlotRef.current(cc)
                            // the zoom updated the axes' ranges in place, so report the new intervals
                            notifyIntervalsRef.current(timeRangesRef.current)
                        }
                    )

                canvasSelection.call(zoom)

                // hands the caller a way to clear d3-zoom's own accumulated scale/pan state back
                // to identity -- see ScatterPlot's identical `onZoomReset` usage for the base
                // rationale. Also explicitly restores each axis's scale to its true original
                // bounds (see `initialAxisIntervalsRef` above), since a statically-domained axis
                // (like this one) has nothing else to put it back to its starting view on reset.
                onZoomReset(() => {
                    canvasSelection.call(zoom.transform, d3.zoomIdentity)
                    // d3-zoom's own `k` is back at identity (1) -- see ScatterPlot's identical
                    // reset for why `lastZoomKRef` must follow it back to 1
                    lastZoomKRef.current = 1
                    initialAxisIntervalsRef.current.forEach(([start, end], axisId) => {
                        timeRangesRef.current.set(axisId, ContinuousAxisRange.from(start, end))
                        xAxesState.axisFor(axisId).ifPresent(
                            axis => axis.update(AxisInterval.from(start, end), plotDimensions, margin)
                        )
                    })
                    // full sync (via `updateTimingAndPlot`) so AxesProvider's own separate ranges
                    // ref also picks up the freshly-reset `.original` immediately -- see
                    // ScatterPlot's identical call for the full explanation. Harmless here today
                    // (this axis's `domain` prop is a static literal, so `ContinuousAxis` never
                    // reads that ref's `.original` back out), but kept for defense-in-depth/
                    // consistency in case that ever changes to a store-backed domain.
                    updateTimingAndPlot(timeRangesRef.current)
                })
            }

            return () => {
                if (panEnabled) canvasSelection.on(".drag", null)
                if (zoomEnabled) canvasSelection.on(".zoom", null)
            }
        },
        [canvasContext, panEnabled, zoomEnabled, onPan, onZoom, plotDimensions, margin, zoomKeyModifiersRequired, zoomPivotFor, onZoomReset, xAxesState, updateTimingAndPlot, dataSource]
    )

    const timeRangesRef = useRef<Map<string, ContinuousAxisRange>>(new Map())
    useEffect(
        () => {
            if (canvasContext) {
                // so this gets a bit complicated. the time-ranges need to be updated whenever the time-ranges
                // change. for example, as data is streamed in, the times change, and then we need to update the
                // time-range. however, we want to keep the time-ranges to reflect their original scale so that
                // we can zoom properly (so the updates can't fuck with the scale). At the same time, when the
                // interpolation changes, then the update plot changes, and the time-ranges must maintain their
                // original scale as well.
                if (timeRangesRef.current.size === 0) {
                    // when no time-ranges have yet been created, then create them and populate the
                    // existing ref's map in place (rather than replacing it -- reassigning `.current`
                    // after it's already been read above isn't allowed by react-hooks/immutability)
                    continuousAxisRanges(xAxesState.axes as Map<string, ContinuousNumericAxis>)
                        .forEach((range, id) => timeRangesRef.current.set(id, range))
                } else {
                    // when the time-ranges already exist, then we want to update the time-ranges for each
                    // existing time-range in a way that maintains the original scale.
                    const intervals = continuousAxisIntervals(xAxesState.axes)
                    timeRangesRef.current
                        .forEach((range, id, rangesMap) => {
                            const [start, end] = Optional.ofNullable(intervals.get(id))
                                .map(interval => interval.asTuple())
                                .getOrThrow(() => new Error(`Unable to retrieve interval for axis; axis_id: ${id}`))
                            if (!isNaN(start) && !isNaN(end)) {
                                // update the reference map with the new (start, end) portion of the range,
                                // while keeping the original scale intact
                                rangesMap.set(id, range.update(start, end))
                            }
                        })
                }
                updatePlot(canvasContext)
            }
        },
        [chartId, color, canvasContext, plotDimensions, updatePlot, xAxesState]
    )

    // wires up a single mousemove/mouseleave listener on the shared canvas to replace the old
    // per-element SVG mouseover/mouseleave handlers. Hit-tests the mouse position against the
    // last-drawn spike geometry (see `geometryRef`, populated by the draw function above).
    useEffect(
        () => {
            if (!canvasContext) return

            const canvas = canvasContext.canvas

            const handleMove = (event: MouseEvent) => {
                if (!allowTooltipRef.current) return

                const [x, y] = canvasLocalPoint(event, canvas)
                const hit = seriesAt(x, y, geometryRef.current)

                if (hit?.name === lastHoveredRef.current && hit !== undefined) {
                    // still hovering the same series -- no enter/leave to fire, but the specific
                    // spike may have changed, so fall through and re-report below
                } else if (lastHoveredRef.current !== undefined) {
                    handleMouseLeaveSeries(lastHoveredRef.current, mouseLeaveHandlerFor(`tooltip-${chartId}`))
                }

                if (hit !== undefined) {
                    const series = seriesRef.current.get(hit.name)
                    const selectedDatum = series?.data[hit.index]
                    const xAxis = axesFor(
                        hit.name,
                        axisAssignments,
                        axisId => xAxesState.axisFor(axisId).getOrUndefined(),
                        axisId => yAxesState.axisFor(axisId).getOrUndefined()
                    )[0]
                    if (series !== undefined && selectedDatum !== undefined && xAxis !== undefined) {
                        handleMouseOverSeries(
                            xAxis,
                            hit.name,
                            selectedDatum,
                            series.data,
                            [x, y],
                            margin,
                            mouseOverHandlerFor(`tooltip-${chartId}`)
                        )
                    }
                }

                lastHoveredRef.current = hit?.name
            }

            const handleLeaveCanvas = () => {
                if (lastHoveredRef.current !== undefined) {
                    handleMouseLeaveSeries(lastHoveredRef.current, mouseLeaveHandlerFor(`tooltip-${chartId}`))
                    lastHoveredRef.current = undefined
                }
            }

            canvas.addEventListener('mousemove', handleMove)
            canvas.addEventListener('mouseleave', handleLeaveCanvas)
            return () => {
                canvas.removeEventListener('mousemove', handleMove)
                canvas.removeEventListener('mouseleave', handleLeaveCanvas)
            }
        },
        [canvasContext, chartId, margin, axisAssignments, xAxesState, yAxesState, mouseOverHandlerFor, mouseLeaveHandlerFor]
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
    // current settings -- see ScatterPlot's identical effect event
    const createViewDriver = useEffectEvent(
        (source: NonNullable<typeof dataSource>) => {
            const redraw = (ranges: Map<string, ContinuousAxisRange>) => updateTimingAndPlotRef.current(ranges)
            const setCurrentTime = (axisId: string, end: number) => currentTimeRef.current.set(axisId, end)
            return withCadenceOf !== undefined ?
                timeSeriesWithCadenceViewDriverFor(
                    source, windowingTime, axisAssignments, xAxesState, redraw, setCurrentTime, withCadenceOf
                ) :
                timeSeriesViewDriverFor(
                    source, windowingTime, axisAssignments, xAxesState, redraw, setCurrentTime,
                    undefined, undefined, dataUpdatePeriod
                )
        }
    )

    // while the data source is running (and this plot has a canvas and its x-axes), drive the
    // view from the data source's updates -- see ScatterPlot's identical effect. The driver
    // belongs to this plot instance alone and is always torn down with it.
    const hasXAxes = xAxesState.axes.size > 0
    useEffect(
        () => {
            if (dataSource === undefined || !running || canvasContext === null || !hasXAxes) return
            allowTooltipRef.current = false
            const driver = createViewDriver(dataSource)
            return () => {
                driver.unsubscribe()
                allowTooltipRef.current = true
            }
        },
        [dataSource, running, canvasContext, hasXAxes]
    )

    // this plot needs a data source (see the `Chart`'s `dataSource` prop)
    useEffect(
        () => {
            if (dataSource === undefined) {
                console.error("RasterPlot requires a data source; set the enclosing Chart's `dataSource` prop")
            }
        },
        [dataSource]
    )

    // unregister this plot's draw function on unmount
    useEffect(
        () => {
            return () => {
                if (canvasContext) {
                    canvasContext.unregister(`raster-plot-${chartId}`)
                }
            }
        },
        [canvasContext, chartId]
    )

    return null
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
 * @return A 2d tuple holding the linear x-axis as its first element and the category y-axis as
 * the second element (either is actually `undefined` when it isn't found, despite the type).
 * @throws Error when the x-axis isn't a continuous numeric axis, or the y-axis isn't a category axis
 */
function axesFor(
    seriesName: string,
    axisAssignments: Map<string, AxesAssignment>,
    xAxisFor: (id: string) => BaseAxis | undefined,
    yAxisFor: (id: string) => BaseAxis | undefined,
): [xAxis: ContinuousNumericAxis, yAxis: OrdinalStringAxis] {
    const axes = axisAssignments.get(seriesName)
    const xAxis = xAxisFor(axes?.xAxis || "")
    if (xAxis && xAxis.axisType !== AxisType.ContinuousNumeric) {
        throw Error("Raster plot requires that x-axis be of type LinearAxis")
    }
    const xAxisLinear = xAxis as ContinuousNumericAxis
    const yAxis = yAxisFor(axes?.yAxis || "")
    if (yAxis && yAxis.axisType !== AxisType.OrdinalString) {
        throw Error("Raster plot requires that y-axis be of type CategoryAxis")
    }
    const yAxisCategory = yAxis as OrdinalStringAxis
    return [xAxisLinear, yAxisCategory]
}

/**
 * Reports a tooltip showing the neuron, spike time, and the spike's value when the mouse hovers over a spike.
 * Replaces the old version, which mutated the hovered SVG `<line>`'s stroke directly; highlighting is now
 * handled by the draw function reading `hoveredSeriesName` from chart state rather than by touching an
 * element here.
 * @param xAxis The x-axis
 * @param seriesName The name of the series (i.e. the neuron ID)
 * @param selectedDatum The selected datum
 * @param spikes All the series' spikes that the chart holds (for the tooltip's statistics)
 * @param mouseCoords The `[x, y]` position of the mouse, in canvas coordinates
 * @param margin The plot margin
 * @param mouseOverHandlerFor The handler for the mouse over (registered by the <Tooltip/>)
 */
function handleMouseOverSeries(
    xAxis: ContinuousNumericAxis,
    seriesName: string,
    selectedDatum: Datum,
    spikes: Series<Datum>,
    mouseCoords: [x: number, y: number],
    margin: Margin,
    mouseOverHandlerFor: ((seriesName: string, time: number, tooltipData: TooltipData<Datum, RasterTooltipMetadata>, mouseCoords: [x: number, y: number]) => void) | undefined,
): void {
    // grab the time needed for the tooltip ID
    const [x] = mouseCoords
    const time = Math.round(xAxis.scale.invert(x - margin.left))

    if (mouseOverHandlerFor) {
        // the contract for the mouse over handler is for a time-series, but here we only
        // need one point, the selected datum, and so we convert it into an array of point
        // (i.e. a time-series). The category tooltip is (and custom ones, must) be
        // written to expect only the selected point. All the series' spikes (that the chart
        // holds) come along in the metadata, for the tooltip's statistics
        mouseOverHandlerFor(seriesName, time, {series: [selectedDatum], metadata: {spikes}}, mouseCoords)
    }
}

/**
 * Calls the mouse-leave-series handler registered for this series. Replaces the old version, which
 * also reset the hovered SVG element's stroke color/width directly; that reset is now implicit --
 * once `hoveredSeriesName` is cleared, the next redraw simply paints the spikes in their normal
 * (non-highlighted) style.
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
