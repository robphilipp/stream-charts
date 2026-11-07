import {useCallback, useEffect, useEffectEvent, useMemo, useRef} from 'react'
import * as d3 from "d3"
import {useChart} from "../hooks/useChart"
import {useCanvasZoomPan} from "./useCanvasZoomPan"
import {clipToArea} from "./plot"
import {type BaseAxis, defaultLineStyle, type SeriesLineStyle} from "../axes/axes"
import type {BaseAxisRange} from "../axes/BaseAxisRange"
import type {CanvasContext} from "../d3types"
import {canvasLocalPoint, seriesAt, type SeriesGeometry} from "./hitTesting"
import {noop} from "../utils"
import {withAlpha} from "../styling/canvasStyle"
import {geoViewDriverFor} from "../subscriptions/viewDrivers"
import {useDataSource, useDataSourceRunning, useStreamingSettings} from "../hooks/useDataSource"
import type {GeoChartData} from "../observables/geo"
import type {GeoDatum, GeoSeries} from "../series/geoSeries"
import {usePlotDimensions} from "../hooks/usePlotDimensions"
import {type TooltipData, useTooltip} from "../hooks/useTooltip"
import {type GeoProjectionName, GeoProjections, type GeoTooltipMetadata} from "./geoProjections"

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
     * and after its view is reset. Defaults to `[0, 20]`.
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
     * Whether dragging rotates the view: the globe turns under the mouse (with an azimuthal
     * projection, like the default `orthographic`), or the map shifts east and west (with the
     * others). Defaults to `true`.
     */
    rotateEnabled?: boolean
    /**
     * Whether the mouse wheel zooms the view (about its center). Defaults to `true`.
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
     * Called whenever this plot (re)creates its zoom behavior, handing the caller a `resetZoom`
     * function that resets the view (its rotation and zoom) -- e.g. for a "Clear" action. Only
     * meaningful (called) while `zoomEnabled` is `true`.
     */
    onZoomReset?: (resetZoom: () => void) => void
}

// the view: the projection's rotation, and the zoom (a factor of the fitted scale)
type GeoView = {
    rotate: [lambda: number, phi: number, gamma: number]
    k: number
}

/**
 * @param center The `[longitude, latitude]` at the center of the view
 * @return The (un-zoomed) view centered there
 */
const viewCenteredOn = ([longitude, latitude]: [number, number]): GeoView =>
    ({rotate: [-longitude, -latitude, 0], k: 1})

const DEFAULT_CENTER: [number, number] = [0, 20]
const DEGREES = 180 / Math.PI

/**
 * Whether a projection shows the earth as a globe (an azimuthal projection, like the orthographic):
 * it clips at an angle from its center, hiding the far side. (d3 reports a projection that doesn't
 * clip at an angle as having a clip angle of 0.)
 * @param projection The projection
 * @return `true` when the projection clips at an angle from its center
 */
function isGlobe(projection: d3.GeoProjection): boolean {
    const clipAngle = projection.clipAngle()
    return clipAngle !== null && clipAngle !== undefined && clipAngle > 0
}

