import {useCallback, useEffect, useEffectEvent, useMemo, useRef} from 'react'
import {useHoveredSeries} from "../hooks/useHoveredSeries";
import * as d3 from "d3"
import {Optional} from "result-fn"

import {useChart} from "../hooks/useChart"
import {useDataSource, useDataSourceRunning, useInitialData, useStreamingSettings} from "../hooks/useDataSource";
import {usePlotDimensions} from "../hooks/usePlotDimensions"
import {type AxesAssignment, clipToArea, currentIntervalsFrom} from "./plot"
import type {CanvasContext} from "../d3types"
import {seriesAt, canvasLocalPoint, type SeriesGeometry} from "./hitTesting"
import {noop} from "../utils"
import type {Dimensions} from "../styling/margins"
import {ContinuousAxisRange} from "../axes/ContinuousAxisRange"
import {AxisInterval} from "../axes/AxisInterval"
import {extentWith, visibleExtent} from "../axes/autoScale"
import {growAutoScaledYAxes, useAutoScaleRestart} from "./autoScaleYAxes"
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
} from "../axes/axes"
import {outlierAxisTimes, timeAxisViewDriverFor, TimeWindowBehavior} from "../subscriptions/viewDrivers"
import type {OutlierChartData} from "../observables/outliers"
import type {OutlierDatum, OutlierSeries} from "../series/outlierSeries"
import {FastShiftArray} from "fast-shift-array";

type OutlierDatumColor<M extends readonly number[]> = { datum: OutlierDatum<M>, color: string }

