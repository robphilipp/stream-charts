import {useCallback, useEffect, useEffectEvent, useMemo, useRef} from 'react'
import {type NoTooltipMetadata, useChart} from "../hooks/useChart";
import * as d3 from "d3";
import {clipToArea} from "./plot";
import {type Datum} from "../series/timeSeries";
import {
    axesZoomHandler,
    type BaseAxis,
    AxisType,
    type ContinuousNumericAxis,
    defaultLineStyle,
    panHandler2D,
    type SeriesLineStyle
} from "../axes/axes";
import type {CanvasContext} from "../d3types";
import {seriesAt, canvasLocalPoint, type SeriesGeometry} from "./hitTesting";
import {formatTime, fontStringFor, noop, textDimensions} from "../utils";
import type {Dimensions} from "../styling/margins";
import {iteratesViewDriverFor} from "../subscriptions/viewDrivers";
import {useDataObservable} from "../hooks/useDataObservable";
import {useDataSource, useDataSourceRunning} from "../hooks/useDataSource";
import type {IterateChartData} from "../observables/iterates";
import type {IterateDatum, IterateSeries} from "../series/iterateSeries";
import {usePlotDimensions} from "../hooks/usePlotDimensions";
import {useInitialData} from "../hooks/useInitialData";
import {type TooltipData, useTooltip} from "../hooks/useTooltip";
import {ContinuousAxisRange} from "../axes/ContinuousAxisRange";
import {AxisInterval} from "../axes/AxisInterval";
import {warnAboutIgnoredAutoScale} from "../axes/autoScale";
import {FastShiftArray} from "fast-shift-array";
import {
    DEFAULT_LINE_COLOR_STEPS,
    DEFAULT_LINE_END_COLOR,
    DEFAULT_LINE_START_COLOR,
    pointColorScale,
    strokeColorizedLine
} from "./colorizedLine";

// an iterate as the plot draws it: f[n](x), f[n+1](x), the iterate's time, and its index in its series
type IteratePoint = { n: number, n_1: number, time: number, index: number }
type IteratePointSeries = FastShiftArray<IteratePoint>

/**
 * Creates an axis range (with its original range the same as its current range) from each axis'
 * current domain
 * @param axes The axes (continuous numeric ones), by their IDs
 * @return The axes' ranges, by their IDs
 */
function generateAxisRangeMap(axes: Map<string, BaseAxis>): Map<string, ContinuousAxisRange> {
    return new Map(
        Array.from(axes.entries()).map(([id, axis]) => {
            const [start, end] = (axis as ContinuousNumericAxis).scale.domain()
            return [id, ContinuousAxisRange.from(start, end)]
        })
    )
}

/**
 * A snapshot of the Poincaré plot's zoom/pan state, in a form that can be held outside the plot
 * (e.g. in an application store) and handed back to a later instance of the plot (see the
 * {@link Props.zoomState} and {@link Props.onZoomStateChange} props) -- so that zooming, navigating
 * away, and navigating back doesn't reset the zoom.
 */
export interface PoincarePlotZoomState {
    /**
     * d3-zoom's cumulative scale factor (`transform.k`) at the time of the snapshot. It must be
     * restored onto the new canvas along with the ranges: d3-zoom's `scaleExtent` (see
     * {@link Props.zoomMaxScaleFactor}) limits `k`, so a remounted canvas starting back at `k = 1`
     * would otherwise mis-measure how much further the user may zoom in or out.
     */
    k: number
    /**
     * Maps each axis ID (x and y) to its current (zoomed, panned) domain
     */
    ranges: Record<string, [start: number, end: number]>
}

/**
 * The properties of the {@link PoincarePlot}
 */
export interface Props {
    /**
     * The line interpolation curve factory. See the d3 documentation for curves at
     * {@link https://github.com/d3/d3-shape#curves} for information on available interpolations
     */
    interpolation?: d3.CurveFactory
    /**
     * When set to `true` (the default) plots the data points as well as the line.
     */
    showPoints?: boolean
    /**
     * When `true`, the lines connecting the points change color along their length, one step per
     * point: from `lineStartColor` at each series' first point to `lineEndColor` after
     * `lineColorSteps` points, then back to `lineStartColor` over the next `lineColorSteps` points,
     * and so on, sweeping the colors of the spectrum in between (the long way around the hue
     * circle -- e.g. from blue, through cyan, green, and yellow, to red). A point keeps its color
     * as old points are dropped (with an {@link IteratesDataSource}, which counts them), so that
     * the path's direction, and its age, can be seen. When `false` (the default), the lines are
     * drawn in the series' own color.
     */
    colorizeLines?: boolean
    /**
     * The number of points (steps) it takes the colorized lines' color to sweep from
     * `lineStartColor` to `lineEndColor` (and as many to sweep back) -- the larger, the slower the
     * color changes. Defaults to {@link DEFAULT_LINE_COLOR_STEPS} (1,000). Only used when
     * `colorizeLines` is `true`.
     */
    lineColorSteps?: number
    /**
     * The color the colorized lines' sweep starts at (each series' first point). Defaults to a blue
     * ({@link DEFAULT_LINE_START_COLOR}). Only used when `colorizeLines` is `true`.
     */
    lineStartColor?: string
    /**
     * The color the colorized lines' sweep ends at (after `lineColorSteps` points). Defaults to a red
     * ({@link DEFAULT_LINE_END_COLOR}). Only used when `colorizeLines` is `true`.
     */
    lineEndColor?: string
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
     * The smallest scale factor allowed for zooming (in). For example, a setting of 0.5 means
     * that the largest zoom amount is 2 times the current size, or put another way, an interval
     * of length 1 unit covers twice as may pixels after the zoom. Effectively, the smaller this
     * factor, the more the user can "zoom in". Default value is 0.0.
     */
    zoomMinScaleFactor?: number
    /**
     * The largest scale factor allowed for zooming (out). For example, a setting of 2.0 means
     * that at this value, the length of 1 unit covers 1/2 the number of pixels. Effectively,
     * the larger this factor, the more the user can "zoom out". Default value is 1.0.
     */
    zoomMaxScaleFactor?: number
    /**
     * An (optional) zoom/pan state to restore when this plot mounts -- commonly the last value
     * reported through {@link onZoomStateChange} and held by the application (e.g. in a store) so
     * that the zoom survives the plot being unmounted and remounted (e.g. navigating away and
     * back). Only read once, when the plot's axes are first available.
     */
    zoomState?: PoincarePlotZoomState
    /**
     * (Optional) callback that is handed the plot's zoom/pan state after each zoom event, at the
     * end of each pan, and when the axes' bounds are changed from outside (which resets the zoom)
     */
    onZoomStateChange?: (zoomState: PoincarePlotZoomState) => void
    /**
     * Called whenever this plot (re)creates its zoom behavior, handing the caller a `resetZoom`
     * function that clears d3-zoom's own accumulated scale back to identity and restores every axis
     * to its original (un-zoomed, un-panned) domain -- e.g. for a "Clear" action. Only meaningful
     * (called) while `zoomEnabled` is true.
     */
    onZoomReset?: (resetZoom: () => void) => void
    /**
     * When set, uses a cadence with the specified refresh period (in milliseconds). For plots
     * where the updates are slow (> 100 ms) using a cadence of 10 to 25 ms smooths out the
     * updates and makes the plot updates look cleaner. When updates are around 25 ms or less,
     * then setting the cadence period too small will result in poor update performance. Generally
     * at high update speeds, the cadence is unnecessary. Finally, using cadence, sets the max time
     * to the current time.
     *
     * Note: the Poincaré plot accepts this, but doesn't (yet) use it -- its axes don't follow time.
     */
    withCadenceOf?: number
    /**
     * When true, hovering over a point also highlights the (single, shared) x- and y-axes it is
     * plotted against, in the series' own highlight color/width. Defaults to `false`.
     */
    highlightAxesOnMouseOver?: boolean
}

