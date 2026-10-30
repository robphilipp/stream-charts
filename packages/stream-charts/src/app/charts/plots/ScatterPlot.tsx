import {useCallback, useEffect, useRef} from 'react'
import {useStreamingTimeAxes} from "./useStreamingTimeAxes";
import {useHoveredSeries} from "../hooks/useHoveredSeries";
import {useChart} from "../hooks/useChart";
import {
    type ScatterTooltipMetadata,
    type ScatterTooltipPoints,
    scatterTooltipPointList,
    scatterTooltipPoints
} from "../tooltips/tooltipUtils";
import * as d3 from "d3";
import {type AxesAssignment, clipToArea} from "./plot";
import type {Datum, TimeSeries} from "../series/timeSeries";
import {
    type BaseAxis,
    AxisType,
    checkAxisType,
    type ContinuousNumericAxis,
    defaultLineStyle,
    type SeriesLineStyle
} from "../axes/axes";
import type {CanvasContext} from "../d3types";
import {seriesAt, canvasLocalPoint, type SeriesGeometry} from "./hitTesting";
import {firstIndexAtOrAfter, noop} from "../utils";
import {NoCurveFactory} from "./constants";
import {timeSeriesAxisTimes, TimeWindowBehavior} from "../subscriptions/viewDrivers";
import {useDataSource, useDataSourceRunning, useInitialData} from "../hooks/useDataSource";
import type {TimeSeriesChartData} from "../series/timeSeriesChartData";
import {ContinuousAxisRange} from "../axes/ContinuousAxisRange";
import {extentWith, visibleExtent} from "../axes/autoScale";
import {growAutoScaledYAxes, useAutoScaleRestart} from "./autoScaleYAxes";
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
        updateAxisRanges = noop,
        axisRangeFor,
    } = axes

    const {mouseOverHandlerFor, mouseLeaveHandlerFor} = mouse

    const {plotDimensions, margin} = usePlotDimensions()

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
            chartId, plotDimensions, axisAssignments, xAxesState, yAxesState, seriesStyles, seriesFilter,
            interpolation, hoveredSeriesName, markerRadius, running, hideMarkersWhileRunning, axisRangeFor,
            updateAxisRanges, color, backgroundColor, margin.left, margin.top
        ]
    )

    // the time axes: their ranges, the view driver, panning and zooming, highlighting, and
    // reporting the axes' intervals -- see `useStreamingTimeAxes`
    useStreamingTimeAxes<TimeSeriesChartData, Datum>({
        canvasContext,
        dataSource,
        running,
        initialData,
        timeOf: datum => datum.x,
        axisTimesFor: timeSeriesAxisTimes(axisAssignments, xAxesState),
        axisAssignments,
        updatePlot,
        onDataReset: () => {
            dataRef.current = initialData.slice() as Array<TimeSeries>
            seriesRef.current = new Map(initialData.map(series => [series.name, series as TimeSeries]))
        },
        allowTooltipRef: allowTooltip,
        panEnabled,
        zoomEnabled,
        zoomKeyModifiersRequired,
        onZoomReset,
        withCadenceOf,
        timeWindowBehavior,
        highlightAxesOnMouseOver,
    })

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
    checkAxisType("ScatterPlot", "x", xAxis, AxisType.ContinuousNumeric)
    checkAxisType("ScatterPlot", "y", yAxis, AxisType.ContinuousNumeric)
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