export interface Props {
    /**
     * Holds the mapping between a series and the axis it uses (is assigned). The
     * map's key holds the series name, and the value is an {@link AxesAssignment}
     * object holding the ID of the assigned x-axis and y-axis.
     */
    axisAssignments?: Map<string, AxesAssignment>
    /**
     * The line interpolation curve factory. See the d3 documentation for curves at
     * {@link https://github.com/d3/d3-shape#curves} for information on available interpolations.
     */
    interpolation?: d3.CurveFactory
    /**
     * Whether to enable panning. Defaults to false.
     */
    panEnabled?: boolean
    /**
     * Whether to enable zooming. Defaults to false.
     */
    zoomEnabled?: boolean
    /**
     * Whether to require the shift or ctrl key to be held down when zooming. Defaults to true.
     */
    zoomKeyModifiersRequired?: boolean
    /**
     * Behavior for time windowing (see {@link TimeWindowBehavior}). Defaults to `SCROLL`. Ignored
     * when `withCadenceOf` is set.
     */
    timeWindowBehavior?: TimeWindowBehavior
    /**
     * When set, uses a cadence with the specified refresh period (in milliseconds). For plots
     * where the updates are slow (> 100 ms) using a cadence of 10 to 25 ms smooths out the
     * updates and makes the plot updates look cleaner. When updates are around 25 ms or less,
     * then setting the cadence period too small will result in poor update performance. Generally
     * at high update speeds, the cadence is unnecessary. Finally, using cadence, sets the max time
     * to the current time -- this is what causes the x-axis to keep scrolling once the data
     * reaches the right-hand edge, even if new data hasn't arrived yet.
     */
    withCadenceOf?: number
    /**
     * Base fill-opacity for the outermost (widest) outlier band. Inner (narrower / more
     * confident) bands are rendered with progressively higher opacity, capped at 1. Defaults to 0.15.
     */
    bandOpacity?: number
    /**
     * Optional per-band opacity step added for each more-confident (lower-index) band. Defaults to 0.12.
     */
    bandOpacityStep?: number
    /**
     * Radius (px) of the circle marker drawn at each datum on the central line, while the data
     * source is paused. When omitted, no markers are drawn.
     */
    markerRadius?: number
    /**
     * Colors for the outlier marker drawn on any point that falls outside one or more bounds.
     * The array is indexed by bound (i.e. by measure), so `outlierMarkerColors[i]` is used when
     * the point is outside `bounds[i]`. When a point is outside multiple bounds, the color
     * associated with the largest exceeded bound wins. When omitted, outlier markers fall back
     * to red.
     */
    outlierMarkerColors?: ReadonlyArray<string>
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
 * Metadata carried through the tooltip system when the user hovers over an outlier band.
 */
export interface OutlierBandTooltipMetadata<M extends readonly number[] = readonly number[]> {
    /**
     * The outlier datum
     */
    datum?: OutlierDatum<M>
    /**
     * The measure (confidence level) associated with the hovered band.
     */
    upperMeasure?: number
    /**
     * The measure (confidence level) associated with the band below the hovered band.
     */
    lowerMeasure?: number
    /**
     * The index of the hovered band (0 = tightest / most confident).
     */
    bandIndex: number
    /**
     * Number of visible points whose y-value falls within the band bounds.
     */
    pointsInBand: number
}

/**
 * A band's fill region, captured at draw time for `isPointInPath`-based hover hit-testing.
 * Canvas has no per-shape events, and a filled, possibly-curved area isn't well modeled by
 * `hitTesting.ts`'s line/segment/rect primitives, so bands use `ctx.isPointInPath` directly
 * instead -- this is what canvas is built for.
 */
interface BandHitRegion<M extends readonly number[]> {
    path: Path2D
    seriesName: string
    bandIndex: number
    upperMeasure: number | undefined
    lowerMeasure: number | undefined
    plotData: FastShiftArray<OutlierDatum<M>>
}

/**
 * Renders a streaming outlier plot. Each series consists of {@link OutlierDatum} points, where every
 * datum carries an (x, y) value plus a set of (lower, upper) bounds — one per measure. The plot
 * draws the central y-line for the series and a translucent band per measure, filled between
 * the corresponding lower and upper bounds. The x-axis scrolls as new points arrive past the
 * end of the visible window, in the same fashion as {@link ScatterPlot}.
 *
 * Internally, this no longer creates/updates SVG `<path>`/`<circle>` elements. Instead, it
 * registers a single draw function with the chart's {@link CanvasContext} that redraws every
 * series' bands, line, and markers from scratch each time the canvas repaints. Band hover uses
 * `ctx.isPointInPath` against the band's actual filled path (captured each draw); outlier-marker
 * hover uses the shared point-hit-testing in `hitTesting.ts`, same as {@link ScatterPlot}'s markers.
 * When the data source is paused, hovering over a band shows the tooltip (when there's one); a
 * y-axis with `autoScale` set grows to fit the data on screen (bands included).
 * @param props The properties associated with the outlier plot
 * @return `null` (the plot draws onto the chart's canvas)
 * @template M The type of the measures (a tuple of numbers)
 */
export function OutlierPlot<M extends readonly number[] = readonly number[]>(props: Props): null {
    const {
        chartId,
        canvasContext,
        axes,
        seriesStyles,
        seriesFilter,
        mouse,
    } = useChart<OutlierDatum<M>, SeriesLineStyle, OutlierBandTooltipMetadata<M>, ContinuousAxisRange, ContinuousNumericAxis>()
    const {hoveredSeriesName} = useHoveredSeries()

    const {mouseOverHandlerFor, mouseLeaveHandlerFor} = mouse

    const {initialData} = useInitialData<OutlierDatum<M>>()

    const {
        xAxesState,
        yAxesState,
        setAxisIntervalFor,
        updateAxisRanges = noop,
        axisRangeFor,
        onUpdateAxesInterval,
    } = axes

    const {plotDimensions, margin} = usePlotDimensions()

    const {
        windowingTime = 100,
        dataUpdatePeriod,
    } = useStreamingSettings()

    // the application-owned source of the data, and whether it's running (streaming)
    const dataSource = useDataSource<OutlierChartData<M>, OutlierDatum<M>, OutlierSeries<M>>()
    const running = useDataSourceRunning(dataSource)

    const {
        axisAssignments = new Map<string, AxesAssignment>(),
        interpolation = d3.curveLinear,
        panEnabled = false,
        zoomEnabled = false,
        zoomKeyModifiersRequired = true,
        timeWindowBehavior = TimeWindowBehavior.SCROLL,
        withCadenceOf,
        bandOpacity = 0.15,
        bandOpacityStep = 0.12,
        markerRadius,
        outlierMarkerColors,
        highlightAxesOnMouseOver = false,
        onZoomReset = noop,
    } = props

    // the axes' true original (un-zoomed) [start, end] bounds, and each axis' pinned start time
    // for SQUEEZE mode -- needed because the axis object's own scale has no separate "original"
    // concept of its own: once a zoom directly mutates `scale.domain()`, that mutated value
    // becomes indistinguishable from the true original to anything that reads the scale fresh
    // (e.g. `continuousAxisRanges`, which `resetPlotForInitialData` below relies on). For an axis
    // whose `domain` prop is a static literal (as opposed to Scatter's store-backed, dynamic
    // domain), that means nothing else ever restores the scale to its starting bounds after a
    // zoom -- this is what `resetZoom` (see the pan/zoom effect below) uses to do that explicitly.
    //
    // These are refs, populated by `resetPlotForInitialData` below, rather than a `useMemo` keyed
    // on `axesRanges` -- `axesRanges` is a fresh closure on every render of `AxesProvider` (it's
    // never memoized there), so a `useMemo([axesRanges])` recomputes on essentially every render,
    // not "once at mount" as its dependency array suggests. Since `.original` is continuously
    // shifted forward by ordinary auto-scroll (see `advanceAxisRangeInMapTo`) while staying at its
    // un-zoomed width even during an active zoom, a memo that keeps re-sampling it mid-zoom
    // captures "the current un-zoomed baseline, right now" instead of "the bounds this run
    // started at" -- so clicking Reset after zooming out would snap the axis to that narrow,
    // very-current baseline instead of the true starting view, looking like Reset "zooms in".
    // Capturing these once per reset (on mount, and whenever the data source is replaced) sidesteps
    // that entirely.
    const initialTimesRef = useRef<Map<string, number>>(new Map())
    const initialAxisIntervalsRef = useRef<Map<string, [start: number, end: number]>>(new Map())

    // seriesRef is the single source of truth for what to render: the data source's own (live)
    // series map, which grows as series first appear in the stream. the draw function iterates this
    // directly (rather than a parallel dataRef array) so dynamically-arriving series get rendered.
    const seriesRef = useRef<ReadonlyMap<string, OutlierSeries<M>>>(
        dataSource?.series ?? new Map(initialData.map(series => [series.name, series as OutlierSeries<M>]))
    )
    const currentTimeRef = useRef<Map<string, number>>(new Map())

    // captured band fill-regions and outlier-marker geometry, in canvas coordinates, used for
    // hit-testing mouse hover on `mousemove` (see the effect below that wires up the listener)
    const bandsRef = useRef<Array<BandHitRegion<M>>>([])
    const outlierGeometryRef = useRef<Map<string, SeriesGeometry>>(new Map())
    const outlierDatumsRef = useRef<Map<string, Array<OutlierDatumColor<M>>>>(new Map())
    // what's currently hovered: a band (series + band index) or an outlier point (series + point
    // index) -- mutually exclusive, so we know when to fire a "leave" before an "over"
    const lastHoveredRef = useRef<{kind: 'band', seriesName: string, bandIndex: number} | {kind: 'outlier', seriesName: string, index: number} | undefined>(undefined)

    /**
     * (Re-)registers this plot's draw function with the canvas context and requests a redraw.
     * Replaces the old version, which directly mutated SVG `<path>`/`<circle>` elements bound via
     * d3's enter/update/exit join. Canvas has no persistent elements to join against, so the draw
     * function just redraws every band/line/marker from current data/scale state each time it's
     * invoked.
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

                const newBands: Array<BandHitRegion<M>> = []
                const newOutlierGeometry = new Map<string, SeriesGeometry>()
                const newOutlierDatums = new Map<string, Array<OutlierDatumColor<M>>>()

                seriesRef.current.forEach(series => {
                    const [xAxis, yAxis] = axesFor(
                        series.name,
                        axisAssignments,
                        id => xAxesState.axisFor(id).getOrUndefined(),
                        id => yAxesState.axisFor(id).getOrUndefined()
                    )
                    if (xAxis === undefined || yAxis === undefined) return

                    const style = seriesStyles.get(series.name) ?? defaultLineStyle()
                    const plotData = series.name.match(seriesFilter) ? series.data : FastShiftArray.empty<OutlierDatum<M>>()
                    const numBands = plotData.length > 0 ? plotData[0].bounds.length : 0

                    // render the widest (highest-index) band first so the narrower, more-confident
                    // bands stack on top with darker opacity
                    for (let bandIndex = numBands - 1; bandIndex >= 0; bandIndex--) {
                        const opacity = Math.min(1, bandOpacity + (numBands - 1 - bandIndex) * bandOpacityStep)
                        const areaGen = d3.area<OutlierDatum<M>>()
                            .x(d => xAxis.scale(d.datum.x) || 0)
                            .y0(d => yAxis.scale(d.bounds[bandIndex].lower) || 0)
                            .y1(d => yAxis.scale(d.bounds[bandIndex].upper) || 0)
                            .curve(interpolation)
                        const upperMeasure = series.measures[bandIndex]
                        const lowerMeasure = bandIndex > 0 ? series.measures[bandIndex - 1] : undefined

                        const path = new Path2D(areaGen(Array.from(plotData)) ?? "")
                        context2D.fillStyle = style.color
                        context2D.globalAlpha = opacity
                        context2D.fill(path)
                        context2D.globalAlpha = 1

                        // pushed in draw order (widest first, narrowest/topmost last); hit-testing
                        // iterates this backwards so the topmost band wins, matching visual stacking
                        newBands.push({path, seriesName: series.name, bandIndex, upperMeasure, lowerMeasure, plotData})
                    }

                    // central line for the series y-value
                    const isHovered = hoveredSeriesName === series.name
                    const stroke = isHovered ? style.highlightColor : style.color
                    const strokeWidth = isHovered ? style.highlightWidth : style.lineWidth
                    const lineGen = d3.line<OutlierDatum<M>>()
                        .x(d => xAxis.scale(d.datum.x) || 0)
                        .y(d => yAxis.scale(d.datum.y) || 0)
                        .curve(interpolation)

                    context2D.strokeStyle = stroke
                    context2D.lineWidth = strokeWidth
                    context2D.stroke(new Path2D(lineGen(Array.from(plotData)) ?? ""))

                    // for the markers, we split the data into two categories: regular and outlier
                    const {regular, outlier} = categorizePoints(plotData, outlierMarkerColors)

                    // point markers (one circle per datum) -- decorative only, no hover/tooltip
                    if (markerRadius != null && markerRadius >= 0 && !running) {
                        context2D.fillStyle = stroke
                        regular.forEach(d => {
                            const x = xAxis.scale(d.datum.x) || 0
                            const y = yAxis.scale(d.datum.y) || 0
                            context2D.beginPath()
                            context2D.arc(x, y, markerRadius, 0, 2 * Math.PI)
                            context2D.fill()
                        })
                    }

                    // outlier markers -- these DO get hover/tooltip, so we record their screen
                    // positions (and the underlying datum, for the tooltip) for hit-testing
                    const outlierPoints: Array<[number, number]> = []
                    outlier.forEach(o => {
                        const x = xAxis.scale(o.datum.datum.x) || 0
                        const y = yAxis.scale(o.datum.datum.y) || 0
                        context2D.fillStyle = o.color
                        context2D.beginPath()
                        context2D.arc(x, y, 4, 0, 2 * Math.PI)
                        context2D.fill()
                        outlierPoints.push([x + margin.left, y + margin.top])
                    })
                    newOutlierGeometry.set(`${series.name}::outlier`, {
                        points: outlierPoints,
                        hitRadius: 6
                    })
                    newOutlierDatums.set(series.name, outlier)
                })

                bandsRef.current = newBands
                outlierGeometryRef.current = newOutlierGeometry
                outlierDatumsRef.current = newOutlierDatums

                context2D.restore()
            }

            /**
             * Grows the auto-scaling y-axes (see `ContinuousAxis`'s `autoScale` prop) to fit the
             * data that's on screen: for each shown series (those matching the filter), the values
             * and the bands' lower and upper bounds of its points within the x-axis' current
             * window, along with where their lines cross the window's edges (see `visibleExtent`).
             * Since an axis only ever grows, only the visible data needs checking each frame.
             * Registered to run before the axes draw (they're at z-index 0), so the axes and the
             * series are drawn with the grown domain in the same frame.
             */
            const autoScaleYAxes = (): void => {
                const extents = new Map<string, [min: number, max: number]>()
                seriesRef.current.forEach(series => {
                    if (!series.name.match(seriesFilter)) return
                    const [xAxis, yAxis] = axesFor(
                        series.name,
                        axisAssignments,
                        id => xAxesState.axisFor(id).getOrUndefined(),
                        id => yAxesState.axisFor(id).getOrUndefined()
                    )
                    if (xAxis === undefined || yAxis?.autoScale === undefined) return

                    const [start, end] = xAxis.scale.domain()
                    // (the series' line and its bands' edges are always drawn as lines)
                    const seriesExtent = visibleExtent(
                        series.data, [start, end], yAxis.scale, true,
                        point => point.datum.x,
                        point => [point.datum.y, ...point.bounds.flatMap(({lower, upper}) => [lower, upper])]
                    )
                    if (seriesExtent === undefined) return
                    const extent = extents.get(yAxis.axisId)
                    extents.set(
                        yAxis.axisId,
                        extent === undefined ? seriesExtent : extentWith(extentWith(extent, seriesExtent[0]), seriesExtent[1])
                    )
                })
                growAutoScaledYAxes(extents, {yAxes: yAxesState.axes, axisRangeFor, updateAxisRanges})
            }

            cc.register(`outlier-plot-autoscale-${chartId}`, autoScaleYAxes, -10)
            cc.register(`outlier-plot-${chartId}`, draw, 10)
            cc.requestRedraw()
        },
        [
            chartId, plotDimensions, margin,
            axisAssignments,
            xAxesState, yAxesState,
            seriesStyles, seriesFilter, interpolation,
            bandOpacity, bandOpacityStep, markerRadius, outlierMarkerColors, hoveredSeriesName,
            running,
            axisRangeFor, updateAxisRanges
        ]
    )

    // new data, new scale: restarts the auto-scaling y-axes when the data source is replaced
    useAutoScaleRestart(dataSource, {yAxes: yAxesState.axes, axisRangeFor, updateAxisRanges})

    const updatePlotRef = useRef<(cc: CanvasContext) => void>(updatePlot)
    useEffect(() => {
        updatePlotRef.current = updatePlot
    }, [updatePlot])

    const onUpdateTimeRef = useRef(updateAxisRanges)
    useEffect(() => {
        onUpdateTimeRef.current = updateAxisRanges
    }, [updateAxisRanges])

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
    useEffect(() => {
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
    }, [onUpdateAxesInterval])

    // don't leave a scheduled notification pointing at an unmounted plot
    useEffect(() => () => {
        if (notifyFrameRef.current !== 0) {
            cancelAnimationFrame(notifyFrameRef.current)
            notifyFrameRef.current = 0
        }
    }, [])

    useEffect(
        () => {
            // clear to empty, not to a 0 for each axis -- see ScatterPlot's identical reset for why:
            // 0 is a legitimate (non-nullish) map value, so `zoomPivotFor`'s `?? axis.scale.domain()[1]`
            // fallback wouldn't kick in, and the next zoom would pivot on 0 until the first tick lands.
            currentTimeRef.current = new Map()
        },
        [xAxesState]
    )

    const axesForSeries = useMemo(
        (): Array<string> => axesForSeriesGen<OutlierDatum<M>, ContinuousNumericAxis>(
            initialData, axisAssignments, xAxesState
        ),
        [initialData, axisAssignments, xAxesState]
    )

    const updateTimingAndPlot = useCallback((ranges: Map<string, ContinuousAxisRange>): void => {
        if (canvasContext !== null) {
            onUpdateTimeRef.current(ranges)
            // keep the single canonical ranges ref in sync, so the pan/zoom handlers (now set up
            // once, in a separate effect, rather than inside updatePlot itself) always read the
            // current ranges without updatePlot needing to be recreated whenever ranges change
            timeRangesRef.current = ranges
            updatePlotRef.current(canvasContext)
            // the notification is deferred to the next animation frame (see `notifyIntervalsRef`),
            // so that this doesn't update the application state synchronously from within the
            // subscription's update
            notifyIntervalsRef.current(ranges)
        }
    }, [canvasContext])

    // when the initial data changes, then reset the plot. note that the initial data doesn't change
    // during the normal course of updates from the data source, only when the data source is replaced. the
    // reset itself should always use the current xAxesState/axisAssignments/updateTimingAndPlot, not
    // whatever they were when this effect last ran -- that's exactly what an effect event gives us,
    // without having to (falsely) declare them as dependencies that would re-trigger the reset.
    const resetPlotForInitialData = useEffectEvent(() => {
        seriesRef.current = dataSource?.series ?? new Map(initialData.map(series => [series.name, series as OutlierSeries<M>]))
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

        updateTimingAndPlot(
            new Map(
                Array.from(freshRanges.entries())
                    .map(([id, range]) => {
                        const [start, end] = range.original.asTuple()
                        const minTime = (initialData as Array<OutlierSeries<M>>)
                            .filter(srs => axisAssignments.get(srs.name)?.xAxis === id)
                            .reduce(
                                (tMin, series) =>
                                    Math.min(tMin, !series.isEmpty() ? series.data[0].datum.x : tMin),
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
     * Adjusts the time-range when the plot is dragged to the left or right (the caller redraws the plot)
     * @param x The amount that the plot is dragged
     * @param dim The dimensions of the plot
     * @param ranges A map holding the axis ID and its associated time range
     */
    const onPan = useCallback(
        (x: number, dim: Dimensions, ranges: Map<string, ContinuousAxisRange>) =>
            panHandler(axesForSeries, margin, setAxisIntervalFor, xAxesState)(x, dim, ranges),
        [axesForSeries, margin, setAxisIntervalFor, xAxesState]
    )

    /**
     * Called when the user uses the scroll wheel (or scroll gesture) to zoom in or out.
     * @param zoomFactor The *incremental* zoom scale factor for this event (see ScatterPlot's
     * `lastZoomKRef` for how d3-zoom's cumulative `k` is converted to it)
     * @param pivotDomainValueFor Given an axis ID and its axis, returns the domain value to pivot
     * that axis's zoom around
     * @param dim The dimensions of the plot
     * @param ranges A map holding the axis ID and its associated time-range
     */
    const onZoom = useCallback(
        (zoomFactor: number, pivotDomainValueFor: (axisId: string, axis: ContinuousNumericAxis) => number, dim: Dimensions, ranges: Map<string, ContinuousAxisRange>) =>
            continuousAxisZoomHandler(axesForSeries, margin, setAxisIntervalFor, xAxesState)(zoomFactor, pivotDomainValueFor, dim, ranges),
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
                    .on("start", () => canvasSelection.style("cursor", "move"))
                    .on("drag", event => {
                        onPan(event.dx, plotDimensions, timeRangesRef.current)
                        updatePlotRef.current(cc)
                        notifyIntervalsRef.current(timeRangesRef.current)
                    })
                    .on("end", () => canvasSelection.style("cursor", "auto"))
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
                    .on("zoom", event => {
                        // a `null` sourceEvent means this "zoom" wasn't a real user gesture but a
                        // programmatic `.transform(...)` call (see `resetZoom` below) -- there's no
                        // real mouse position to anchor against, and no business logic to run here
                        if (event.sourceEvent === null) return

                        // convert d3-zoom's cumulative `k` to the incremental factor this event
                        // represents -- see `lastZoomKRef`'s declaration above
                        const zoomFactor = event.transform.k / lastZoomKRef.current
                        lastZoomKRef.current = event.transform.k

                        onZoom(
                            zoomFactor,
                            zoomPivotFor(event.sourceEvent.offsetX),
                            plotDimensions,
                            timeRangesRef.current,
                        )
                        updatePlotRef.current(cc)
                        notifyIntervalsRef.current(timeRangesRef.current)
                    })
                canvasSelection.call(zoom)

                // hands the caller a way to clear d3-zoom's own accumulated scale/pan state back
                // to identity -- see ScatterPlot's identical `onZoomReset` usage for the base
                // rationale. Also explicitly restores each axis's scale to its true original
                // bounds (see `initialAxisIntervalsRef` above): the axis object has no "original"
                // concept of its own once a zoom has directly mutated `scale.domain()`, so nothing
                // else would otherwise put a statically-domained axis (like this one) back to its
                // starting view on reset.
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
        [canvasContext, panEnabled, zoomEnabled, onPan, onZoom, plotDimensions, margin, zoomKeyModifiersRequired, zoomPivotFor, onZoomReset, xAxesState, updateTimingAndPlot]
    )

    // the single source of truth for the axes' ranges. the zoom and pan handlers, the subscription,
    // and the effect below all read and update this same map (in place), so that each range's
    // original (un-zoomed) interval survives the window scrolling as data streams in
    const timeRangesRef = useRef<Map<string, ContinuousAxisRange>>(new Map())

    useEffect(() => {
        if (canvasContext) {
            if (timeRangesRef.current.size === 0) {
                // populate the map in place -- replacing it would orphan the copy already held by
                // the subscription and by the zoom and pan handlers
                continuousAxisRanges(xAxesState.axes as Map<string, ContinuousNumericAxis>)
                    .forEach((range, id) => timeRangesRef.current.set(id, range))
            } else {
                const intervals = continuousAxisIntervals(xAxesState.axes)
                timeRangesRef.current.forEach((range, id, m) => {
                    const [start, end] = Optional.ofNullable(intervals.get(id))
                        .map(interval => interval.asTuple())
                        .getOrThrow(() => new Error(`Unable to retrieve interval for axis; axis_id: ${id}`))
                    if (!isNaN(start) && !isNaN(end)) {
                        m.set(id, range.update(start, end))
                    }
                })
            }
            updatePlot(canvasContext)
        }
    }, [chartId, canvasContext, plotDimensions, updatePlot, xAxesState])

    // wires up a single mousemove/mouseleave listener on the shared canvas to replace the old
    // per-element SVG mouseover/mouseleave handlers on the band paths and outlier-marker circles.
    // Bands are hit-tested via `ctx.isPointInPath` against their captured fill path (checked
    // topmost/narrowest-first, matching visual stacking); outlier markers use the shared
    // point-hit-testing in `hitTesting.ts`. Outlier markers are checked first since they're drawn
    // on top of the bands.
    useEffect(
        () => {
            if (!canvasContext) return

            const canvas = canvasContext.canvas
            const {context2D, dpr} = canvasContext

            const handleMove = (event: MouseEvent) => {
                const [x, y] = canvasLocalPoint(event, canvas)

                // check outlier markers first (drawn on top of the bands)
                const outlierHit = seriesAt(x, y, outlierGeometryRef.current)
                // The band's `Path2D` is built from raw (pre-margin) local coordinates -- the same
                // space `x - margin.left, y - margin.top` (the "local" point) is in -- but
                // `ctx.isPointInPath` only reported correct hits once that local point was ALSO
                // scaled by `dpr`. (An earlier version of this instead dropped the margin
                // subtraction and scaled the raw canvas-relative point by `dpr` -- that's wrong:
                // verified against the actual rendered band, rigorously, by isolating a single
                // band layer's on-screen pixels via `getImageData` and testing candidate query
                // points against the real `Path2D` object captured from a live hover. Dropping the
                // margin subtraction was close enough to pass a single, less careful spot-check,
                // but consistently mislocated the hit region by `margin.left`/`margin.top`, which
                // is what produced "hover ~margin-worth of pixels to the side of the band" in
                // practice.) The exact reason `dpr` needs to be reapplied here, on top of a
                // transform that already includes it, isn't fully pinned down -- this is the
                // empirically-verified formula, not a re-derivation from the Canvas 2D spec.
                const localX = (x - margin.left) * dpr
                const localY = (y - margin.top) * dpr
                const current = outlierHit !== undefined ?
                    {kind: 'outlier' as const, seriesName: outlierHit.name.replace(/::outlier$/, ''), index: outlierHit.index} :
                    findHoveredBand(bandsRef.current, context2D, localX, localY)

                const previous = lastHoveredRef.current
                const sameAsBefore = previous !== undefined && current !== undefined &&
                    previous.kind === current.kind && previous.seriesName === current.seriesName &&
                    ((previous.kind === 'band' && current.kind === 'band' && previous.bandIndex === current.bandIndex) ||
                        (previous.kind === 'outlier' && current.kind === 'outlier' && previous.index === current.index))

                if (sameAsBefore) return

                if (previous !== undefined) {
                    mouseLeaveHandlerFor(`tooltip-${chartId}`)?.(previous.seriesName)
                }

                if (current !== undefined) {
                    if (current.kind === 'band') {
                        const band = bandsRef.current.find(b => b.seriesName === current.seriesName && b.bandIndex === current.bandIndex)
                        if (band !== undefined && band.upperMeasure != null) {
                            const pointsInBand = calcPointsInBand(band.plotData, band.bandIndex)
                            mouseOverHandlerFor(`tooltip-${chartId}`)?.(
                                current.seriesName,
                                current.bandIndex,
                                {
                                    series: band.plotData,
                                    metadata: {
                                        upperMeasure: band.upperMeasure,
                                        lowerMeasure: band.lowerMeasure,
                                        bandIndex: current.bandIndex,
                                        pointsInBand,
                                    }
                                },
                                [x, y]
                            )
                        }
                    } else {
                        const series = seriesRef.current.get(current.seriesName)
                        const outlierDatum = outlierDatumsRef.current.get(current.seriesName)?.[current.index]
                        if (series !== undefined && outlierDatum !== undefined) {
                            const plotData = series.name.match(seriesFilter) ? series.data : FastShiftArray.empty<OutlierDatum<M>>()
                            const datum = outlierDatum.datum
                            const bandIndex = largestExceededBoundIndex(datum) + 1
                            const upperMeasure = bandIndex < series.measures.length ? series.measures[bandIndex] : undefined
                            const lowerMeasure = bandIndex > 0 ? series.measures[bandIndex - 1] : undefined
                            const pointsInBand = calcPointsInBand(plotData, bandIndex)
                            mouseOverHandlerFor(`tooltip-${chartId}`)?.(
                                current.seriesName,
                                datum.datum.x,
                                {
                                    series: series.data,
                                    metadata: {datum, upperMeasure, lowerMeasure, bandIndex, pointsInBand}
                                },
                                [x, y]
                            )
                        }
                    }
                }

                lastHoveredRef.current = current
            }

            const handleLeaveCanvas = () => {
                const previous = lastHoveredRef.current
                if (previous !== undefined) {
                    mouseLeaveHandlerFor(`tooltip-${chartId}`)?.(previous.seriesName)
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
        [canvasContext, chartId, margin, seriesFilter, mouseOverHandlerFor, mouseLeaveHandlerFor]
    )

    // the latest `updateTimingAndPlot`, for the view driver to call -- the driver is created once
    // per run (see below), so it must not capture a stale one (e.g. bound to an older canvas)
    const updateTimingAndPlotRef = useRef(updateTimingAndPlot)
    useEffect(() => {
        updateTimingAndPlotRef.current = updateTimingAndPlot
    }, [updateTimingAndPlot])

    // creates the view driver that keeps this plot's view in step with the data source, using the
    // current settings -- see ScatterPlot's identical effect event
    const createViewDriver = useEffectEvent(
        (source: NonNullable<typeof dataSource>) => {
            const redraw = (ranges: Map<string, ContinuousAxisRange>) => updateTimingAndPlotRef.current(ranges)
            const setCurrentTime = (axisId: string, end: number) => currentTimeRef.current.set(axisId, end)
            return timeAxisViewDriverFor(
                source, xAxesState, outlierAxisTimes<M>(axisAssignments, xAxesState), redraw, setCurrentTime,
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
    // view from the data source's updates -- see ScatterPlot's identical effect. The driver
    // belongs to this plot instance alone and is always torn down with it.
    const hasXAxes = xAxesState.axes.size > 0
    useEffect(() => {
        if (dataSource === undefined || !running || canvasContext === null || !hasXAxes) return
        const driver = createViewDriver(dataSource)
        return () => driver.unsubscribe()
    }, [dataSource, running, canvasContext, hasXAxes])

    // this plot needs a data source (see the `Chart`'s `dataSource` prop)
    useEffect(() => {
        if (dataSource === undefined) {
            console.error("OutlierPlot requires a data source; set the enclosing Chart's `dataSource` prop")
        }
    }, [dataSource])

    // unregister this plot's draw function on unmount
    useEffect(
        () => {
            return () => {
                if (canvasContext) {
                    canvasContext.unregister(`outlier-plot-autoscale-${chartId}`)
                    canvasContext.unregister(`outlier-plot-${chartId}`)
                }
            }
        },
        [canvasContext, chartId]
    )

    return null
}

/**
 * Finds the topmost (narrowest, most-confident) band whose fill path contains `(localX, localY)`.
 * `bands` is in draw order (widest first, narrowest/topmost last), so this iterates backwards to
 * check the topmost band first, matching visual stacking.
 * @param bands The bands' fill regions, as last drawn, in draw order
 * @param context The canvas 2D context (for `isPointInPath`)
 * @param localX The mouse's x-coordinate, in the coordinates `isPointInPath` tests against (see
 * the caller for why that's the plot-area position scaled by the device-pixel ratio)
 * @param localY The mouse's y-coordinate, in the same coordinates
 * @return The hovered band's series and index, or `undefined` when the mouse isn't over a band
 */
function findHoveredBand<M extends readonly number[]>(
    bands: Array<BandHitRegion<M>>,
    context: CanvasRenderingContext2D,
    localX: number,
    localY: number
): {kind: 'band', seriesName: string, bandIndex: number} | undefined {
    for (let i = bands.length - 1; i >= 0; i--) {
        const band = bands[i]
        if (context.isPointInPath(band.path, localX, localY)) {
            return {kind: 'band', seriesName: band.seriesName, bandIndex: band.bandIndex}
        }
    }
    return undefined
}

/**
 * Returns the index of the largest bound the datum's y-value is outside of, or -1 if the value
 * is inside every bound. Bounds are expected to be ordered from tightest (index 0) to widest
 * (highest index), so the highest-index match identifies the most severe outlier tier.
 * @param datum The datum
 * @return The index of the largest bound the datum is outside of, or -1
 */
function largestExceededBoundIndex<M extends readonly number[]>(datum: OutlierDatum<M>): number {
    for (let i = datum.bounds.length - 1; i >= 0; i--) {
        const {lower, upper} = datum.bounds[i]
        if (datum.datum.y < lower || datum.datum.y > upper) return i
    }

    return -1
}

/**
 * Attempts to locate the x- and y-axes for the specified series. If the series has no axis
 * assignment, then uses the default (first) x- and y-axes.
 * @param seriesName Name of the series for which to retrieve the axis
 * @param axisAssignments A map holding the series name and the associated x- and y-axes assigned
 * to that series
 * @param xAxisFor The function that accepts an axis ID and returns the corresponding x-axis
 * @param yAxisFor The function that accepts an axis ID and returns the corresponding y-axis
 * @return The x- and y-axes (`undefined` when not found)
 * @throws Error when either axis isn't a continuous numeric axis
 */
function axesFor(
    seriesName: string,
    axisAssignments: Map<string, AxesAssignment>,
    xAxisFor: (id: string) => BaseAxis | undefined,
    yAxisFor: (id: string) => BaseAxis | undefined,
): [xAxis: ContinuousNumericAxis | undefined, yAxis: ContinuousNumericAxis | undefined] {
    const assigned = axisAssignments.get(seriesName)
    const xAxisRaw = xAxisFor(assigned?.xAxis || "")
    const yAxisRaw = yAxisFor(assigned?.yAxis || "")
    if (xAxisRaw && xAxisRaw.axisType !== AxisType.ContinuousNumeric) {
        throw Error("Outlier plot requires that x-axis be of type ContinuousNumericAxis")
    }
    if (yAxisRaw && yAxisRaw.axisType !== AxisType.ContinuousNumeric) {
        throw Error("Outlier plot requires that y-axis be of type ContinuousNumericAxis")
    }
    const xAxis = xAxisRaw as ContinuousNumericAxis | undefined
    const yAxis = yAxisRaw as ContinuousNumericAxis | undefined
    return [xAxis, yAxis]
}

/**
 * Calculate the number of points within a specific outlier band.
 * @param plotData The array of outlier data points.
 * @param bandIndex The index of the outlier band to calculate points for.
 * @param [subtractLowerBandCount=true] Whether to subtract the count of points in the lower band. Defaults to true.
 * @returns The number of points within the specified outlier band.
 */
function calcPointsInBand<M extends readonly number[]>(
    plotData: Array<OutlierDatum<M>> | FastShiftArray<OutlierDatum<M>>,
    bandIndex: number,
    subtractLowerBandCount: boolean = true
): number {
    // function to count the points in a specific outlier band
    const countPointsInBand = (bandIndex: number) =>
        plotData
            .filter(datum => {
                    if (bandIndex < datum.bounds.length) {
                        return datum.datum.y >= datum.bounds[bandIndex].lower && datum.datum.y <= datum.bounds[bandIndex].upper
                    }
                    return true
                }
            ).length

    const pointsInBand = countPointsInBand(bandIndex)
    // we need to subtract the points in the lower band. recall that each band has ALL the points
    // in the band's range, not what we may think of visually
    if (bandIndex > 0 && subtractLowerBandCount) {
        return pointsInBand - countPointsInBand(bandIndex - 1)
    }
    return pointsInBand
}

type CategorizedData<M extends readonly number[]> = {
    regular: Array<OutlierDatum<M>>,
    outlier: Array<OutlierDatumColor<M>>
}

/**
 * Categorizes outlier data into regular and outlier points based on provided marker colors.
 * @param data Array of outlier data to categorize
 * @param outlierMarkerColors Array of colors to use for outlier markers
 * @returns Object with regular and outlier data arrays
 * @template M Type of the measure
 */
function categorizePoints<M extends readonly number[]>(
    data: FastShiftArray<OutlierDatum<M>>,
    outlierMarkerColors: ReadonlyArray<string> = []
): CategorizedData<M> {
    return data.reduce<CategorizedData<M>>(
        (accum, datum) => {
            const bandIndex = largestExceededBoundIndex(datum)
            if (bandIndex < 0) {
                accum.regular.push(datum)
            } else {
                accum.outlier.push({datum, color: outlierMarkerColors[bandIndex] ?? "red"})
            }
            return accum
        },
        {regular: [], outlier: []} as CategorizedData<M>
    )
}
