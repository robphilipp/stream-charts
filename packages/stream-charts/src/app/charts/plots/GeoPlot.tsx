import {useCallback, useEffect, useEffectEvent, useMemo, useRef} from 'react'
import * as d3 from "d3"
import {useChart} from "../hooks/useChart"
import {useCanvasZoomPan} from "./useCanvasZoomPan"
import {clipToArea} from "./plot"
import {type BaseAxis, defaultLineStyle, type SeriesLineStyle} from "../axes/axes"
import type {BaseAxisRange} from "../axes/BaseAxisRange"
import type {CanvasContext} from "../d3types"
import {canvasLocalPoint} from "./hitTesting"
import {noop} from "../utils"
import {withAlpha} from "../styling/canvasStyle"
import {geoViewDriverFor} from "../subscriptions/viewDrivers"
import {useDataSource, useDataSourceRunning, useStreamingSettings} from "../hooks/useDataSource"
import type {GeoChartData} from "../observables/geo"
import type {GeoDatum, GeoSeries} from "../series/geoSeries"
import {usePlotDimensions} from "../hooks/usePlotDimensions"
import {type TooltipData, useTooltip} from "../hooks/useTooltip"
import {
    type GeoPlotViewState,
    type GeoProjectionName,
    GeoProjections,
    type GeoTooltipMetadata,
    isGlobe,
    panView,
    setUpProjection,
    viewCenteredOn,
    zoomViewAbout,
} from "./geoProjections"

/**
 * The properties of the {@link GeoPlot}
 * @template P The type of the events' payload
 */
export interface Props<P> {
    /**
     * The map projection: the name of one of the {@link GeoProjections} (defaults to
     * `orthographic`, a globe), or a d3 projection. The plot sets a projection's scale, translation,
     * and rotation itself (to fit the plot, and as the user drags and zooms).
     */
    projection?: GeoProjectionName | d3.GeoProjection
    /**
     * The `[longitude, latitude]` (degrees) at the center of the view when the plot first shows,
     * and after its view is reset. Defaults to `[0, 20]`. Changing it re-centers the view.
     */
    center?: [longitude: number, latitude: number]
    /**
     * The land (or any other areas) to draw under the events, as GeoJSON (e.g. the `land` features
     * of a world atlas). The plot doesn't come with a map, so that the application chooses its
     * level of detail. Drawn filled, in `landColor`.
     */
    basemap?: d3.GeoPermissibleObjects
    /**
     * The borders (or any other lines) to draw over the basemap, as GeoJSON (e.g. a mesh of a world
     * atlas' country borders). Drawn as lines, in `borderColor`.
     */
    borders?: d3.GeoPermissibleObjects
    /**
     * Whether to draw the graticule (the lines of latitude and longitude, every 10°). Defaults to `true`.
     */
    showGraticule?: boolean
    /**
     * The fill of the sphere (the oceans). Defaults to a faint tint of the chart's color.
     */
    oceanColor?: string
    /**
     * The fill of the basemap. Defaults to a light tint of the chart's color.
     */
    landColor?: string
    /**
     * The color of the borders. Defaults to a tint of the chart's color.
     */
    borderColor?: string
    /**
     * The color of the graticule. Defaults to a faint tint of the chart's color.
     */
    graticuleColor?: string
    /**
     * The color of the sphere's outline. Defaults to a tint of the chart's color.
     */
    outlineColor?: string
    /**
     * The radius (px) of each event's marker. Defaults to 3.
     */
    markerRadius?: number
    /**
     * The opacity of the markers (0 to 1). Defaults to 0.85.
     */
    markerOpacity?: number
    /**
     * The radius (px) of an event's marker, e.g. from a payload field (overrides `markerRadius`)
     * @param datum The event
     * @param seriesName The name of the event's series
     * @return The marker's radius
     */
    radiusOf?: (datum: GeoDatum<P>, seriesName: string) => number
    /**
     * The color of an event's marker, e.g. from a payload field (overrides the series' color);
     * `undefined` means the series' color
     * @param datum The event
     * @param seriesName The name of the event's series
     * @return The marker's color
     */
    colorOf?: (datum: GeoDatum<P>, seriesName: string) => string | undefined
    /**
     * When set, events fade as they age: from `markerOpacity`, when they arrive, to
     * `markerOpacity * fadedOpacity` once they're this old (ms), so that the newest events stand
     * out. An event's age is measured from the data source's latest event (the stream's clock), so
     * nothing fades while the data source is paused. Defaults to no fading.
     */
    fadeDuration?: number
    /**
     * How faint (0 to 1, a fraction of `markerOpacity`) events become once they're `fadeDuration`
     * old. Defaults to 0.15. Only used with `fadeDuration`.
     */
    fadedOpacity?: number
    /**
     * Whether dragging moves the view: a globe (an azimuthal projection, like the default
     * `orthographic`) turns under the mouse; a flat map shifts east and west, and, zoomed in,
     * north and south. Defaults to `true`.
     */
    rotateEnabled?: boolean
    /**
     * Whether the mouse wheel zooms the view, about the mouse (the place under the mouse stays
     * under it). Defaults to `true`.
     */
    zoomEnabled?: boolean
    /**
     * When `true` (the default), zooming requires the shift or control key to be held down while
     * scrolling (so that scrolling the page over the chart doesn't zoom it)
     */
    zoomKeyModifiersRequired?: boolean
    /**
     * How far the view can be zoomed in (a factor of the fitted view's scale). Defaults to 20.
     */
    zoomMaxScaleFactor?: number
    /**
     * When set, the view turns westward (the earth spins eastward) at this many degrees per second,
     * pausing while the view is dragged and while an event is hovered. Defaults to no rotation.
     */
    autoRotate?: number
    /**
     * An (optional) view to restore when the plot mounts -- commonly the last view reported
     * through `onViewChange` and held by the application (e.g. in a store), so that the view
     * survives the plot being unmounted and remounted (e.g. navigating away and back). Only read
     * once, when the plot mounts.
     */
    viewState?: GeoPlotViewState
    /**
     * Called with the plot's view after it's dragged, zoomed, or reset, when the auto-rotation
     * pauses, and when the plot unmounts
     * @param view The view
     */
    onViewChange?: (view: GeoPlotViewState) => void
    /**
     * Called whenever this plot (re)creates its zoom behavior, handing the caller a `resetZoom`
     * function that resets the view (its rotation and zoom) -- e.g. for a "Clear" action. Only
     * meaningful (called) while `zoomEnabled` is `true`.
     */
    onZoomReset?: (resetZoom: () => void) => void
}