/**
 * Renders a streaming Poincare (iterates) plot for the series held by the {@link StreamingDataSource}
 * handed to the {@link Chart} (its `dataSource` prop). This component uses the {@link useChart}
 * hook, and therefore must be a child of the {@link Chart} in order to be plugged in to the
 * chart ecosystem (axes, tracker, tooltip).
 *
 * Internally, this no longer creates/updates SVG `<path>`/`<circle>`/`<text>` elements. Instead, it
 * registers a single draw function with the chart's {@link CanvasContext} that redraws every
 * series' line and points from scratch each time the canvas repaints. The old version's
 * hover-a-point-and-annotate-its-neighbors behavior used direct `d3.select('#specific-id')` lookups
 * into already-rendered SVG elements from a separate pass after the main render; since canvas has
 * no persistent elements to reach back into, this is restructured so the single draw pass checks
 * "is this point hovered, or a neighbor of the hovered point" and renders the highlight/label
 * inline, driven by a `hoveredPointRef` updated on `mousemove`.
 *
 * @param props The properties associated with the Poincaré plot
 * @return `null` (the plot draws onto the chart's canvas)
 * @example
 * ```typescript
 *  <PoincarePlot
 *      interpolation={interpolation}
 *      showPoints={true}
 *      panEnabled={true}
 *      zoomEnabled={true}
 *      zoomKeyModifiersRequired={true}
 *  />
 * ```
 */
