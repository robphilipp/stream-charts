import {useCallback, useEffect, useEffectEvent, useMemo, useRef} from 'react'
import {useHoveredSeries} from "../hooks/useHoveredSeries";
import {useChart} from "../hooks/useChart";
import {
    type ScatterTooltipMetadata,
    type ScatterTooltipPoints,
    scatterTooltipPointList,
    scatterTooltipPoints
} from "../tooltips/tooltipUtils";
import * as d3 from "d3";
import {type D3ZoomEvent} from "d3";
import {type AxesAssignment, clipToArea, currentIntervalsFrom} from "./plot";
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
    panHandler,
    type SeriesLineStyle
} from "../axes/axes";
import type {CanvasContext} from "../d3types";
import {seriesAt, canvasLocalPoint, type SeriesGeometry} from "./hitTesting";
import {firstIndexAtOrAfter, noop} from "../utils";
import {NoCurveFactory} from "./constants";
import type {Dimensions} from "../styling/margins";
import {timeAxisViewDriverFor, timeSeriesAxisTimes, TimeWindowBehavior} from "../subscriptions/viewDrivers";
import {useDataSource, useDataSourceRunning, useInitialData, useStreamingSettings} from "../hooks/useDataSource";
import type {TimeSeriesChartData} from "../series/timeSeriesChartData";
import {Optional} from "result-fn";
import {ContinuousAxisRange} from "../axes/ContinuousAxisRange";
import {extentWith, visibleExtent} from "../axes/autoScale";
import {growAutoScaledYAxes, useAutoScaleRestart} from "./autoScaleYAxes";
import {AxisInterval} from "../axes/AxisInterval";
import {usePlotDimensions} from "../hooks/usePlotDimensions";
import type {FastShiftArray} from "fast-shift-array";

// how close (in pixels) the mouse must be to a data point to be over that point (rather than over a
// line segment) -- at least this, or a little more than the markers' radius when they're larger
const MIN_POINT_HOVER_RADIUS = 6
// the radii of the highlights on the points the tooltip shows: the hovered point, and the others
const TOOLTIP_POINT_RADIUS = 5
const TOOLTIP_NEIGHBOR_RADIUS = 3.5

/**
 * The properties of the {@link ScatterPlot}
 */
export interface Props {
    /**
     * Holds the mapping between a series and the axis it uses (is assigned). The
     * map's key holds the series name, and the value is an {@link AxesAssignment}
     * object holding the ID of the assigned x-axis and y-axis.
     */
    axisAssignments?: Map<string, AxesAssignment>
    /**
     * The line interpolation curve factory. See the d3 documentation for curves at
     * {@link https://github.com/d3/d3-shape#curves} for information on available interpolations
     */
    interpolation?: d3.CurveFactory
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
     * When set, uses a cadence with the specified refresh period (in milliseconds). For plots
     * where the updates are slow (> 100 ms) using a cadence of 10 to 25 ms smooths out the
     * updates and makes the plot updates look cleaner. When updates are around 25 ms or less,
     * then setting the cadence period too small will result in poor update performance. Generally
     * at high update speeds, the cadence is unnecessary. Finally, using cadence, sets the max time
     * to the current time.
     */
    withCadenceOf?: number
    /**
     * The time window behavior for the plot. There are two options: `SCROLL` and `SQUEEZE`.
     * <ol>
     *     <li>
     *         <b>SCROLL</b> will scroll the plot window as new data is added whose time
     *         exceeds the time window.
     *     </li>
     *     <li>
     *         <b>SQUEEZE</b> will compress the time-axes when new data is added whose time
     *         exceeds the time window.
     *     </li>
     * </ol>
     * The default behavior is to `SCROLL`.
     */
    timeWindowBehavior?: TimeWindowBehavior
    /**
     * Radius (px) of the circle marker drawn at each datum. When omitted or `undefined`,
     * no markers are rendered.
     */
    markerRadius?: number
    /**
     * Whether to hide the markers while the chart is running (streaming), showing them again
     * once paused. Defaults to `true` (the previous, hard-coded behavior). Set to `false` to
     * keep markers visible while running.
     */
    hideMarkersWhileRunning?: boolean
    /**
     * When true, hovering over a series also highlights the x- and y-axes it is plotted
     * against (in the series' own highlight color/width). Defaults to `false`.
     */
    highlightAxesOnMouseOver?: boolean

    /**
     * Called whenever this plot (re)creates its zoom behavior, handing
     * the caller a `resetZoom` function that programmatically clears d3-zoom's own accumulated
     * scale/pan state back to identity. This exists because d3-zoom keeps that state attached
     * directly to the canvas element -- entirely separate from (and unaffected by) resetting the
     * axes' own ranges, e.g. via a "Reset" button that restores the axes' domains to their
     * defaults. Without calling the handed-back `resetZoom`, the *next* user zoom gesture after
     * such a reset would compute its new scale against the stale, still-accumulated transform
     * (from before the reset) rather than starting fresh, producing a sudden, unexpected jump.
     * Only meaningful (called) while `zoomEnabled` is true.
     */
    onZoomReset?: (resetZoom: () => void) => void
}

