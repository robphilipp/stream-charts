import {useCallback, useEffect, useRef} from 'react'
import {useStreamingTimeAxes} from "./useStreamingTimeAxes";
import {useHoveredSeries} from "../hooks/useHoveredSeries";
import * as d3 from "d3"

import {useChart} from "../hooks/useChart"
import {useDataSource, useDataSourceRunning, useInitialData} from "../hooks/useDataSource";
import {usePlotDimensions} from "../hooks/usePlotDimensions"
import {type AxesAssignment, clipToArea} from "./plot"
import type {CanvasContext} from "../d3types"
import {seriesAt, canvasLocalPoint, type SeriesGeometry} from "./hitTesting"
import {noop} from "../utils"
import {ContinuousAxisRange} from "../axes/ContinuousAxisRange"
import {extentWith, visibleExtent} from "../axes/autoScale"
import {growAutoScaledYAxes, useAutoScaleRestart} from "./autoScaleYAxes"
import {
    type BaseAxis,
    AxisType,
    checkAxisType,
    type ContinuousNumericAxis,
    defaultLineStyle,
    type SeriesLineStyle
} from "../axes/axes"
import {outlierAxisTimes, TimeWindowBehavior} from "../subscriptions/viewDrivers";
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
        updateAxisRanges = noop,
        axisRangeFor,
    } = axes

    const {plotDimensions, margin} = usePlotDimensions()

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


    // seriesRef is the single source of truth for what to render: the data source's own (live)
    // series map, which grows as series first appear in the stream. the draw function iterates this
    // directly (rather than a parallel dataRef array) so dynamically-arriving series get rendered.
    const seriesRef = useRef<ReadonlyMap<string, OutlierSeries<M>>>(
        dataSource?.series ?? new Map(initialData.map(series => [series.name, series as OutlierSeries<M>]))
    )

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
            chartId, plotDimensions, axisAssignments, xAxesState, yAxesState, seriesStyles, seriesFilter,
            interpolation, bandOpacity, markerRadius, outlierMarkerColors, hoveredSeriesName, running,
            axisRangeFor, updateAxisRanges, margin.left, margin.top
        ]
    )

    // new data, new scale: restarts the auto-scaling y-axes when the data source is replaced
    useAutoScaleRestart(dataSource, {yAxes: yAxesState.axes, axisRangeFor, updateAxisRanges})

    // the time axes: their ranges, the view driver, panning and zooming, highlighting, and
    // reporting the axes' intervals -- see `useStreamingTimeAxes`
    useStreamingTimeAxes<OutlierChartData<M>, OutlierDatum<M>>({
        canvasContext,
        dataSource,
        running,
        initialData,
        timeOf: datum => datum.datum.x,
        axisTimesFor: outlierAxisTimes<M>(axisAssignments, xAxesState),
        axisAssignments,
        updatePlot,
        onDataReset: () => {
            seriesRef.current = dataSource?.series ?? new Map(initialData.map(series => [series.name, series as OutlierSeries<M>]))
        },
        panEnabled,
        zoomEnabled,
        zoomKeyModifiersRequired,
        onZoomReset,
        withCadenceOf,
        timeWindowBehavior,
        highlightAxesOnMouseOver,
    })

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
    checkAxisType("OutlierPlot", "x", xAxisRaw, AxisType.ContinuousNumeric)
    checkAxisType("OutlierPlot", "y", yAxisRaw, AxisType.ContinuousNumeric)
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