export function PoincarePlot(props: Props): null {
    const {
        chartId,
        canvasContext,
        axes,
        backgroundColor,
        seriesStyles,
        seriesFilter,

        mouse
    } = useChart<IterateDatum, SeriesLineStyle, NoTooltipMetadata, ContinuousAxisRange, ContinuousNumericAxis>()

    const {
        xAxesState,
        yAxesState,
        setAxisIntervalFor,
        updateAxisRanges = noop,
        axisRangeFor,
        addAxesRangesUpdateHandler,
        removeAxesRangesUpdateHandler,
    } = axes

    // this plot doesn't auto-scale its y-axes, so warn about any that ask to be (see
    // `ContinuousAxis`'s `autoScale` prop)
    useEffect(
        () => warnAboutIgnoredAutoScale("PoincarePlot", yAxesState.axes),
        [yAxesState]
    )

    const {
        mouseOverHandlerFor,
        mouseLeaveHandlerFor
    } = mouse

    const {
        plotDimensions,
        margin,
    } = usePlotDimensions()

    const {
        windowingTime = 100,
        onUpdateChartTime = noop,
    } = useDataObservable()

    // the application-owned source of the data, and whether it's running (streaming)
    const dataSource = useDataSource<IterateChartData, IterateDatum, IterateSeries>()
    const running = useDataSourceRunning(dataSource)

    const {initialData} = useInitialData<IterateDatum>()

    const {visibilityState: tooltipVisible} = useTooltip()

    const {
        interpolation,
        showPoints = true,
        panEnabled = false,
        zoomEnabled = false,
        zoomKeyModifiersRequired = true,
        zoomMinScaleFactor = 0,
        zoomMaxScaleFactor = 1,
        highlightAxesOnMouseOver = false,
        colorizeLines = false,
        lineStartColor = DEFAULT_LINE_START_COLOR,
        lineEndColor = DEFAULT_LINE_END_COLOR,
        lineColorSteps = DEFAULT_LINE_COLOR_STEPS,
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
    // iterate series, e.i. an array of BaseSeries<IterateDatum> objects). The slice just creates a copy of
    // the array, but the references to the BaseSeries objects are the same and still point to the same
    // data as the "initialData" array.
    //
    // the "seriesRef" object is a reference to a map (series_name -> BaseSeries<IterateDatum>), used
    // to find the series under the mouse (for the tooltip).
    //
    // the series in the "dataRef" object are the ones read by the next redraw, so as these are
    // updated, the next canvas repaint picks up the new data.
    const dataRef = useRef<Array<IterateSeries>>(initialData.slice() as Array<IterateSeries>)
    const seriesRef = useRef<Map<string, IterateSeries>>(new Map(initialData.map(series => [series.name, series as IterateSeries])))
    // map(axis_id -> current_time) -- maps the axis ID to the current time for that axis
    const currentTimeRef = useRef<number>(0)
    const xAxisRangesRef = useRef<Map<string, ContinuousAxisRange>>(new Map());
    const yAxisRangesRef = useRef<Map<string, ContinuousAxisRange>>(new Map());

    // tooltips are only shown while the data source is paused (and not while panning)
    const allowTooltip = useRef<boolean>(!(dataSource?.running ?? false))

    // so that we can reset the zoom when the axes-bounds change, we hold on to the zoom-behaviour
    // and the zoom-selection so that we can reset the transform to the identity
    const zoomRef = useRef<d3.ZoomBehavior<HTMLCanvasElement, Datum>>(undefined)
    const zoomSelectionRef = useRef<d3.Selection<HTMLCanvasElement, Datum, null, undefined>>(undefined)

    // the last d3-zoom `event.transform.k` this plot applied -- see ScatterPlot's identical
    // `lastZoomKRef` for the full explanation: d3-zoom's `k` is cumulative, but the zoom math is
    // incremental, so each event's `k` must be divided by this ref (then this ref updated to that
    // `k`) before being passed to `onZoom`. Reset to 1 wherever d3-zoom's own transform is reset to
    // identity (see `updatedBoundsHandler` below).
    const lastZoomKRef = useRef<number>(1)

    // the last-drawn geometry for each series' points, in canvas coordinates, used for
    // hit-testing mouse hover on `mousemove` (see the effect below that wires up the listener).
    // Also keeps the corresponding `IteratePointSeries` so the hovered/neighbor points' data can
    // be looked up by index.
    const geometryRef = useRef<Map<string, SeriesGeometry>>(new Map())
    const plotDataRef = useRef<Map<string, IteratePointSeries>>(new Map())
    // which point (series + index) is currently hovered, so the draw pass can highlight it and
    // its neighbors, and so we know when to fire a "leave"
    const hoveredPointRef = useRef<{seriesName: string, index: number} | undefined>(undefined)

    const updatePlot = useCallback(
        /**
         * (Re-)registers this plot's draw function with the canvas context and requests a redraw.
         *
         * Pan/zoom behavior setup lives in a separate effect (see below), not here -- this
         * function runs on every data tick, and recreating/reattaching a `d3.drag()`/`d3.zoom()`
         * behavior that often is pure overhead unrelated to drawing the new data.
         * @param cc The canvas context to register the draw function with
         */
        (cc: CanvasContext) => {
            onUpdateChartTime(currentTimeRef.current)

            // the colorized lines' color at a point, by the point's overall sequence number in its
            // series (see `colorizeLines`)
            const lineColorOf = pointColorScale(lineStartColor, lineEndColor, lineColorSteps)

            const draw = (context: CanvasContext) => {
                const {context2D} = context

                // create a map associating series-names to their time-series.
                const boundedSeries = new Map<string, IteratePointSeries>(dataRef.current.map(series => {
                    return [
                        series.name,
                        series.data
                            .filter(datum => !isNaN(datum.iterateN))
                            .map((datum, index) => ({
                                    n: datum.iterateN,
                                    n_1: datum.iterateN_1,
                                    time: datum.time,
                                    index: index
                                })
                            ) as IteratePointSeries
                    ]
                }))

                context2D.save()
                clipToArea(context, plotDimensions, {x: margin.left, y: margin.top})
                context2D.translate(margin.left, margin.top)

                // ---
                // todo only want to do this once, on the first plot, and then leave it,
                //     unless the axes are updated, also needs to be removed/added when the
                //     plot size changes
                const xAxis = xAxesState.defaultAxis().getOrThrow(() => new Error('No default axis found')) as ContinuousNumericAxis
                const yAxis = yAxesState.defaultAxis().getOrThrow(() => new Error('No default axis found')) as ContinuousNumericAxis
                // ---

                const [xStart, xEnd] = xAxesState.axisDefaultId()
                    .map(id => xAxisRangesRef.current.get(id)?.original.asTuple() || [0, 0])
                    .getOrElse([0, 0])
                const [yStart, yEnd] = yAxesState.axisDefaultId()
                    .map(id => yAxisRangesRef.current.get(id)?.original.asTuple() || [0, 0])
                    .getOrElse([0, 0])

                // the fn = fn+1 diagonal reference line (no hover behavior, matching the old
                // version's explicitly no-op mouseenter/mouseleave handlers)
                context2D.strokeStyle = "grey"
                context2D.lineWidth = 1
                context2D.beginPath()
                context2D.moveTo(xAxis.scale(xStart), yAxis.scale(yStart))
                context2D.lineTo(xAxis.scale(xEnd), yAxis.scale(yEnd))
                context2D.stroke()

                const newGeometry = new Map<string, SeriesGeometry>()
                const newPlotDataBySeries = new Map<string, IteratePointSeries>()
                const hovered = hoveredPointRef.current

                boundedSeries.forEach((data, name) => {
                    // grab the x and y axes assigned to the series, and if either or both
                    // axes aren't found, then give up and return
                    const [xAxisLinear, yAxisLinear] = axesFor(
                        axisId => xAxesState.axisFor(axisId).getOrUndefined(),
                        axisId => yAxesState.axisFor(axisId).getOrUndefined(),
                    )
                    if (xAxisLinear === undefined || yAxisLinear === undefined) return

                    // grab the style for the series
                    const seriesLineStyle: SeriesLineStyle = seriesStyles.get(name) || {
                        ...defaultLineStyle(),
                        highlightColor: defaultLineStyle().color
                    }

                    // only show the data for which the filter matches
                    const plotData = (name.match(seriesFilter)) ? data : FastShiftArray.empty<IteratePoint>()
                    newPlotDataBySeries.set(name, plotData)

                    // create the time-series path (when no interpolation is given, don't draw a
                    // connecting line at all -- matches the old version's `mainGElem.selectAll(...).remove()`)
                    if (interpolation !== undefined) {
                        const pathGenerator = d3.line<IteratePoint>()
                            .x(d => xAxis.scale(d.n || 0))
                            .y(d => yAxis.scale(d.n_1 || 0))
                            .curve(interpolation)

                        context2D.lineWidth = seriesLineStyle.lineWidth
                        if (colorizeLines) {
                            // the line's color changes along it, one step per point: a point's
                            // overall sequence number is the number of points dropped from the
                            // series so far (when the data source counts them) plus its index
                            const dropped = droppedCountFor(dataSource, name)
                            const linePoints = Array.from(plotData)
                            strokeColorizedLine(
                                context2D, linePoints,
                                d => xAxis.scale(d.n || 0), d => yAxis.scale(d.n_1 || 0),
                                interpolation, index => lineColorOf(dropped + linePoints[index].index)
                            )
                        } else {
                            context2D.strokeStyle = seriesLineStyle.color
                            context2D.stroke(new Path2D(pathGenerator(Array.from(plotData)) ?? ""))
                        }
                    }

                    // when specified, show a circle for the actual data point
                    const points: Array<[number, number]> = []
                    if (showPoints) {
                        const isThisSeriesHovered = hovered?.seriesName === name

                        plotData.forEach((d: IteratePoint) => {
                            const x = xAxisLinear.scale(d.n) || 0
                            const y = yAxisLinear.scale(d.n_1) || 0
                            points.push([x + margin.left, y + margin.top])

                            const isHoveredPoint = isThisSeriesHovered && hovered!.index === d.index
                            const isNeighborOfHovered = isThisSeriesHovered &&
                                (hovered!.index === d.index - 1 || hovered!.index === d.index + 1)

                            if (isHoveredPoint) {
                                // the hovered point itself: enlarged, highlight-colored, no label
                                // (matches the old version, which only labeled the *neighbors*)
                                context2D.fillStyle = seriesLineStyle.highlightColor
                                context2D.beginPath()
                                context2D.arc(x, y, 5, 0, 2 * Math.PI)
                                context2D.fill()
                            } else if (isNeighborOfHovered) {
                                // a neighbor of the hovered point: enlarged, brighter fill, stroked,
                                // with a floating "n = i; t = X ms" label above it
                                const brighterColor = d3.rgb(seriesLineStyle.highlightColor).brighter(0.7).toString()
                                context2D.fillStyle = brighterColor
                                context2D.strokeStyle = seriesLineStyle.color
                                context2D.lineWidth = seriesLineStyle.lineWidth
                                context2D.beginPath()
                                context2D.arc(x, y, 5, 0, 2 * Math.PI)
                                context2D.fill()
                                context2D.stroke()

                                const label = `n = ${d.index}; t = ${formatTime(d.time)} ms`
                                context2D.font = fontStringFor(11, 'sans-serif', 700)
                                const {width, height} = textDimensions(context2D, label)
                                const padding = 4
                                const circleRadius = 5
                                const circleStroke = seriesLineStyle.lineWidth

                                context2D.fillStyle = backgroundColor
                                context2D.fillRect(
                                    x - padding / 2 - 8,
                                    y - padding / 2 - circleRadius - circleStroke - height,
                                    width + padding,
                                    height + padding / 2
                                )

                                context2D.fillStyle = seriesLineStyle.highlightColor
                                context2D.textAlign = 'left'
                                context2D.textBaseline = 'alphabetic'
                                context2D.fillText(label, x - 8, y - circleRadius - circleStroke - padding)
                            } else {
                                // normal, unhovered point
                                context2D.fillStyle = seriesLineStyle.color
                                context2D.beginPath()
                                context2D.arc(x, y, 2, 0, 2 * Math.PI)
                                context2D.fill()
                            }
                        })
                    }
                    newGeometry.set(`${name}::points`, {points, hitRadius: 6})
                })

                geometryRef.current = newGeometry
                plotDataRef.current = newPlotDataBySeries

                context2D.restore()
            }

            cc.register(`poincare-plot-${chartId}`, draw, 10)
            cc.requestRedraw()
        },
        [
            chartId, onUpdateChartTime, plotDimensions, margin,
            xAxesState, yAxesState,
            seriesStyles, seriesFilter, showPoints,
            interpolation, backgroundColor,
            colorizeLines, lineStartColor, lineEndColor, lineColorSteps, dataSource,
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

    // hands the current zoom/pan state (d3-zoom's cumulative `k`, which `lastZoomKRef` tracks, and
    // every axis' current domain) to the `onZoomStateChange` callback
    const onZoomStateChangeRef = useRef(onZoomStateChange)
    useEffect(
        () => {
            onZoomStateChangeRef.current = onZoomStateChange
        },
        [onZoomStateChange]
    )
    const reportZoomState = useCallback(
        (): void => {
            const ranges: Record<string, [number, number]> = {}
            xAxisRangesRef.current.forEach((range, axisId) => ranges[axisId] = range.current.asTuple())
            yAxisRangesRef.current.forEach((range, axisId) => ranges[axisId] = range.current.asTuple())
            onZoomStateChangeRef.current({k: lastZoomKRef.current, ranges})
        },
        []
    )

    // the zoom state to restore, captured once at mount (see the `zoomState` prop); cleared once
    // it has been applied (see `restoreZoomState` below), so it's only ever applied once
    const pendingZoomStateRef = useRef<PoincarePlotZoomState | undefined>(zoomState)

    // applies the pending zoom state (if any) to the axes' ranges and to d3-zoom's transform on the
    // canvas (a remounted plot has a brand-new canvas, whose transform starts at identity). Each
    // range keeps its `.original` -- the axis' real, un-zoomed domain -- since the zoom handler's
    // constraint is measured against it. Waits until the axes' ranges and the canvas exist.
    const restoreZoomState = useEffectEvent((): void => {
        const pending = pendingZoomStateRef.current
        if (pending === undefined || canvasContext === null) return
        if (xAxisRangesRef.current.size === 0 || yAxisRangesRef.current.size === 0) return

        Object.entries(pending.ranges).forEach(([axisId, [start, end]]) => {
            const interval = AxisInterval.from(start, end)
            const ranges = xAxisRangesRef.current.has(axisId) ? xAxisRangesRef.current : yAxisRangesRef.current
            const range = ranges.get(axisId)
            const axis = xAxesState.axisFor(axisId).getOrUndefined() ?? yAxesState.axisFor(axisId).getOrUndefined()
            if (range === undefined || axis === undefined) return
            ranges.set(axisId, range.update(start, end))
            setAxisIntervalFor(axisId, interval)
            axis.update(interval, plotDimensions, margin)
        })
        // `__zoom` is where d3-zoom keeps an element's transform; setting it directly (rather than
        // through `zoom.transform`) avoids dispatching a synthetic "zoom" event
        d3.select(canvasContext.canvas).property("__zoom", d3.zoomIdentity.scale(pending.k))
        lastZoomKRef.current = pending.k
        pendingZoomStateRef.current = undefined
        updatePlotRef.current(canvasContext)
    })

    // when the axes are available, then set the reference, but only once
    useEffect(() => {
        if (xAxesState.axes.size > 0 && xAxisRangesRef.current.size === 0) {
            xAxisRangesRef.current = generateAxisRangeMap(xAxesState.axes)
        }
        if (yAxesState.axes.size > 0 && yAxisRangesRef.current.size === 0) {
            yAxisRangesRef.current = generateAxisRangeMap(yAxesState.axes)
        }
        // restore a zoom state handed in from a previous instance (only does anything the first
        // time the axes and canvas are all available -- see `restoreZoomState`)
        restoreZoomState()
    }, [xAxesState, yAxesState, canvasContext]);

    // calculates the distinct axis IDs that cover all the series in the plot
    const xAxesForSeries = useMemo(
        (): Array<string> => xAxesState.axisIds(),
        [xAxesState]
    )
    const yAxesForSeries = useMemo(
        (): Array<string> => yAxesState.axisIds(),
        [yAxesState]
    )


    // update the plot with the new axes bounds
    const updateRangesAndPlot = useCallback(
        (): void => {
            if (canvasContext !== null) {
                updatePlotRef.current(canvasContext)
            }
        },
        [canvasContext]
    )

    // todo find better way
    // when the initial data changes, then reset the plot. note that the initial data doesn't change
    // during the normal course of updates from the data source, only when the data source is replaced.
    useEffect(
        () => {
            dataRef.current = initialData.slice()
            seriesRef.current = new Map(initialData.map(series => [series.name, series]))
            currentTimeRef.current = 0

            updateRangesAndPlot()
        },
        [initialData, updateRangesAndPlot]
    )

    /**
     * When the axes bounds have changed (from outside, e.g. a different iterate function), resets
     * the range references so that the new axis ranges are used -- as the axes' new original
     * (un-zoomed) domains -- resets the zoom, and reports the (reset) zoom state
     * @param updates The updates to the axes
     */
    const updatedBoundsHandler = useCallback(
        (updates: Map<string, ContinuousAxisRange>): void => {
            // the new bounds become the axes' new un-zoomed (original) domains -- the zoom is reset
            // to identity below, so they're the baseline the zoom constraint and the fully-zoomed-out
            // snap (see `snapToOriginalRanges`) must measure against. The update itself can't be
            // used as-is: `ContinuousAxis` carries the *previous* `.original` forward on a domain
            // change, which would leave the zoom clamped to (and snapping back to) the old domain,
            // e.g. [0, 1] after switching to an iterate function whose range is [-1, 1].
            updates.forEach((update, axisId) => {
                const [start, end] = update.current.asTuple()
                if (xAxisRangesRef.current.has(axisId)) {
                    xAxisRangesRef.current.set(axisId, ContinuousAxisRange.from(start, end))
                }
                if (yAxisRangesRef.current.has(axisId)) {
                    yAxisRangesRef.current.set(axisId, ContinuousAxisRange.from(start, end))
                }
            })
            if (zoomEnabled && zoomSelectionRef.current !== undefined && zoomRef.current !== undefined) {
                zoomSelectionRef.current.call(zoomRef.current.transform, d3.zoomIdentity)
                // d3-zoom's own `k` is back at identity (1) -- see ScatterPlot's identical reset
                // for why `lastZoomKRef` must follow it back to 1
                lastZoomKRef.current = 1
            }
            // the axes' bounds were changed from outside (e.g. a different iterate function), which
            // resets the zoom, so a previously reported zoom state no longer applies
            reportZoomState()
        },
        [zoomEnabled, reportZoomState]
    )

    // strange construct so that we only add the update handler when the chart ID
    // changes, and not when the addAxesBoundsUpdateHandler or removeAxesBoundsUpdateHandler
    // which they do, and that breaks the updates...someone, please teach me react
    //
    // the update handler is needed so that when the axis bounds are changed (say to accommodate a
    // different iterate function's domain/range), then the handler needs to update the x and y
    // axes range refs
    const addAxesBoundsUpdateHandlerRef = useRef(addAxesRangesUpdateHandler)
    const removeAxesBoundsUpdateHandlerRef = useRef(removeAxesRangesUpdateHandler)
    useEffect(
        () => {
            addAxesBoundsUpdateHandlerRef.current(`handler-${chartId}`, updatedBoundsHandler)
            const removeHandler = removeAxesBoundsUpdateHandlerRef.current
            return () => {
                // closure on the function to remove the handler from this chart
                removeHandler(`handler-${chartId}`)
            }
        },
        [chartId, updatedBoundsHandler]
    );

    /**
     * Adjusts the x- and y-axes' ranges when the plot is dragged (the caller redraws the plot)
     * @param x The amount that the plot is dragged in x
     * @param y The amount that the plot is dragged in y
     * @param plotDimensions The dimensions of the plot
     * @param series An array of series names
     * @param xRanges A map holding the x-axis ID and its associated range
     * @param yRanges A map holding the y-axis ID and its associated range
     */
    const onPan = useCallback(
        (
            x: number,
            y: number,
            plotDimensions: Dimensions,
            series: Array<string>,
            xRanges: Map<string, ContinuousAxisRange>,
            yRanges: Map<string, ContinuousAxisRange>,
        ) => panHandler2D(
            xAxesForSeries, yAxesForSeries,
            margin,
            setAxisIntervalFor,
            xAxesState, yAxesState
        )(x, y, plotDimensions, series, xRanges, yRanges),
        [xAxesForSeries, yAxesForSeries, margin, setAxisIntervalFor, xAxesState, yAxesState]
    )

    /**
     * Restores every axis to its original (un-zoomed) domain. Used when d3-zoom's cumulative `k`
     * returns to exactly 1 (fully zoomed out): composing pivot-preserving zooms at *different*
     * pivots isn't position-preserving (zooming in at one spot and back out at another nets a
     * translation, as in any pinch-zoom UI), and the zoom constraint clamps that translated window
     * to the original bounds -- so without this, zooming in at one spot and out at another stops
     * short of the full view on both axes, with `k` already at its maximum. d3-zoom's `scaleExtent`
     * clamps `k` to *exactly* 1 at that limit, so the equality check reliably detects it. (This is
     * the continuous-axis counterpart of `OrdinalAxisRange.scaledCumulative`'s `factor === 1` case.)
     */
    const snapToOriginalRanges = useCallback(
        (): void => {
            const snap = (ranges: Map<string, ContinuousAxisRange>, axesState: typeof xAxesState) =>
                ranges.forEach((range, axisId) => {
                    ranges.set(axisId, range.update(range.original.start, range.original.end))
                    setAxisIntervalFor(axisId, range.original)
                    axesState.axisFor(axisId).ifPresent(axis => axis.update(range.original, plotDimensions, margin))
                })
            snap(xAxisRangesRef.current, xAxesState)
            snap(yAxisRangesRef.current, yAxesState)
        },
        [setAxisIntervalFor, xAxesState, yAxesState, plotDimensions, margin]
    )

    /**
     * Called when the user uses the scroll wheel (or scroll gesture) to zoom in or out. Zooms in/out
     * at the location of the mouse when the scroll wheel or gesture was applied. Unlike time-series
     * plots, the iterates plot zooms the x- and y-axis at the same rate.
     * @param zoomFactor The *incremental* zoom scale factor for this event -- see the pan/zoom
     * effect below (`lastZoomKRef`) for how d3-zoom's own cumulative `event.transform.k` is
     * converted to this incremental form before this is called.
     * @param x The x-position of the mouse when the scroll wheel or gesture is used
     * @param y The y-position of the mouse when the scroll wheel or gesture is used
     * @param plotDimensions The dimensions of the plot
     * @param xRanges A map holding the x-axis ID and its associated range
     * @param yRanges A map holding the y-axis ID and its associated range
     */
    const onZoom = useCallback(
        (
            zoomFactor: number,
            x: number,
            y: number,
            plotDimensions: Dimensions,
            xRanges: Map<string, ContinuousAxisRange>,
            yRanges: Map<string, ContinuousAxisRange>
        ) => axesZoomHandler(
            xAxesForSeries, yAxesForSeries, margin, setAxisIntervalFor, xAxesState, yAxesState, [zoomMinScaleFactor, zoomMaxScaleFactor]
        )(zoomFactor, [x, y], plotDimensions, xRanges, yRanges),
        [xAxesForSeries, yAxesForSeries, margin, setAxisIntervalFor, xAxesState, yAxesState, zoomMinScaleFactor, zoomMaxScaleFactor]
    )

    // sets up panning and zooming exactly once (and again only when something pan/zoom-relevant
    // actually changes -- e.g. a resize), rather than on every data tick. This used to live inside
    // `updatePlot`, which runs on every data tick; recreating a `d3.drag()`/`d3.zoom()` behavior
    // and reattaching it to the canvas that often was pure overhead unrelated to drawing the new
    // data, and the constant allocation churn is a plausible contributor to the plot getting
    // choppier the longer a stream runs.
    useEffect(
        () => {
            if (!canvasContext) return
            const cc = canvasContext
            const canvasSelection = d3.select<HTMLCanvasElement, Datum>(cc.canvas)

            if (panEnabled) {
                const drag = d3.drag<HTMLCanvasElement, Datum>()
                    .on("start", () => {
                        canvasSelection.style("cursor", "move")
                        // during panning, we need to disable viewing the tooltip to prevent
                        // tooltips from rendering but not getting removed
                        allowTooltip.current = false;
                    })
                    .on("drag", event => {
                        onPan(
                            event.dx,
                            event.dy,
                            plotDimensions,
                            dataRef.current.map(series => series.name),
                            xAxisRangesRef.current,
                            yAxisRangesRef.current
                        )
                        updatePlotRef.current(cc)
                    })
                    .on("end", () => {
                        canvasSelection.style("cursor", "auto")
                        // during panning, we disabled viewing the tooltip to prevent
                        // tooltips from rendering but not getting removed, now that panning
                        // is over, allow tooltips to render again
                        allowTooltip.current = !(dataSource?.running ?? false)
                        reportZoomState()
                    })

                canvasSelection.call(drag)
            }

            if (zoomEnabled) {
                zoomRef.current = d3.zoom<HTMLCanvasElement, Datum>()
                    // restricted to wheel events -- see RasterPlot's identical `.filter()` for
                    // the full explanation: without this, d3-zoom's own built-in mousedown-drag
                    // handling (which it still has, separate from this app's dedicated pan
                    // `d3.drag()`) would ALSO fire "zoom" events for a shift/ctrl-held drag,
                    // double-handling the same gesture.
                    .filter(event => event.type === 'wheel' && (!zoomKeyModifiersRequired || event.shiftKey || event.ctrlKey))
                    .scaleExtent([zoomMinScaleFactor, zoomMaxScaleFactor])
                    .translateExtent([[margin.left, margin.top], [plotDimensions.width, plotDimensions.height]])
                    .on("zoom", event => {
                            allowTooltip.current = false
                            if (event.sourceEvent !== null) {
                                // convert d3-zoom's cumulative `k` to the incremental factor this
                                // event represents -- see `lastZoomKRef`'s declaration above
                                const zoomFactor = event.transform.k / lastZoomKRef.current
                                lastZoomKRef.current = event.transform.k

                                // back at d3-zoom's identity (`k` is exactly 1, see `snapToOriginalRanges`)
                                // means fully zoomed out, which has exactly one correct view: the axes'
                                // original domains, however many pivots it took to get here
                                if (event.transform.k === 1) {
                                    snapToOriginalRanges()
                                } else {
                                    onZoom(
                                        zoomFactor,
                                        event.sourceEvent.offsetX - margin.left,
                                        event.sourceEvent.offsetY - margin.top,
                                        plotDimensions,
                                        xAxisRangesRef.current,
                                        yAxisRangesRef.current
                                    )
                                }
                                updatePlotRef.current(cc)
                                reportZoomState()
                            }
                            allowTooltip.current = true
                        }
                    )

                zoomSelectionRef.current = canvasSelection.call(zoomRef.current)

                // hands the caller a way to reset the zoom: d3-zoom's transform back to identity
                // (the resulting "zoom" event has no source event, so the handler above ignores it),
                // and every axis back to its original domain
                const zoom = zoomRef.current
                onZoomReset(() => {
                    canvasSelection.call(zoom.transform, d3.zoomIdentity)
                    lastZoomKRef.current = 1
                    snapToOriginalRanges()
                    updatePlotRef.current(cc)
                    reportZoomState()
                })
            }

            return () => {
                if (panEnabled) canvasSelection.on(".drag", null)
                if (zoomEnabled) {
                    canvasSelection.on(".zoom", null)
                    zoomRef.current = undefined
                    zoomSelectionRef.current = undefined
                }
            }
        },
        [
            canvasContext, panEnabled, zoomEnabled, onPan, onZoom, plotDimensions, margin,
            zoomKeyModifiersRequired, zoomMinScaleFactor, zoomMaxScaleFactor, dataSource, reportZoomState,
            snapToOriginalRanges, onZoomReset
        ]
    )

    const onUpdateAxesBoundsRef = useRef(updateAxisRanges)
    useEffect(
        () => {
            onUpdateAxesBoundsRef.current = updateAxisRanges
        },
        [updateAxisRanges]
    )

    // updates the plot when the interpolation and filter change, because the updatePlot
    // callback has changed.
    useEffect(
        () => {
            if (canvasContext) {
                updatePlot(canvasContext)
            }
        },
        [axisRangeFor, canvasContext, updatePlot]
    )

    // wires up a single mousemove/mouseleave listener on the shared canvas to replace the old
    // per-element SVG mouseenter/mouseleave handlers on the point circles. Hit-tests the mouse
    // position against the last-drawn point geometry (see `geometryRef`, populated by the draw
    // function above).
    useEffect(
        () => {
            if (!canvasContext) return

            const canvas = canvasContext.canvas

            // highlights (or un-highlights) the shared x- and y-axes -- keyed on the series name
            // alone (not the specific hovered point index), so moving the mouse between a
            // series' own points doesn't flicker the highlight off and on
            const highlightAxesFor = (seriesName: string, isHighlighted: boolean): void => {
                if (!highlightAxesOnMouseOver) return
                const [xAxis, yAxis] = axesFor(
                    axisId => xAxesState.axisFor(axisId).getOrUndefined(),
                    axisId => yAxesState.axisFor(axisId).getOrUndefined(),
                )
                const {highlightColor, highlightWidth} = seriesStyles.get(seriesName) || defaultLineStyle()
                xAxis?.setHighlighted(isHighlighted, highlightColor, highlightWidth)
                yAxis?.setHighlighted(isHighlighted, highlightColor, highlightWidth)
            }

            const handleMove = (event: MouseEvent) => {
                if (!allowTooltip.current || !tooltipVisible) return

                const [x, y] = canvasLocalPoint(event, canvas)
                const hit = seriesAt(x, y, geometryRef.current)
                const hitSeriesName = hit?.name.replace(/::points$/, '')

                const previous = hoveredPointRef.current

                if (previous?.seriesName !== hitSeriesName) {
                    if (previous !== undefined) highlightAxesFor(previous.seriesName, false)
                    if (hitSeriesName !== undefined) highlightAxesFor(hitSeriesName, true)
                }

                const sameAsBefore = previous !== undefined && hit !== undefined &&
                    previous.seriesName === hitSeriesName && previous.index === hit.index

                if (sameAsBefore) return

                if (previous !== undefined) {
                    handleMouseLeavePoint(previous.seriesName, mouseLeaveHandlerFor(`tooltip-${chartId}`))
                }

                if (hit !== undefined && hitSeriesName !== undefined) {
                    const plotData = plotDataRef.current.get(hitSeriesName)
                    if (plotData !== undefined) {
                        handleMouseEnterPoint(
                            hitSeriesName,
                            plotData[hit.index],
                            plotData,
                            [x, y],
                            mouseOverHandlerFor(`tooltip-${chartId}`)
                        )
                    }
                }

                hoveredPointRef.current = hit !== undefined && hitSeriesName !== undefined ?
                    {seriesName: hitSeriesName, index: hit.index} :
                    undefined

                // hover state affects the highlight/label drawing, so request a redraw
                canvasContext.requestRedraw()
            }

            const handleLeaveCanvas = () => {
                const previous = hoveredPointRef.current
                if (previous !== undefined) {
                    handleMouseLeavePoint(previous.seriesName, mouseLeaveHandlerFor(`tooltip-${chartId}`))
                    highlightAxesFor(previous.seriesName, false)
                    hoveredPointRef.current = undefined
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
            canvasContext, chartId, mouseOverHandlerFor, mouseLeaveHandlerFor, tooltipVisible,
            highlightAxesOnMouseOver, xAxesState, yAxesState, seriesStyles
        ]
    )

    // the latest `updateRangesAndPlot`, for the view driver to call -- the driver is created once
    // per run (see below), so it must not capture a stale one (e.g. bound to an older canvas)
    const updateRangesAndPlotRef = useRef(updateRangesAndPlot)
    useEffect(
        () => {
            updateRangesAndPlotRef.current = updateRangesAndPlot
        },
        [updateRangesAndPlot]
    )

    // creates the view driver that keeps this plot's view in step with the data source, using the
    // current settings -- see ScatterPlot's identical effect event
    const createViewDriver = useEffectEvent(
        (source: NonNullable<typeof dataSource>) => iteratesViewDriverFor(
            source,
            windowingTime,
            xAxesState,
            yAxesState,
            () => updateRangesAndPlotRef.current(),
            end => currentTimeRef.current = end
        )
    )

    // while the data source is running (and this plot has a canvas), drive the view from the
    // data source's updates -- see ScatterPlot's identical effect. The driver belongs to this plot
    // instance alone and is always torn down with it.
    useEffect(
        () => {
            if (dataSource === undefined || !running || canvasContext === null) return
            allowTooltip.current = false
            const driver = createViewDriver(dataSource)
            return () => {
                driver.unsubscribe()
                allowTooltip.current = true
            }
        },
        [dataSource, running, canvasContext]
    )

    // this plot needs a data source (see the `Chart`'s `dataSource` prop)
    useEffect(
        () => {
            if (dataSource === undefined) {
                console.error("PoincarePlot requires a data source; set the enclosing Chart's `dataSource` prop")
            }
        },
        [dataSource]
    )

    // unregister this plot's draw function on unmount
    useEffect(
        () => {
            return () => {
                if (canvasContext) {
                    canvasContext.unregister(`poincare-plot-${chartId}`)
                }
            }
        },
        [canvasContext, chartId]
    )

    return null
}

/**
 * @param dataSource The chart's data source
 * @param seriesName The name of the series
 * @return The number of points dropped from the series so far, when the data source counts them
 * (an {@link IteratesDataSource} does); otherwise 0
 */
function droppedCountFor(dataSource: unknown, seriesName: string): number {
    return dataSource !== null && typeof dataSource === 'object' && 'droppedCountFor' in dataSource ?
        (dataSource as {droppedCountFor: (name: string) => number}).droppedCountFor(seriesName) :
        0
}

/**
 * Locates the plot's x- and y-axes: always the default (first) ones, since every series of a
 * Poincaré plot shares the same axes
 * @param xAxisFor The function that accepts an axis ID and returns the corresponding x-axis
 * @param yAxisFor The function that accepts an axis ID and returns the corresponding y-axis
 * @return The x- and y-axes (either is actually `undefined` when it isn't found, despite the type)
 * @throws Error when either axis isn't a continuous numeric axis
 */
function axesFor(
    xAxisFor: (id: string) => BaseAxis | undefined,
    yAxisFor: (id: string) => BaseAxis | undefined,
): [xAxis: ContinuousNumericAxis, yAxis: ContinuousNumericAxis] {
    const xAxis = xAxisFor("")
    const yAxis = yAxisFor("")
    if (xAxis && xAxis.axisType !== AxisType.ContinuousNumeric) {
        throw Error("Poincare plot requires that x-axis be of type LinearAxis")
    }
    if (yAxis && yAxis.axisType !== AxisType.ContinuousNumeric) {
        throw Error("Poincare plot requires that y-axis be of type LinearAxis")
    }
    const xAxisLinear = xAxis as ContinuousNumericAxis
    const yAxisLinear = yAxis as ContinuousNumericAxis
    return [xAxisLinear, yAxisLinear]
}

/**
 * Reports the tooltip for the hovered point. Replaces the old version, which also directly
 * mutated the hovered SVG `<circle>`'s radius/fill (and its neighbors') as a side effect; that
 * highlighting is now handled entirely by the draw function reading `hoveredPointRef` (see
 * `updatePlot`'s `draw`) rather than by touching elements here.
 * @param seriesName The name of the series (i.e. the neuron ID)
 * @param datum The hovered point, or `undefined` if the index doesn't resolve to a point
 * @param plotData The iterates series
 * @param mouseCoords The `[x, y]` position of the mouse, in canvas coordinates
 * @param mouseOverHandlerFor The handler for the mouse-over (registered by the <Tooltip/>)
 */
function handleMouseEnterPoint(
    seriesName: string,
    datum: IteratePoint | undefined,
    plotData: IteratePointSeries,
    mouseCoords: [x: number, y: number],
    mouseOverHandlerFor: ((seriesName: string, time: number, tooltipData: TooltipData<IterateDatum, NoTooltipMetadata>, mouseCoords: [x: number, y: number]) => void) | undefined,
): void {
    if (datum === undefined) return

    if (mouseOverHandlerFor) {
        mouseOverHandlerFor(
            seriesName,
            datum.time,
            {series: plotData.map(ip => ({iterateN: ip.n, iterateN_1: ip.n_1, time: ip.time})), metadata: {}},
            mouseCoords
        )
    }
}

/**
 * Calls the mouse-leave-series handler registered for this series (the highlight is cleared by
 * the draw function, once the hovered point is cleared)
 * @param seriesName The name of the series
 * @param mouseLeaverHandlerFor Registered handler for the series when the mouse leaves
 */
function handleMouseLeavePoint(
    seriesName: string,
    mouseLeaverHandlerFor: ((seriesName: string) => void) | undefined,
): void {
    if (mouseLeaverHandlerFor) {
        mouseLeaverHandlerFor(seriesName)
    }
}