/**
 * Renders a streaming scatter plot for the series held by the {@link StreamingDataSource} handed
 * to the {@link Chart} (its `dataSource` prop). This component uses the {@link useChart} hook, and
 * therefore must be a child of the {@link Chart} in order to be plugged in to the chart ecosystem
 * (axes, tracker, tooltip).
 *
 * The plot never subscribes to the data stream itself: the application owns the data source (and
 * starts/stops it), and the data source keeps ingesting even while this plot is unmounted. While
 * the data source is running, this plot listens to its updates through a view driver that only
 * advances the plot's own view (auto-scroll, cadence) and redraws -- created when the plot mounts
 * (or the data source starts) and always torn down when it unmounts (or the data source stops).
 *
 * Internally, this no longer creates/updates SVG `<path>`/`<circle>` elements. Instead, it
 * registers a single draw function with the chart's {@link CanvasContext} that redraws every
 * series from scratch each time the canvas repaints. Mouse hover (for the tooltip) is handled by
 * hit-testing the mouse position against the last-drawn series geometry (see `hitTesting.ts`) on a
 * `mousemove` listener attached directly to the canvas, since canvas has no per-shape events.
 *
 * When the data source is paused, hovering over a series shows the tooltip (when there's one),
 * and highlights the points it shows; a y-axis with `autoScale` set grows to fit the data on screen.
 *
 * @param props The properties associated with the scatter plot
 * @return `null` (the plot draws onto the chart's canvas)
 * @example
 *  <ScatterPlot
 *      interpolation={interpolation}
 *      axisAssignments={new Map([
 *          ['test2', assignAxes("x-axis-2", "y-axis-2")],
 *      ])}
 *      panEnabled={true}
 *      zoomEnabled={true}
 *      zoomKeyModifiersRequired={true}
 *  />
 */