// a drawn event's marker, for hit-testing the mouse (in canvas coordinates)
type DrawnMarker<P> = {
    x: number
    y: number
    hitRadius: number
    seriesName: string
    datum: GeoDatum<P>
}

const DEFAULT_CENTER: [number, number] = [0, 20]
const DEGREES = 180 / Math.PI
// the number of distinct opacities the faded markers are drawn with (so that markers can still be
// drawn a path per color and opacity)
const FADE_LEVELS = 12

/**
 * Renders streaming sensor events on a map, or a globe, for the series held by the
 * {@link GeoDataSource} handed to the {@link Chart} (its `dataSource` prop): one marker per event,
 * at its latitude and longitude, in its series' color (or its own, see `colorOf`). Uses d3-geo's
 * projections (see {@link GeoProjections}) and draws onto the chart's canvas. Dragging moves the
 * view, the mouse wheel zooms it about the mouse, and the view can turn by itself (`autoRotate`).
 * The plot needs no axes.
 *
 * This component uses the {@link useChart} hook, and therefore must be a child of the {@link Chart}.
 * @param props The properties of the geo plot
 * @return `null` (the plot draws onto the chart's canvas)
 * @template P The type of the events' payload
 * @example
 * ```tsx
 * <Chart chartId={1} width={800} height={600} dataSource={dataSource} seriesStyles={styles}>
 *     <GeoPlot<Reading>
 *         projection="orthographic"
 *         basemap={land}
 *         borders={countryBorders}
 *         radiusOf={datum => 2 + datum.payload.magnitude}
 *         fadeDuration={30_000}
 *     />
 *     <Tooltip visible={true}>
 *         <GeoPlotTooltipContent<Reading> payloadFormatter={payload => `magnitude ${payload.magnitude}`}/>
 *     </Tooltip>
 * </Chart>
 * ```
 */