/**
 * Renders streaming sensor events on a map, or a globe, for the series held by the
 * {@link GeoDataSource} handed to the {@link Chart} (its `dataSource` prop): one marker per event,
 * at its latitude and longitude, in its series' color (or its own, see `colorOf`). Uses d3-geo's
 * projections (see {@link GeoProjections}) and draws onto the chart's canvas. Dragging rotates the
 * view and the mouse wheel zooms it. The plot needs no axes.
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
        rotateEnabled = true,
        zoomEnabled = true,
        zoomKeyModifiersRequired = true,
        zoomMaxScaleFactor = 20,
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

    // the view (rotation and zoom), changed by dragging and zooming; starts centered on `center`
    const [centerLongitude, centerLatitude] = center
    const initialView = useMemo(
        () => viewCenteredOn([centerLongitude, centerLatitude]),
        [centerLongitude, centerLatitude]
    )
    const viewRef = useRef<GeoView>(initialView)
    // a new `center` re-centers the view
    useEffect(
        () => {
            viewRef.current = initialView
            canvasContext?.requestRedraw()
        },
        [initialView, canvasContext]
    )

    // the time of the latest event, reported to the chart's `onUpdateChartTime`
    const currentTimeRef = useRef<number>(0)

    // tooltips are only shown while the data source is paused (and not while dragging)
    const allowTooltipRef = useRef<boolean>(!(dataSource?.running ?? false))

    // the last-drawn markers' positions (canvas coordinates) by series, for hit-testing the mouse,
    // and the events they belong to, in the same order
    const geometryRef = useRef<Map<string, SeriesGeometry>>(new Map())
    const drawnEventsRef = useRef<Map<string, Array<GeoDatum<P>>>>(new Map())
    // the event under the mouse (its series and its index among the series' drawn events)
    const hoveredRef = useRef<{seriesName: string, index: number} | undefined>(undefined)

    /**
     * Fits the projection to the plot area for the current view: its rotation, then the scale and
     * translation that fit the whole sphere, and then the zoom (about the center)
     * @return The projection, set for the current view
     */
    const projectionForView = useCallback(
        (): d3.GeoProjection => {
            // a globe turns in every direction; a flat map only shifts east and west (tilting it
            // would make it an oblique projection), but the view keeps its tilt for when it's
            // shown as a globe again
            const {rotate: [lambda, phi, gamma], k} = viewRef.current
            projection.rotate(isGlobe(projection) ? [lambda, phi, gamma] : [lambda, 0, 0])
            projection.fitExtent([[0, 0], [plotDimensions.width, plotDimensions.height]], {type: 'Sphere'})
            projection.scale(projection.scale() * k)
            return projection
        },
        [projection, plotDimensions]
    )

    const updatePlot = useCallback(
        /**
         * (Re-)registers this plot's draw function with the canvas context and requests a redraw
         * @param cc The canvas context to register the draw function with
         */
        (cc: CanvasContext): void => {
            const draw = (context: CanvasContext): void => {
                const {context2D} = context
                const proj = projectionForView()
                const path = d3.geoPath(proj, context2D)

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

                // the events: an azimuthal projection (a globe) hides the far side, beyond its clip
                // angle from the view's center
                const [lambda, phi] = proj.rotate()
                const viewCenter: [number, number] = [-lambda, -phi]
                const maxDistance = isGlobe(proj) ? (proj.clipAngle() ?? 0) / DEGREES : Infinity
                const hovered = hoveredRef.current

                const geometry = new Map<string, SeriesGeometry>()
                const drawnEvents = new Map<string, Array<GeoDatum<P>>>()
                context2D.globalAlpha = markerOpacity

                dataSource?.seriesList().forEach(series => {
                    if (!series.name.match(seriesFilter)) return
                    const style = seriesStyles.get(series.name) ?? defaultLineStyle()
                    const points: Array<[number, number]> = []
                    const events: Array<GeoDatum<P>> = []
                    // the markers, a path per color, so that a series in one color is one fill
                    const pathsByColor = new Map<string, Path2D>()

                    series.data.forEach(datum => {
                        const location: [number, number] = [datum.longitude, datum.latitude]
                        if (maxDistance !== Infinity && d3.geoDistance(location, viewCenter) > maxDistance) return
                        const projected = proj(location)
                        if (projected === null || !Number.isFinite(projected[0]) || !Number.isFinite(projected[1])) return
                        const [x, y] = projected
                        if (x < 0 || y < 0 || x > plotDimensions.width || y > plotDimensions.height) return

                        const radius = radiusOf?.(datum, series.name) ?? markerRadius
                        const fill = colorOf?.(datum, series.name) ?? style.color
                        let markers = pathsByColor.get(fill)
                        if (markers === undefined) {
                            markers = new Path2D()
                            pathsByColor.set(fill, markers)
                        }
                        markers.moveTo(x + radius, y)
                        markers.arc(x, y, Math.max(radius, 0.5), 0, 2 * Math.PI)

                        points.push([x + margin.left, y + margin.top])
                        events.push(datum)
                    })

                    pathsByColor.forEach((markers, fill) => {
                        context2D.fillStyle = fill
                        context2D.fill(markers)
                    })

                    geometry.set(series.name, {points, hitRadius: Math.max(markerRadius + 3, 6)})
                    drawnEvents.set(series.name, events)

                    // the hovered event: enlarged, in the series' highlight color, with a ring
                    if (hovered?.seriesName === series.name && hovered.index < events.length) {
                        const [hx, hy] = points[hovered.index]
                        const datum = events[hovered.index]
                        const radius = (radiusOf?.(datum, series.name) ?? markerRadius) + 2
                        context2D.globalAlpha = 1
                        context2D.fillStyle = style.highlightColor
                        context2D.beginPath()
                        context2D.arc(hx - margin.left, hy - margin.top, radius, 0, 2 * Math.PI)
                        context2D.fill()
                        context2D.strokeStyle = color
                        context2D.lineWidth = 1
                        context2D.stroke()
                        context2D.globalAlpha = markerOpacity
                    }
                })

                geometryRef.current = geometry
                drawnEventsRef.current = drawnEvents
                context2D.restore()
            }

            onUpdateChartTime(currentTimeRef.current)
            cc.register(`geo-plot-${chartId}`, draw, 10)
            cc.requestRedraw()
        },
        [
            chartId, projectionForView, plotDimensions, margin.left, margin.top, graticule, showGraticule,
            basemap, borders, oceanColor, landColor, borderColor, graticuleColor, outlineColor,
            markerRadius, markerOpacity, radiusOf, colorOf, seriesStyles, seriesFilter, color,
            dataSource, onUpdateChartTime,
        ]
    )

    // the latest `updatePlot`, for the view driver and the drag/zoom handlers (which would otherwise
    // keep stale ones)
    const updatePlotRef = useRef(updatePlot)
    useEffect(
        () => {
            updatePlotRef.current = updatePlot
            if (canvasContext !== null) updatePlot(canvasContext)
        },
        [updatePlot, canvasContext]
    )

    // dragging rotates the view, and the wheel zooms it about its center (see `useCanvasZoomPan`).
    // The zoom scale grows as the view zooms in (like the bar plot's, not the time-axis plots'), so
    // the wheel is inverted to zoom the same way as the other plots for the same gesture.
    useCanvasZoomPan(canvasContext, {
        panEnabled: rotateEnabled,
        zoomEnabled,
        keyModifiersRequired: zoomKeyModifiersRequired,
        scaleExtent: [1, zoomMaxScaleFactor],
        invertWheel: true,
        translateExtent: [[margin.left, margin.top], [plotDimensions.width, plotDimensions.height]],
        onPanStart: () => {
            allowTooltipRef.current = false
        },
        onPan: (dx, dy) => {
            // the globe turns under the mouse: a pixel at the view's center spans
            // (1 / scale) radians of the sphere
            const degreesPerPixel = DEGREES / projection.scale()
            const {rotate: [lambda, phi, gamma], k} = viewRef.current
            // a globe (an azimuthal projection, which clips at an angle) also tilts north and
            // south; a flat map only shifts east and west
            const tilts = isGlobe(projection)
            viewRef.current = {
                rotate: [
                    lambda + dx * degreesPerPixel,
                    tilts ? Math.max(-90, Math.min(90, phi - dy * degreesPerPixel)) : phi,
                    gamma
                ],
                k
            }
            canvasContext?.requestRedraw()
        },
        onPanEnd: () => {
            allowTooltipRef.current = !(dataSource?.running ?? false)
        },
        onZoom: ({k}) => {
            viewRef.current = {...viewRef.current, k}
            canvasContext?.requestRedraw()
        },
        onZoomReset,
        resetView: () => {
            viewRef.current = initialView
            canvasContext?.requestRedraw()
        },
    })

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
                if (!allowTooltipRef.current || !tooltipVisible) return
                const [x, y] = canvasLocalPoint(event, canvas)
                const hit = seriesAt(x, y, geometryRef.current)
                const previous = hoveredRef.current
                if (previous !== undefined && hit !== undefined &&
                    previous.seriesName === hit.name && previous.index === hit.index) return

                leave()
                if (hit === undefined) return
                const datum = drawnEventsRef.current.get(hit.name)?.[hit.index]
                if (datum === undefined) return
                hoveredRef.current = {seriesName: hit.name, index: hit.index}
                const tooltipData: TooltipData<GeoDatum<P>, GeoTooltipMetadata<P>> = {
                    series: [datum],
                    metadata: {seriesName: hit.name, datum}
                }
                mouseOverHandlerFor(tooltipId)?.(hit.name, datum.time, tooltipData, [x, y])
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