export function ScatterPlot(props: Props): null {
    const {
        chartId,
        canvasContext,
        axes,
        color,
        seriesStyles,
        seriesFilter,
        mouse,
        backgroundColor,
    } = useChart<Datum, SeriesLineStyle, ScatterTooltipMetadata, ContinuousAxisRange, ContinuousNumericAxis>()
    const {hoveredSeriesName} = useHoveredSeries()

    const {
        initialData
    } = useInitialData<Datum>()

    const {
        xAxesState,
        yAxesState,
        setAxisIntervalFor,
        updateAxisRanges = noop,
        axisRangeFor,
        onUpdateAxesInterval,
    } = axes

    const {mouseOverHandlerFor, mouseLeaveHandlerFor} = mouse

    const {plotDimensions, margin} = usePlotDimensions()

    const {
        windowingTime = 100,
        dataUpdatePeriod,
    } = useStreamingSettings()

    // the application-owned source of the data, and whether it's running (streaming)
    const dataSource = useDataSource<TimeSeriesChartData, Datum, TimeSeries>()
    const running = useDataSourceRunning(dataSource)

    const {
        axisAssignments = new Map<string, AxesAssignment>(),
        interpolation = d3.curveLinear,
        panEnabled = false,
        zoomEnabled = false,
        zoomKeyModifiersRequired = true,
        withCadenceOf,
        timeWindowBehavior = TimeWindowBehavior.SCROLL,
        markerRadius,
        hideMarkersWhileRunning = true,
        highlightAxesOnMouseOver = false,
        onZoomReset = noop,
    } = props

    // the axes' true original (un-zoomed) [start, end] bounds, and each axis' pinned start time
    // for SQUEEZE mode -- see OutlierPlot's identical refs for the full explanation: these must be
    // refs populated by `resetPlotForInitialData` below (on mount, and whenever the data source is
    // replaced), rather
    // than a `useMemo` keyed on `axesRanges`. `axesRanges` is a fresh closure on every render of
    // `AxesProvider` (never memoized there), so such a memo recomputes on essentially every
    // render, re-sampling `.original` while it's being continuously shifted forward by ordinary
    // auto-scroll -- capturing "the current un-zoomed baseline, right now" instead of "the bounds
    // this run started at". This chart's `domain` prop is store-backed and already changes on
    // reset (which independently restores the scale via `ContinuousAxis`'s own prop-driven
    // effect), so this is redundant here today -- but kept for defense-in-depth/consistency with
    // the other plots in case that ever changes to a static domain.
    const initialTimesRef = useRef<Map<string, number>>(new Map())
    const initialAxisIntervalsRef = useRef<Map<string, [start: number, end: number]>>(new Map())

    // why do "dataRef" and "seriesRef" both hold on to the same underlying data? for performance.
    //
    // the "dataRef" and "seriesRef" both point to the same underlying data, a collection
    // of series (held, and updated as new data is streamed in, by the data source). The "dataRef"
    // array is what the draw function iterates over, and the "seriesRef" map is for looking a
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
    // the series in the "dataRef" object are the ones read by the canvas draw function, and so as
    // these are updated, the new data is picked up the next time the canvas redraws.
    const dataRef = useRef<Array<TimeSeries>>(initialData.slice() as Array<TimeSeries>)
    const seriesRef = useRef<Map<string, TimeSeries>>(new Map(initialData.map(series => [series.name, series as TimeSeries])))
    // map(axis_id -> current_time) -- maps the axis ID to the current time for that axis
    const currentTimeRef = useRef<Map<string, number>>(new Map())

    // the last-drawn geometry for each series, in canvas coordinates, used for hit-testing mouse
    // hover on `mousemove` (see the effect below that wires up the listener)
    const geometryRef = useRef<Map<string, SeriesGeometry>>(new Map())
    // the name of the series the mouse was over on the previous `mousemove`, so we know when to
    // fire a "leave" for the old series before firing an "over" for the new one
    const lastHoveredRef = useRef<string | undefined>(undefined)
    // the points the tooltip is showing (for the hovered series), which the plot highlights -- set
    // on mouse-over while a tooltip is shown, and cleared when the mouse leaves the series
    const tooltipPointsRef = useRef<{ seriesName: string, points: ScatterTooltipPoints } | undefined>(undefined)

    // tooltips are only shown while the data source is paused (and not while panning)
    const allowTooltip = useRef<boolean>(!(dataSource?.running ?? false))

    const updatePlot = useCallback(
        /**
         * (Re-)registers this plot's draw function with the canvas context and requests a redraw.
         * Replaces the old version, which directly mutated SVG `<path>`/`<circle>` elements bound
         * via d3's enter/update/exit join. Canvas has no persistent elements to join against, so
         * the draw function just redraws every series from its current data/scale state each time
         * it's invoked -- there's no separate "update" case to handle.
         *
         * Pan/zoom behavior setup lives in a separate effect (see below), not here -- this
         * function runs on every data tick (each `windowingTime` interval), and recreating/
         * reattaching a `d3.drag()`/`d3.zoom()` behavior that often is pure overhead with no
         * benefit, since panEnabled/zoomEnabled/plotDimensions/margin change far less often than
         * the data does.
         * @param cc The canvas context to register the draw function with
         */
        (cc: CanvasContext) => {
            const draw = (context: CanvasContext) => {
                // const __drawStart = performance.now()
                // let __totalRetained = 0
                // let __totalProcessed = 0
                const {context2D} = context

                // create a map associating series-names with their time-series.
                //
                // performance-related confusion: wondering where the dataRef is updated? well, it isn't
                // updated directly. The dataRef holds on to an array of references to the Series. And so does the
                // seriesRef, though it uses a map(series_name -> series). The seriesRef is use to append
                // data to the underlying Series, and the dataRef is used so that we can just use
                // dataRef.current and don't have to do Array.from(seriesRef.current.values()) which
                // creates a temporary array
                const boundedSeries = new Map<string, FastShiftArray<Datum>>(dataRef.current.map(series => [
                    series.name,
                    series.data
                ]))

                context2D.save()
                clipToArea(context, plotDimensions, {x: margin.left, y: margin.top})
                context2D.translate(margin.left, margin.top)

                const newGeometry = new Map<string, SeriesGeometry>()

                boundedSeries.forEach((data, name) => {
                    // grab the x and y axes assigned to the series, and if either or both
                    // axes aren't found, then give up and return
                    const [xAxisLinear, yAxisLinear] = axesFor(
                        name,
                        axisAssignments,
                        axisId => xAxesState.axisFor(axisId).getOrUndefined(),
                        axisId => yAxesState.axisFor(axisId).getOrUndefined()
                    )
                    if (xAxisLinear === undefined || yAxisLinear === undefined) return

                    // grab the style for the series
                    const {
                        color: seriesColor,
                        lineWidth,
                        highlightColor,
                        highlightWidth
                    } = seriesStyles.get(name) || defaultLineStyle()

                    // only show the data for which the filter matches
                    const plotData = (name.match(seriesFilter)) ? data : []
                    const isHovered = hoveredSeriesName === name

                    // build the on-screen points, dropping data in the x-axis that is out of the
                    // chart bounds (mirrors the old lineGenerator's `.defined(...)`)
                    type ScreenPoint = [x: number, y: number]
                    // skip the expensive per-point work below for retained-but-off-screen data:
                    // `plotData` can hold far more history than is ever visible (dropDataAfter is
                    // independent of, and often much larger than, the axis's current scrolling
                    // window), so iterating the *full* retained array every frame does a lot of
                    // work whose result is immediately thrown away as off-screen. Binary-search
                    // for where the visible domain begins, and only process from there on --
                    // backing up by one point so a line entering from off-screen still renders
                    // correctly across the boundary.
                    const [domainStart] = xAxisLinear.scale.domain()
                    const startIndex = Math.max(0, firstIndexAtOrAfter(plotData, domainStart, (d: Datum) => d.x) - 1)

                    const showMarkers = markerRadius != null && markerRadius >= 0 && (!running || !hideMarkersWhileRunning)
                    const markerRadiusResolved = isHovered ? markerRadius! + 2 : markerRadius!

                    const segments: Array<Array<ScreenPoint>> = []
                    let currentSegment: Array<ScreenPoint> = []
                    const screenPoints: Array<[number, number]> = []

                    context2D.fillStyle = isHovered ? highlightColor : seriesColor
                    for (let i = startIndex; i < plotData.length; i++) {
                        const d = plotData[i]
                        const x = xAxisLinear.scale(d.x)
                        const y = yAxisLinear.scale(d.y)

                        // record geometry (outer/canvas coordinate space, margin baked in) for
                        // mousemove hit-testing, regardless of on/off-screen -- a point just past
                        // the edge should still be hoverable at the boundary
                        screenPoints.push([x + margin.left, y + margin.top])

                        // the first point in this loop is the one deliberately backed up before
                        // the visible domain (see startIndex above); include it in the segment so
                        // the interpolated line entering from the left is smoothly clipped by the
                        // canvas's clip region as the plot scrolls, rather than the line abruptly
                        // popping into/out of existence right at the boundary
                        const isLeftEdgeContinuationPoint = i === startIndex && x < 0
                        if (!isLeftEdgeContinuationPoint && (x < 0 || x > plotDimensions.width)) {
                            if (currentSegment.length > 0) {
                                segments.push(currentSegment)
                                currentSegment = []
                            }
                            continue
                        }

                        currentSegment.push([x, y])

                        // point markers (one circle per datum) -- suppressed while streaming
                        // because redrawing many circles every frame is more work than a single
                        // line path
                        if (showMarkers) {
                            context2D.beginPath()
                            context2D.arc(x, y, markerRadiusResolved, 0, 2 * Math.PI)
                            context2D.fill()
                        }
                    }
                    if (currentSegment.length > 0) segments.push(currentSegment)

                    // draw the series line (interpolation is applied via a Path2D built through a
                    // d3 line generator so that custom curve factories -- e.g. curveBasis,
                    // curveStep -- keep working exactly as they did with the SVG path)
                    context2D.strokeStyle = isHovered ? highlightColor : seriesColor
                    context2D.lineWidth = isHovered ? highlightWidth : lineWidth
                    segments.forEach(segment => {
                        const path = new Path2D(
                            d3.line().curve(interpolation)(segment) ?? ""
                        )
                        context2D.stroke(path)
                    })

                    newGeometry.set(name, {
                        points: screenPoints,
                        asLine: true,
                        hitRadius: Math.max(6, (isHovered ? highlightWidth : lineWidth) + 4)
                    })
                    if (showMarkers) {
                        // markers get their own, generously-sized hit target keyed under a
                        // derived name so a marker hover can be distinguished from a line hover
                        // if the caller ever wants to (currently treated the same on mousemove)
                        newGeometry.set(`${name}-markers`, {
                            points: screenPoints,
                            hitRadius: markerRadiusResolved + 3
                        })
                    }
                })

                // highlights the points the tooltip is showing (on top of the series): the
                // hovered point is drawn larger than its neighbors (or than a segment's ends)
                const tooltipPoints = tooltipPointsRef.current
                if (tooltipPoints !== undefined && !running && tooltipPoints.seriesName.match(seriesFilter)) {
                    const [xAxisLinear, yAxisLinear] = axesFor(
                        tooltipPoints.seriesName,
                        axisAssignments,
                        axisId => xAxesState.axisFor(axisId).getOrUndefined(),
                        axisId => yAxesState.axisFor(axisId).getOrUndefined()
                    )
                    if (xAxisLinear !== undefined && yAxisLinear !== undefined) {
                        const {highlightColor = color} = seriesStyles.get(tooltipPoints.seriesName) ?? {}
                        const {points} = tooltipPoints
                        scatterTooltipPointList(points).forEach(datum => {
                            const isHoveredPoint = points.kind === 'point' && datum === points.point
                            context2D.beginPath()
                            context2D.arc(
                                xAxisLinear.scale(datum.x), yAxisLinear.scale(datum.y),
                                isHoveredPoint ? TOOLTIP_POINT_RADIUS : TOOLTIP_NEIGHBOR_RADIUS,
                                0, 2 * Math.PI
                            )
                            context2D.fillStyle = highlightColor
                            context2D.fill()
                            // outlined in the background color, so it stands out from the line
                            context2D.lineWidth = 1.5
                            context2D.strokeStyle = backgroundColor
                            context2D.stroke()
                        })
                    }
                }

                geometryRef.current = newGeometry
                context2D.restore()
            }

            /**
             * Grows the auto-scaling y-axes (see `ContinuousAxis`'s `autoScale` prop) to fit the
             * data that's on screen: the data of the shown series (those matching the filter)
             * within their x-axis' current window, including where their lines cross the window's
             * edges (see `visibleExtent`). Since an axis only ever grows, the data that has
             * scrolled off screen was already accounted for while it was on screen, so only the
             * visible data needs checking each frame. Registered to run before the axes draw
             * (they're at z-index 0), so the axes and the series are drawn with the grown domain
             * in the same frame.
             */
            const autoScaleYAxes = (): void => {
                const withLine = interpolation !== NoCurveFactory
                const extents = new Map<string, [min: number, max: number]>()
                dataRef.current.forEach(series => {
                    if (!series.name.match(seriesFilter)) return
                    const [xAxisLinear, yAxisLinear] = axesFor(
                        series.name,
                        axisAssignments,
                        axisId => xAxesState.axisFor(axisId).getOrUndefined(),
                        axisId => yAxesState.axisFor(axisId).getOrUndefined()
                    )
                    if (xAxisLinear === undefined || yAxisLinear?.autoScale === undefined) return

                    const [start, end] = xAxisLinear.scale.domain()
                    const seriesExtent = visibleExtent(series.data, [start, end], yAxisLinear.scale, withLine)
                    if (seriesExtent === undefined) return
                    const extent = extents.get(yAxisLinear.axisId)
                    extents.set(
                        yAxisLinear.axisId,
                        extent === undefined ? seriesExtent : extentWith(extentWith(extent, seriesExtent[0]), seriesExtent[1])
                    )
                })

                growAutoScaledYAxes(extents, {yAxes: yAxesState.axes, axisRangeFor, updateAxisRanges})
            }

            cc.register(`scatter-plot-autoscale-${chartId}`, autoScaleYAxes, -10)
            cc.register(`scatter-plot-${chartId}`, draw, 10)
            cc.requestRedraw()
        },
        [
            chartId, plotDimensions, margin,
            axisAssignments,
            xAxesState, yAxesState,
            seriesStyles, seriesFilter, interpolation,
            hoveredSeriesName, markerRadius, running, hideMarkersWhileRunning,
            axisRangeFor, updateAxisRanges,
            color, backgroundColor
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
            // clear to empty, not to a 0 for each axis -- `zoomPivotFor`'s `?? axis.scale.domain()[1]`
            // fallback only kicks in on a missing entry, and 0 is a legitimate (non-nullish) map value.
            // A store-backed domain (e.g. Scatter's, restored from `x1axisRange`/`x2axisRange` on
            // remount) can already be far from 0 the moment this effect runs, so an explicit 0 here
            // would make the very next zoom pivot on a wildly wrong point until the first tick lands.
            currentTimeRef.current = new Map()
        },
        [xAxesState]
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

    // calculates the distinct series IDs that cover all the series in the plot
    const axesForSeries = useMemo(
        (): Array<string> => axesForSeriesGen<Datum, ContinuousNumericAxis>(initialData, axisAssignments, xAxesState),
        [initialData, axisAssignments, xAxesState]
    )

    // updates the timing using the onUpdateTime and updatePlot references. This and the references
    // defined above allow the axes' times to be updated properly by avoid stale reference to these
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
    // during the normal course of updates from the data source, only when the data source is
    // replaced (e.g. on a reset, or a change to the number of series). the
    // reset itself should always use the current xAxesState/axisAssignments/updateTimingAndPlot, not
    // whatever they were when this effect last ran
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
        initialTimesRef.current = new Map(
            Array.from(freshRanges.entries()).map(([id, range]) => [id, range.original.start])
        )

        updateTimingAndPlot(new Map(Array.from(freshRanges.entries())
                .map(([id, range]) => {
                    // grab the current range, then calculate the minimum time from the initial data, and
                    // set that as the start, and then add the range to it for the end time
                    const [start, end] = range.original.asTuple()
                    const minTime = initialData
                        .filter(srs => axisAssignments.get(srs.name)?.xAxis === id)
                        .reduce(
                            (tMin, series) => Math.min(
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

    /**
     * Adjusts the time-range and updates the plot when the plot is dragged to the left or right
     * @param x The amount that the plot is dragged
     * @param plotDimensions The dimensions of the plot
     * @param ranges A map holding the axis ID and its associated time range
     */
    const onPan = useCallback(
        (x: number,
         plotDimensions: Dimensions,
         ranges: Map<string, ContinuousAxisRange>,
        ) => panHandler(axesForSeries, margin, setAxisIntervalFor, xAxesState)(x, plotDimensions, ranges),
        [axesForSeries, margin, setAxisIntervalFor, xAxesState]
    )

    /**
     * Called when the user uses the scroll wheel (or scroll gesture) to zoom in or out.
     * @param zoomFactor The *incremental* zoom scale factor for this event -- see the pan/zoom
     * effect below (`lastZoomKRef`) for how d3-zoom's own cumulative `event.transform.k` is
     * converted to this incremental form before this is called.
     * @param pivotDomainValueFor Given an axis ID and its axis, returns the domain value to pivot
     * that axis's zoom around -- see the pan/zoom effect below for how this differs depending on
     * whether the chart is actively streaming.
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
    // narrows around it -- depends on whether the chart is actively streaming:
    //
    // - While running, pivot on the axis's own "now" (`currentTimeRef`, updated by the view driver
    //   on every data update and cadence tick, regardless of zoom activity) instead of the mouse position. This is what
    //   keeps "now" fixed on screen throughout the whole gesture: zooming out reveals more history
    //   to the *left* of "now" (which itself never moves), and zooming in trims history away while
    //   "now" stays put -- exactly whether or not the window has started auto-scrolling yet (before
    //   that point "now" just isn't at the window's right edge, it's wherever real/cadence time
    //   currently sits within the still-static initial view). This replaces the previous design
    //   (pivot on the mouse position, then separately try to correct the result back towards "now"
    //   after the fact via `reanchorZoomToNow`) -- that correction step was fighting the gesture's
    //   own in-progress math every time it ran mid-gesture (visible as stutter), and produced a
    //   stale, snapped-back result when only run once at the gesture's end (using a "now" snapshot
    //   that ages throughout the gesture). Pivoting on "now" directly, continuously, on every
    //   "zoom" event needs no separate correction step at all -- the result is already correct on
    //   every single tick.
    // - While paused, pivot on the mouse position as usual: there's no "now" moving target to chase,
    //   so zooming in on whatever's under the cursor is the more useful (and expected) behavior for
    //   inspecting a frozen view.
    const zoomPivotFor = useCallback(
        (offsetX: number): (axisId: string, axis: ContinuousNumericAxis) => number =>
            running ?
                (axisId, axis) => currentTimeRef.current.get(axisId) ?? axis.scale.domain()[1] :
                (_axisId, axis) => axis.scale.invert(offsetX - margin.left),
        [running, margin]
    )

    // the last d3-zoom `event.transform.k` this plot applied -- d3-zoom's own `k` is cumulative
    // from wherever the canvas's `__zoom` was last at identity, but the zoom math below (see
    // `ContinuousAxisRange.constrainedScale`) is incremental, scaling `.current` directly rather
    // than deriving width from `.original`. Dividing each event's `k` by this ref converts it to
    // the incremental factor the math needs; this ref must then be updated to that event's `k`
    // so the next event's division is against the right baseline. Reset to 1 wherever d3-zoom's
    // own transform is reset to identity (see `onZoomReset` below) -- otherwise the first zoom
    // after a reset would divide by a stale, pre-reset `k`.
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
                        // during panning, we need to disable viewing the tooltip to prevent
                        // tooltips from rendering but not getting removed
                        allowTooltip.current = false;
                    })
                    .on("drag", (event) => {
                        onPan(
                            event.dx,
                            plotDimensions,
                            timeRangesRef.current,
                        )
                        updatePlotRef.current(cc)
                        // the pan updated the axes' ranges in place, so report the new intervals
                        notifyIntervalsRef.current(timeRangesRef.current)
                    })
                    .on("end", () => {
                        canvasSelection.style("cursor", "auto")
                        // during panning, we disabled viewing the tooltip to prevent
                        // tooltips from rendering but not getting removed, now that panning
                        // is over, allow tooltips to render again
                        allowTooltip.current = !(dataSource?.running ?? false)
                    })

                canvasSelection.call(drag)
            }

            if (zoomEnabled) {
                const zoom = d3.zoom<HTMLCanvasElement, unknown>()
                    // restricted to wheel events -- see RasterPlot's identical `.filter()` for
                    // the full explanation: without this, d3-zoom's own built-in mousedown-drag
                    // handling (which it still has, separate from this app's dedicated pan
                    // `d3.drag()`) would ALSO fire "zoom" events for a shift/ctrl-held drag,
                    // double-handling the same gesture.
                    .filter(event => event.type === 'wheel' && (!zoomKeyModifiersRequired || event.shiftKey || event.ctrlKey))
                    .scaleExtent([0, 10])
                    .translateExtent([[margin.left, margin.top], [plotDimensions.width, plotDimensions.height]])
                    .on("zoom", (event: D3ZoomEvent<HTMLCanvasElement, unknown>) => {
                            // a `null` sourceEvent means this "zoom" wasn't a real user gesture but
                            // a programmatic `.transform(...)` call -- e.g. `resetZoom` below,
                            // clearing d3-zoom's own accumulated scale/pan state back to identity.
                            // There's no real mouse position to anchor against in that case, and no
                            // business logic to run: the axes' own ranges are reset independently
                            // (by whatever caused the reset in the first place), so this only needs
                            // to let d3-zoom's internal bookkeeping actually update.
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

                // hands the caller a way to clear d3-zoom's own accumulated scale/pan state (kept
                // on the canvas element itself, entirely separate from the axes' own ranges) back
                // to identity -- e.g. so that a "Reset" action which restores the axes' domains to
                // their defaults doesn't leave the *next* zoom gesture computing its new scale
                // against the stale, still-accumulated transform from before the reset. Also
                // explicitly restores each axis's scale to its true original bounds -- redundant
                // with this chart's own store-backed domain-prop reset today, but kept consistent
                // with the other plots (see OutlierPlot's identical `initialAxisIntervalsRef`).
                onZoomReset(() => {
                    canvasSelection.call(zoom.transform, d3.zoomIdentity)
                    // d3-zoom's own `k` is back at identity (1), so the next zoom event's
                    // incremental-factor division (see `lastZoomKRef`'s declaration above) must be
                    // against 1 too -- otherwise it would divide by the stale, pre-reset `k`.
                    lastZoomKRef.current = 1
                    initialAxisIntervalsRef.current.forEach(([start, end], axisId) => {
                        timeRangesRef.current.set(axisId, ContinuousAxisRange.from(start, end))
                        xAxesState.axisFor(axisId).ifPresent(
                            axis => axis.update(AxisInterval.from(start, end), plotDimensions, margin)
                        )
                    })
                    // full sync (via `updateTimingAndPlot`, not just `updatePlotRef`/
                    // `notifyIntervalsRef` below) so AxesProvider's own separate ranges ref also
                    // picks up the freshly-reset `.original` immediately -- `axis.update()` above
                    // only ever *preserves* whatever `.original` that ref already had (via
                    // `setAxisIntervalFor`'s `range.update(...)`), so without this, a reset while
                    // paused (no more subscription ticks left to eventually resync it) leaves that
                    // ref's `.original` stuck at its pre-reset (zoomed) value. This chart's `domain`
                    // prop is store-backed, so `ContinuousAxis`'s own prop-driven effect reads
                    // exactly that stale `.original` back out once the store round-trips the reset
                    // -- preserving it (per the fix in `ContinuousAxis.tsx`) right back onto the
                    // axis, silently undoing this reset a moment later.
                    updateTimingAndPlot(timeRangesRef.current)
                })
            }

            // detach the drag/zoom behaviors' listeners when this effect re-runs (e.g. on
            // resize) or unmounts, rather than relying solely on the next .call(...) to replace
            // them under the hood
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
    // last-drawn geometry (see `geometryRef`, populated by the draw function above).
    useEffect(
        () => {
            if (!canvasContext) return

            const canvas = canvasContext.canvas

            const handleMove = (event: MouseEvent) => {
                if (!allowTooltip.current) return

                const [x, y] = canvasLocalPoint(event, canvas)
                const hit = seriesAt(x, y, geometryRef.current)
                // markers are recorded under a "<name>-markers" key; normalize back to the
                // underlying series name so callers only ever see the real series name.
                // NOTE: `hit?.name.endsWith(...)` here would be unsafe -- `?.` only protects the
                // `.name` access, not the chained `.endsWith(...)` call, so it would throw a
                // TypeError on every mousemove where `hit` is undefined (i.e. most of them).
                const hitName = hit !== undefined
                    ? (hit.name.endsWith('-markers') ? hit.name.slice(0, -'-markers'.length) : hit.name)
                    : undefined

                // only fire enter/leave transitions when the hovered series actually changes --
                // but always recompute and re-report the tooltip content below for the *current*
                // mouse position, even while still hovering the same series, so the tooltip keeps
                // tracking the mouse as it moves across a series instead of freezing at wherever
                // the hover was first detected.
                if (hitName !== lastHoveredRef.current) {
                    if (lastHoveredRef.current !== undefined) {
                        handleMouseLeaveSeries(
                            lastHoveredRef.current,
                            mouseLeaveHandlerFor(`tooltip-${chartId}`)
                        )
                    }
                    lastHoveredRef.current = hitName
                }

                // the points the tooltip shows (and the plot highlights): the point under the mouse
                // and its neighbors, or the two ends of the segment under the mouse
                let tooltipPoints: { seriesName: string, points: ScatterTooltipPoints } | undefined = undefined
                if (hitName !== undefined) {
                    const series = seriesRef.current.get(hitName)
                    const mouseOverHandler = mouseOverHandlerFor(`tooltip-${chartId}`)
                    const [xAxisLinear, yAxisLinear] = axesFor(
                        hitName,
                        axisAssignments,
                        axisId => xAxesState.axisFor(axisId).getOrUndefined(),
                        axisId => yAxesState.axisFor(axisId).getOrUndefined()
                    )
                    if (series !== undefined && xAxisLinear !== undefined && yAxisLinear !== undefined && mouseOverHandler !== undefined) {
                        const points = scatterTooltipPoints(
                            series.data,
                            [x - margin.left, y - margin.top],
                            xAxisLinear.scale,
                            yAxisLinear.scale,
                            Math.max(MIN_POINT_HOVER_RADIUS, (markerRadius ?? 0) + 3)
                        )
                        tooltipPoints = {seriesName: hitName, points}
                        const time = Math.round(xAxisLinear.scale.invert(x - margin.left))
                        mouseOverHandler(hitName, time, {series: series.data, metadata: {points}}, [x, y])
                    }
                }
                updateTooltipPoints(tooltipPoints)
            }

            // remembers the points the tooltip shows, and redraws (to highlight them) when they change
            const updateTooltipPoints = (tooltipPoints: { seriesName: string, points: ScatterTooltipPoints } | undefined): void => {
                const previous = tooltipPointsRef.current
                if (previous === undefined && tooltipPoints === undefined) return
                if (previous !== undefined && tooltipPoints !== undefined &&
                    previous.seriesName === tooltipPoints.seriesName &&
                    previous.points.kind === tooltipPoints.points.kind) {
                    const previousList = scatterTooltipPointList(previous.points)
                    const list = scatterTooltipPointList(tooltipPoints.points)
                    if (previousList.length === list.length && previousList.every((datum, index) => datum === list[index])) return
                }
                tooltipPointsRef.current = tooltipPoints
                canvasContext.requestRedraw()
            }

            const handleLeaveCanvas = () => {
                if (lastHoveredRef.current !== undefined) {
                    handleMouseLeaveSeries(lastHoveredRef.current, mouseLeaveHandlerFor(`tooltip-${chartId}`))
                    lastHoveredRef.current = undefined
                }
                updateTooltipPoints(undefined)
            }

            canvas.addEventListener('mousemove', handleMove)
            canvas.addEventListener('mouseleave', handleLeaveCanvas)
            return () => {
                canvas.removeEventListener('mousemove', handleMove)
                canvas.removeEventListener('mouseleave', handleLeaveCanvas)
            }
        },
        [canvasContext, chartId, margin, axisAssignments, xAxesState, yAxesState, mouseOverHandlerFor, mouseLeaveHandlerFor, markerRadius]
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
    // current settings (an effect event, so that the settings aren't dependencies of the effect
    // below -- the driver is created once per run, not re-created when a setting changes)
    const createViewDriver = useEffectEvent(
        (source: NonNullable<typeof dataSource>) => {
            const redraw = (ranges: Map<string, ContinuousAxisRange>) => updateTimingAndPlotRef.current(ranges)
            const setCurrentTime = (axisId: string, end: number) => currentTimeRef.current.set(axisId, end)
            return timeAxisViewDriverFor(
                source, xAxesState, timeSeriesAxisTimes(axisAssignments, xAxesState), redraw, setCurrentTime,
                {
                    windowingTime,
                    dataUpdatePeriod,
                    cadencePeriod: withCadenceOf,
                    timeWindowBehavior,
                    initialTimes: initialTimesRef.current,
                }
            )
        }
    )

    // while the data source is running (and this plot has a canvas and its x-axes), drive the
    // view from the data source's updates. The driver belongs to this plot instance alone: it's
    // torn down when the data source stops, and when this plot unmounts -- the data source itself
    // keeps ingesting regardless, so nothing needs to be kept alive (or adopted) across a remount.
    const hasXAxes = xAxesState.axes.size > 0
    useEffect(
        () => {
            if (dataSource === undefined || !running || canvasContext === null || !hasXAxes) return
            allowTooltip.current = false
            const driver = createViewDriver(dataSource)
            return () => {
                driver.unsubscribe()
                allowTooltip.current = true
            }
        },
        [dataSource, running, canvasContext, hasXAxes]
    )

    // this plot needs a data source (see the `Chart`'s `dataSource` prop)
    useEffect(
        () => {
            if (dataSource === undefined) {
                console.error("ScatterPlot requires a data source; set the enclosing Chart's `dataSource` prop")
            }
        },
        [dataSource]
    )

    // unregister this plot's draw function (and its auto-scaling step) on unmount
    useEffect(
        () => {
            return () => {
                if (canvasContext) {
                    canvasContext.unregister(`scatter-plot-autoscale-${chartId}`)
                    canvasContext.unregister(`scatter-plot-${chartId}`)
                }
            }
        },
        [canvasContext, chartId]
    )

    // new data, new scale: restarts the auto-scaling y-axes when the data source is replaced
    useAutoScaleRestart(dataSource, {yAxes: yAxesState.axes, axisRangeFor, updateAxisRanges})

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
 * @return The x- and y-axes (either is actually `undefined` when it isn't found, despite the type)
 * @throws Error when either axis isn't a continuous numeric axis
 */
function axesFor(
    seriesName: string,
    axisAssignments: Map<string, AxesAssignment>,
    xAxisFor: (id: string) => BaseAxis | undefined,
    yAxisFor: (id: string) => BaseAxis | undefined,
): [xAxis: ContinuousNumericAxis, yAxis: ContinuousNumericAxis] {
    const axes = axisAssignments.get(seriesName)
    const xAxis = xAxisFor(axes?.xAxis || "")
    const yAxis = yAxisFor(axes?.yAxis || "")
    if (xAxis && xAxis.axisType !== AxisType.ContinuousNumeric) {
        throw Error("Scatter plot requires that x-axis be of type LinearAxis")
    }
    if (yAxis && yAxis.axisType !== AxisType.ContinuousNumeric) {
        throw Error("Scatter plot requires that y-axis be of type LinearAxis")
    }
    const xAxisLinear = xAxis as ContinuousNumericAxis
    const yAxisLinear = yAxis as ContinuousNumericAxis
    return [xAxisLinear, yAxisLinear]
}

/**
 * Calls the mouse-leave-series handler registered for this series. Replaces the old version, which
 * also reset the hovered SVG element's stroke color/width directly; that reset is now implicit --
 * once `hoveredSeriesName` is cleared, the next redraw simply paints the series in its normal
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