export function GeoPlot<P>(props: Props<P>): null {
    const {
        chartId,
        canvasContext,
        color,
        seriesStyles,
        seriesFilter,
        mouse,
    } = useChart<GeoDatum<P>, SeriesLineStyle, GeoTooltipMetadata<P>, BaseAxisRange, BaseAxis>()
    const {mouseOverHandlerFor, mouseLeaveHandlerFor} = mouse

    const {plotDimensions, margin} = usePlotDimensions()
    const {width, height} = plotDimensions
    const {windowingTime = 100, dataUpdatePeriod, onUpdateChartTime = noop} = useStreamingSettings()

    // the application-owned source of the events, and whether it's running (streaming)
    const dataSource = useDataSource<GeoChartData<P>, GeoDatum<P>, GeoSeries<P>>()
    const running = useDataSourceRunning(dataSource)

    const {visibilityState: tooltipVisible} = useTooltip()

    const {
        projection: projectionProp = 'orthographic',
        center = DEFAULT_CENTER,
        basemap,
        borders,
        showGraticule = true,
        oceanColor = withAlpha(color, 0.05),
        landColor = withAlpha(color, 0.2),
        borderColor = withAlpha(color, 0.4),
        graticuleColor = withAlpha(color, 0.15),
        outlineColor = withAlpha(color, 0.5),
        markerRadius = 3,
        markerOpacity = 0.85,
        radiusOf,
        colorOf,
        fadeDuration,
        fadedOpacity = 0.15,
        rotateEnabled = true,
        zoomEnabled = true,
        zoomKeyModifiersRequired = true,
        zoomMaxScaleFactor = 20,
        autoRotate,
        viewState,
        onViewChange = noop,
        onZoomReset = noop,
    } = props

    // the projection (a new one when the projection's name changes; one handed in is used as-is)
    const projection = useMemo<d3.GeoProjection>(
        () => typeof projectionProp === 'string' ?
            (GeoProjections[projectionProp] ?? d3.geoOrthographic)() :
            projectionProp,
        [projectionProp]
    )
    const graticule = useMemo(() => d3.geoGraticule10(), [])

    // the view (rotation, zoom, and a flat map's vertical shift), changed by dragging, zooming, and
    // the auto-rotation; starts as the view handed in (see `viewState`), or centered on `center`
    const [centerLongitude, centerLatitude] = center
    const initialView = useMemo(
        () => viewCenteredOn([centerLongitude, centerLatitude]),
        [centerLongitude, centerLatitude]
    )
    const viewRef = useRef<GeoPlotViewState>(viewState ?? initialView)

    // reports the view (see `onViewChange`)
    const onViewChangeRef = useRef(onViewChange)
    useEffect(
        () => {
            onViewChangeRef.current = onViewChange
        },
        [onViewChange]
    )
    const reportView = useCallback((): void => onViewChangeRef.current({...viewRef.current}), [])

    // the time of the latest event, reported to the chart's `onUpdateChartTime`
    const currentTimeRef = useRef<number>(0)

    // tooltips are only shown while the data source is paused (and not while dragging)
    const allowTooltipRef = useRef<boolean>(!(dataSource?.running ?? false))
    // whether the view is being dragged (which pauses the auto-rotation)
    const draggingRef = useRef<boolean>(false)

    // the last-drawn markers, for finding the one under the mouse, and the largest hit radius
    const markersRef = useRef<d3.Quadtree<DrawnMarker<P>>>(d3.quadtree<DrawnMarker<P>>())
    const maxHitRadiusRef = useRef<number>(0)
    // the event under the mouse
    const hoveredRef = useRef<{seriesName: string, datum: GeoDatum<P>} | undefined>(undefined)

    const updatePlot = useCallback(
        /**
         * (Re-)registers this plot's draw function with the canvas context and requests a redraw
         * @param cc The canvas context to register the draw function with
         */
        (cc: CanvasContext): void => {
            const draw = (context: CanvasContext): void => {
                const {context2D} = context
                setUpProjection(projection, viewRef.current, width, height)
                const path = d3.geoPath(projection, context2D)

                context2D.save()
                clipToArea(context, plotDimensions, {x: margin.left, y: margin.top})
                context2D.translate(margin.left, margin.top)

                // the sphere (the oceans), the graticule, the land, and the borders
                context2D.beginPath()
                path({type: 'Sphere'})
                context2D.fillStyle = oceanColor
                context2D.fill()

                if (showGraticule) {
                    context2D.beginPath()
                    path(graticule)
                    context2D.strokeStyle = graticuleColor
                    context2D.lineWidth = 0.5
                    context2D.stroke()
                }
                if (basemap !== undefined) {
                    context2D.beginPath()
                    path(basemap)
                    context2D.fillStyle = landColor
                    context2D.fill()
                }
                if (borders !== undefined) {
                    context2D.beginPath()
                    path(borders)
                    context2D.strokeStyle = borderColor
                    context2D.lineWidth = 0.5
                    context2D.stroke()
                }
                context2D.beginPath()
                path({type: 'Sphere'})
                context2D.strokeStyle = outlineColor
                context2D.lineWidth = 1
                context2D.stroke()

                // the events: a globe hides the far side, beyond its clip angle from the view's center
                const [lambda, phi] = projection.rotate()
                const viewCenter: [number, number] = [-lambda, -phi]
                const maxDistance = isGlobe(projection) ? (projection.clipAngle() ?? 0) / DEGREES : Infinity
                // an event's opacity, by its age (relative to the latest event), when fading
                const latestTime = dataSource?.latestTime() ?? 0
                const fades = fadeDuration !== undefined && fadeDuration > 0
                const fadeLevelOf = (datum: GeoDatum<P>): number => fades ?
                    Math.round(Math.min(1, Math.max(0, (latestTime - datum.time) / fadeDuration)) * (FADE_LEVELS - 1)) :
                    0
                const opacityOf = (level: number): number =>
                    markerOpacity * (1 - (1 - fadedOpacity) * level / (FADE_LEVELS - 1))

                const markers: Array<DrawnMarker<P>> = []
                let hoveredMarker: DrawnMarker<P> | undefined = undefined
                const hovered = hoveredRef.current

                dataSource?.seriesList().forEach(series => {
                    if (!series.name.match(seriesFilter)) return
                    const style = seriesStyles.get(series.name) ?? defaultLineStyle()
                    // the markers, a path per color and opacity, so that a series in one color is
                    // a few fills
                    const paths = new Map<string, {fill: string, level: number, path: Path2D}>()

                    series.data.forEach(datum => {
                        const location: [number, number] = [datum.longitude, datum.latitude]
                        if (maxDistance !== Infinity && d3.geoDistance(location, viewCenter) > maxDistance) return
                        const projected = projection(location)
                        if (projected === null || !Number.isFinite(projected[0]) || !Number.isFinite(projected[1])) return
                        const [x, y] = projected
                        if (x < 0 || y < 0 || x > width || y > height) return

                        const radius = Math.max(radiusOf?.(datum, series.name) ?? markerRadius, 0.5)
                        const fill = colorOf?.(datum, series.name) ?? style.color
                        const level = fadeLevelOf(datum)
                        const key = `${fill}|${level}`
                        let markerPath = paths.get(key)
                        if (markerPath === undefined) {
                            markerPath = {fill, level, path: new Path2D()}
                            paths.set(key, markerPath)
                        }
                        markerPath.path.moveTo(x + radius, y)
                        markerPath.path.arc(x, y, radius, 0, 2 * Math.PI)

                        const marker = {
                            x: x + margin.left, y: y + margin.top,
                            hitRadius: Math.max(radius + 3, 6),
                            seriesName: series.name, datum
                        }
                        markers.push(marker)
                        if (hovered?.datum === datum) hoveredMarker = marker
                    })

                    // the faintest first, so that the newest events are drawn over the older ones
                    Array.from(paths.values())
                        .sort((a, b) => b.level - a.level)
                        .forEach(({fill, level, path: markerPath}) => {
                            context2D.globalAlpha = opacityOf(level)
                            context2D.fillStyle = fill
                            context2D.fill(markerPath)
                        })
                })

                // the hovered event: enlarged, in its series' highlight color, with a ring
                const highlighted = hoveredMarker as DrawnMarker<P> | undefined
                if (highlighted !== undefined) {
                    const style = seriesStyles.get(highlighted.seriesName) ?? defaultLineStyle()
                    context2D.globalAlpha = 1
                    context2D.fillStyle = style.highlightColor
                    context2D.beginPath()
                    context2D.arc(highlighted.x - margin.left, highlighted.y - margin.top, highlighted.hitRadius - 1, 0, 2 * Math.PI)
                    context2D.fill()
                    context2D.strokeStyle = color
                    context2D.lineWidth = 1
                    context2D.stroke()
                }

                markersRef.current = d3.quadtree<DrawnMarker<P>>().x(marker => marker.x).y(marker => marker.y).addAll(markers)
                maxHitRadiusRef.current = markers.reduce((max, marker) => Math.max(max, marker.hitRadius), 0)
                context2D.restore()
            }

            onUpdateChartTime(currentTimeRef.current)
            cc.register(`geo-plot-${chartId}`, draw, 10)
            cc.requestRedraw()
        },
        [
            chartId, projection, width, height, plotDimensions, margin.left, margin.top, graticule,
            showGraticule, basemap, borders, oceanColor, landColor, borderColor, graticuleColor,
            outlineColor, markerRadius, markerOpacity, radiusOf, colorOf, fadeDuration, fadedOpacity,
            seriesStyles, seriesFilter, color, dataSource, onUpdateChartTime,
        ]
    )

    // the latest `updatePlot`, for the view driver (which would otherwise keep a stale one)
    const updatePlotRef = useRef(updatePlot)
    useEffect(
        () => {
            updatePlotRef.current = updatePlot
            if (canvasContext !== null) updatePlot(canvasContext)
        },
        [updatePlot, canvasContext]
    )

    // dragging moves the view, and the wheel zooms it about the mouse (see `useCanvasZoomPan`). The
    // zoom scale grows as the view zooms in (like the bar plot's, not the time-axis plots'), so the
    // wheel is inverted to zoom the same way as the other plots for the same gesture.
    const {resetZoomTransform, setZoomScale} = useCanvasZoomPan(canvasContext, {
        panEnabled: rotateEnabled,
        zoomEnabled,
        keyModifiersRequired: zoomKeyModifiersRequired,
        scaleExtent: [1, zoomMaxScaleFactor],
        invertWheel: true,
        translateExtent: [[margin.left, margin.top], [width, height]],
        onPanStart: () => {
            allowTooltipRef.current = false
            draggingRef.current = true
        },
        onPan: (dx, dy) => {
            viewRef.current = panView(projection, viewRef.current, dx, dy, width, height)
            canvasContext?.requestRedraw()
        },
        onPanEnd: () => {
            allowTooltipRef.current = !(dataSource?.running ?? false)
            draggingRef.current = false
            reportView()
        },
        onZoom: ({k, x, y}) => {
            viewRef.current = zoomViewAbout(projection, viewRef.current, k, [x - margin.left, y - margin.top], width, height)
            canvasContext?.requestRedraw()
            reportView()
        },
        onZoomReset,
        resetView: () => {
            viewRef.current = initialView
            canvasContext?.requestRedraw()
            reportView()
        },
    })

    // restores the zoom of a view handed in (see `viewState`) into d3-zoom's own transform, once the
    // canvas exists (a new canvas' transform starts at a scale of 1, which would mis-measure how far
    // the user may zoom in or out)
    const zoomRestoredRef = useRef<boolean>(false)
    useEffect(
        () => {
            if (canvasContext === null || zoomRestoredRef.current) return
            zoomRestoredRef.current = true
            setZoomScale(viewRef.current.k)
        },
        [canvasContext, setZoomScale]
    )

    // a new `center` re-centers (and un-zooms) the view -- but not when the plot mounts, so that a
    // view handed in is kept
    const centeredOnRef = useRef(initialView)
    useEffect(
        () => {
            if (centeredOnRef.current === initialView) return
            centeredOnRef.current = initialView
            viewRef.current = initialView
            resetZoomTransform()
            canvasContext?.requestRedraw()
            reportView()
        },
        [initialView, canvasContext, resetZoomTransform, reportView]
    )

    // reports the view when the plot unmounts (e.g. to keep the auto-rotation's progress)
    useEffect(() => (): void => reportView(), [reportView])

    // turns the view westward, at `autoRotate` degrees per second, on every animation frame --
    // except while it's being dragged, or an event is hovered (and reports the view when it pauses)
    useEffect(
        () => {
            if (autoRotate === undefined || autoRotate === 0 || canvasContext === null) return
            let previousTime: number | undefined = undefined
            let wasPaused = false
            let frame = requestAnimationFrame(function turn(time: number): void {
                const paused = draggingRef.current || hoveredRef.current !== undefined
                if (!paused && previousTime !== undefined) {
                    const [lambda, phi, gamma] = viewRef.current.rotate
                    const turned = lambda + autoRotate * (time - previousTime) / 1000
                    viewRef.current = {...viewRef.current, rotate: [((turned % 360) + 540) % 360 - 180, phi, gamma]}
                    canvasContext.requestRedraw()
                }
                if (paused && !wasPaused) reportView()
                wasPaused = paused
                previousTime = time
                frame = requestAnimationFrame(turn)
            })
            return (): void => cancelAnimationFrame(frame)
        },
        [autoRotate, canvasContext, reportView]
    )

    // hovering an event shows its tooltip (see `GeoPlotTooltipContent`) and highlights its marker
    useEffect(
        () => {
            if (canvasContext === null) return
            const canvas = canvasContext.canvas
            const tooltipId = `tooltip-${chartId}`

            const leave = (): void => {
                const previous = hoveredRef.current
                if (previous === undefined) return
                mouseLeaveHandlerFor(tooltipId)?.(previous.seriesName)
                hoveredRef.current = undefined
                canvasContext.requestRedraw()
            }

            const handleMove = (event: MouseEvent): void => {
                if (!allowTooltipRef.current || !tooltipVisible) {
                    leave()
                    return
                }
                const [x, y] = canvasLocalPoint(event, canvas)
                const nearest = markersRef.current.find(x, y, maxHitRadiusRef.current)
                const hit = nearest !== undefined && Math.hypot(nearest.x - x, nearest.y - y) <= nearest.hitRadius ?
                    nearest :
                    undefined
                if (hit !== undefined && hoveredRef.current?.datum === hit.datum) return

                leave()
                if (hit === undefined) return
                hoveredRef.current = {seriesName: hit.seriesName, datum: hit.datum}
                const tooltipData: TooltipData<GeoDatum<P>, GeoTooltipMetadata<P>> = {
                    series: [hit.datum],
                    metadata: {seriesName: hit.seriesName, datum: hit.datum}
                }
                mouseOverHandlerFor(tooltipId)?.(hit.seriesName, hit.datum.time, tooltipData, [x, y])
                canvasContext.requestRedraw()
            }

            canvas.addEventListener('mousemove', handleMove)
            canvas.addEventListener('mouseleave', leave)
            return (): void => {
                canvas.removeEventListener('mousemove', handleMove)
                canvas.removeEventListener('mouseleave', leave)
            }
        },
        [canvasContext, chartId, mouseOverHandlerFor, mouseLeaveHandlerFor, tooltipVisible]
    )

    // creates the view driver that redraws the plot as events arrive, with the current settings
    // (an effect event, so the driver is only created when the run starts)
    const createViewDriver = useEffectEvent(
        (source: NonNullable<typeof dataSource>) => geoViewDriverFor<P>(
            source,
            windowingTime,
            () => {
                if (canvasContext !== null) updatePlotRef.current(canvasContext)
            },
            time => currentTimeRef.current = time,
            dataUpdatePeriod,
        )
    )

    // while the data source is running (and this plot has a canvas), redraw as events arrive. The
    // driver belongs to this plot instance alone and is torn down with it.
    useEffect(
        () => {
            if (dataSource === undefined || !running || canvasContext === null) return
            allowTooltipRef.current = false
            const driver = createViewDriver(dataSource)
            return (): void => {
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
                console.error("GeoPlot requires a data source; set the enclosing Chart's `dataSource` prop")
            }
        },
        [dataSource]
    )

    // unregister this plot's draw function on unmount
    useEffect(
        () => (): void => canvasContext?.unregister(`geo-plot-${chartId}`),
        [canvasContext, chartId]
    )

    return null
}
