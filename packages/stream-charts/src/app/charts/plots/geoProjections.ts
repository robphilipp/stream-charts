import * as d3 from "d3"
import type {GeoDatum} from "../series/geoSeries"
import type {GeoAggregate} from "../datasources/geoRollups"

/**
 * The map projections a {@link GeoPlot} can show by name (see its `projection` property). Any other
 * d3 projection can be handed to the plot directly.
 */
export const GeoProjections = {
    orthographic: d3.geoOrthographic,
    azimuthalEqualArea: d3.geoAzimuthalEqualArea,
    azimuthalEquidistant: d3.geoAzimuthalEquidistant,
    stereographic: d3.geoStereographic,
    equirectangular: d3.geoEquirectangular,
    mercator: d3.geoMercator,
    transverseMercator: d3.geoTransverseMercator,
    naturalEarth1: d3.geoNaturalEarth1,
    equalEarth: d3.geoEqualEarth,
    conicEqualArea: d3.geoConicEqualArea,
    conicEquidistant: d3.geoConicEquidistant,
} as const

/**
 * The name of a map projection a {@link GeoPlot} can show (see {@link GeoProjections})
 */
export type GeoProjectionName = keyof typeof GeoProjections

/**
 * What the tooltip gets about what's under the mouse (see {@link GeoPlotTooltipContent}): an event
 * (in the `points` mode), or a roll-up's aggregate (in the `aggregates` mode)
 * @template P The type of the events' payload
 */
export type GeoTooltipMetadata<P> = {
    kind: 'event'
    /**
     * The name of the event's series
     */
    seriesName: string
    /**
     * The event under the mouse
     */
    datum: GeoDatum<P>
} | {
    kind: 'aggregate'
    /**
     * The name of the roll-up
     */
    rollup: string
    /**
     * The aggregate under the mouse
     */
    aggregate: GeoAggregate
    /**
     * The group whose wedge is under the mouse (with the plot's `pies` shape)
     */
    group?: string
}

/**
 * A {@link GeoPlot}'s view, in a form that can be held outside the plot (e.g. in an application
 * store) and handed back to a later instance of the plot (see its `viewState` and `onViewChange`
 * properties) -- so that turning or zooming the view, navigating away, and navigating back doesn't
 * reset it
 */
export interface GeoPlotViewState {
    /**
     * The projection's rotation `[lambda, phi, gamma]` (degrees): the view is centered on longitude
     * `-lambda` and latitude `-phi`. A flat map only uses `lambda` (a globe uses all three), but the
     * view keeps them all, for when it's shown as a globe again.
     */
    rotate: [lambda: number, phi: number, gamma: number]
    /**
     * The zoom: a factor of the scale that fits the whole sphere into the plot (1 to show it all)
     */
    k: number
    /**
     * How far (px) a flat map is shifted up or down (zoomed in, a flat map pans north and south by
     * shifting, rather than by tilting, which would make it an oblique projection). Not used by a
     * globe.
     */
    offsetY: number
}

const DEGREES = 180 / Math.PI

/**
 * @param center The `[longitude, latitude]` (degrees) at the center of the view
 * @return The (un-zoomed) view centered there
 */
export function viewCenteredOn([longitude, latitude]: [number, number]): GeoPlotViewState {
    // (`0 - x` rather than `-x`, so that a 0 stays 0 rather than becoming -0)
    return {rotate: [0 - longitude, 0 - latitude, 0], k: 1, offsetY: 0}
}

/**
 * Whether a projection shows the earth as a globe (an azimuthal projection, like the orthographic):
 * it clips at an angle from its center, hiding the far side. (d3 reports a projection that doesn't
 * clip at an angle as having a clip angle of 0.)
 * @param projection The projection
 * @return `true` when the projection clips at an angle from its center
 */
export function isGlobe(projection: d3.GeoProjection): boolean {
    const clipAngle = projection.clipAngle()
    return clipAngle !== null && clipAngle !== undefined && clipAngle > 0
}

/**
 * Sets the projection up to show a view in a plot area: its rotation (a flat map only takes the
 * east-west rotation), the scale and translation that fit the whole sphere into the area, the zoom
 * (about the area's center), and, for a flat map, its vertical shift -- clamped so that a map
 * taller than the area always covers it, and a map that fits stays centered
 * @param projection The projection (changed in place)
 * @param view The view
 * @param width The width (px) of the plot area
 * @param height The height (px) of the plot area
 * @return The vertical shift (px) actually applied (0 for a globe)
 */
export function setUpProjection(projection: d3.GeoProjection, view: GeoPlotViewState, width: number, height: number): number {
    const globe = isGlobe(projection)
    const [lambda, phi, gamma] = view.rotate
    projection.rotate(globe ? [lambda, phi, gamma] : [lambda, 0, 0])
    projection.fitExtent([[0, 0], [width, height]], {type: 'Sphere'})
    projection.scale(projection.scale() * view.k)
    if (globe) return 0

    const [[, top], [, bottom]] = d3.geoPath(projection).bounds({type: 'Sphere'})
    const offsetY = bottom - top <= height ?
        height / 2 - (top + bottom) / 2 :
        Math.min(-top, Math.max(height - bottom, view.offsetY))
    const [x, y] = projection.translate()
    projection.translate([x, y + offsetY])
    return offsetY
}

/**
 * The view after dragging it: a globe turns under the mouse, in every direction; a flat map shifts
 * east and west (by turning), and north and south (by shifting, when zoomed in)
 * @param projection The projection (left set up for the new view)
 * @param view The view before the drag step
 * @param dx The horizontal distance (px) dragged
 * @param dy The vertical distance (px) dragged
 * @param width The width (px) of the plot area
 * @param height The height (px) of the plot area
 * @return The new view
 */
export function panView(
    projection: d3.GeoProjection,
    view: GeoPlotViewState,
    dx: number,
    dy: number,
    width: number,
    height: number,
): GeoPlotViewState {
    setUpProjection(projection, view, width, height)
    // a pixel at the view's center spans (1 / scale) radians of the sphere
    const degreesPerPixel = DEGREES / projection.scale()
    const [lambda, phi, gamma] = view.rotate
    if (isGlobe(projection)) {
        return {
            ...view,
            rotate: [lambda + dx * degreesPerPixel, Math.max(-90, Math.min(90, phi - dy * degreesPerPixel)), gamma],
        }
    }
    const moved = {...view, rotate: [lambda + dx * degreesPerPixel, phi, gamma] as [number, number, number], offsetY: view.offsetY + dy}
    return {...moved, offsetY: setUpProjection(projection, moved, width, height)}
}

/**
 * @param degrees An angle (degrees)
 * @return The same angle, between -180 and 180
 */
const normalized = (degrees: number): number => ((degrees % 360) + 540) % 360 - 180

/**
 * The place under a point of the plot area, when the point is on the map. (d3's `invert` doesn't
 * say when a point is off the map -- e.g. beyond a globe's edge, it still answers with a place --
 * so the place only counts when projecting it lands back on the point.)
 * @param projection The projection, set up for the view
 * @param point The `[x, y]` (px) of the point
 * @return The `[longitude, latitude]` under the point, or `undefined` when the point is off the map
 */
export function placeUnder(projection: d3.GeoProjection, point: [x: number, y: number]): [number, number] | undefined {
    const place = projection.invert?.(point)
    if (place === null || place === undefined || !Number.isFinite(place[0]) || !Number.isFinite(place[1])) return undefined
    const back = projection(place)
    if (back === null || Math.hypot(back[0] - point[0], back[1] - point[1]) > 1) return undefined
    if (isGlobe(projection)) {
        const [lambda, phi] = projection.rotate()
        if (d3.geoDistance(place, [-lambda, -phi]) > (projection.clipAngle() ?? 0) / DEGREES) return undefined
    }
    return place
}

/**
 * The view after zooming it to a new scale about a point of the plot area: the place under the
 * point stays under it (as far as the projection allows). When the point is off the map (e.g.
 * beyond the globe's edge), zooms about the center.
 * @param projection The projection (left set up for the new view)
 * @param view The view before zooming
 * @param k The new zoom (a factor of the scale that fits the whole sphere)
 * @param point The `[x, y]` (px) of the point in the plot area to zoom about
 * @param width The width (px) of the plot area
 * @param height The height (px) of the plot area
 * @return The new view
 */
export function zoomViewAbout(
    projection: d3.GeoProjection,
    view: GeoPlotViewState,
    k: number,
    point: [x: number, y: number],
    width: number,
    height: number,
): GeoPlotViewState {
    setUpProjection(projection, view, width, height)
    const place = placeUnder(projection, point)
    let zoomed: GeoPlotViewState = {...view, k}
    if (place === undefined) {
        zoomed = {...zoomed, offsetY: setUpProjection(projection, zoomed, width, height)}
        return zoomed
    }

    // turn (and, for a flat map, shift) the view until the place is back under the point: a few
    // steps converge, since each step's error is small (a zoom step changes the scale a little)
    const globe = isGlobe(projection)
    for (let step = 0; step < 4; step++) {
        zoomed = {...zoomed, offsetY: setUpProjection(projection, zoomed, width, height)}
        const under = placeUnder(projection, point)
        if (under === undefined) break
        // (a place east of the one under the point is to its right: turn the view west, and so on)
        const dLongitude = Math.max(-30, Math.min(30, normalized(place[0] - under[0])))
        const dLatitude = place[1] - under[1]
        const [lambda, phi, gamma] = zoomed.rotate
        if (globe) {
            zoomed = {...zoomed, rotate: [lambda - dLongitude, Math.max(-90, Math.min(90, phi - dLatitude)), gamma]}
        } else {
            zoomed = {...zoomed, rotate: [lambda - dLongitude, phi, gamma]}
            zoomed = {...zoomed, offsetY: setUpProjection(projection, zoomed, width, height)}
            const projected = projection(place)
            if (projected !== null) zoomed = {...zoomed, offsetY: zoomed.offsetY + point[1] - projected[1]}
        }
        if (Math.abs(dLongitude) < 1e-4 && Math.abs(dLatitude) < 1e-4) break
    }
    return {...zoomed, offsetY: setUpProjection(projection, zoomed, width, height)}
}

/**
 * @param from A `[longitude, latitude]` (degrees)
 * @param to Another `[longitude, latitude]` (degrees)
 * @return The bearing (degrees, clockwise from north, 0 to 360) of `to`, seen from `from`
 */
export function bearingOf([fromLongitude, fromLatitude]: [number, number], [toLongitude, toLatitude]: [number, number]): number {
    const phi1 = fromLatitude / DEGREES
    const phi2 = toLatitude / DEGREES
    const deltaLambda = (toLongitude - fromLongitude) / DEGREES
    const y = Math.sin(deltaLambda) * Math.cos(phi2)
    const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda)
    return ((Math.atan2(y, x) * DEGREES) % 360 + 360) % 360
}

/**
 * @param center A `[longitude, latitude]` (degrees)
 * @param distance An angular distance (degrees)
 * @param bearing A bearing (degrees, clockwise from north)
 * @return The `[longitude, latitude]` that far from the center, in that direction
 */
function destinationOf([longitude, latitude]: [number, number], distance: number, bearing: number): [number, number] {
    const phi1 = latitude / DEGREES
    const delta = distance / DEGREES
    const theta = bearing / DEGREES
    const phi2 = Math.asin(Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta))
    const lambda2 = longitude / DEGREES + Math.atan2(
        Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
        Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
    )
    return [((lambda2 * DEGREES + 540) % 360) - 180, phi2 * DEGREES]
}

/**
 * A wedge of a circle on the sphere -- a slice of a pie drawn on the earth -- from one bearing,
 * clockwise, to another, as a GeoJSON polygon (wound clockwise, as d3-geo wants a small polygon)
 * @param center The circle's `[longitude, latitude]` (degrees)
 * @param radius The circle's angular radius (degrees)
 * @param from The bearing (degrees, clockwise from north) where the wedge starts
 * @param to The bearing where it ends (more than `from`, by at most 360)
 * @param step The largest angle (degrees) between the points along its arc
 * @return The wedge
 */
export function wedgeOf(center: [number, number], radius: number, from: number, to: number, step: number = 10): GeoJSON.Polygon {
    const steps = Math.max(1, Math.ceil((to - from) / step))
    const arc = Array.from({length: steps + 1}, (_, k) => destinationOf(center, radius, from + (to - from) * k / steps))
    return {type: 'Polygon', coordinates: [[center, ...arc, center]]}
}

/**
 * @param shares The groups' shares (e.g. their counts), in the order their wedges are drawn,
 * clockwise from north
 * @param bearing A bearing (degrees, clockwise from north)
 * @return The index of the group whose wedge holds the bearing (-1 when there are no shares)
 */
export function wedgeIndexAt(shares: ReadonlyArray<number>, bearing: number): number {
    const total = shares.reduce((sum, share) => sum + share, 0)
    if (total <= 0) return -1
    let end = 0
    for (let index = 0; index < shares.length; index++) {
        end += 360 * shares[index] / total
        if (bearing < end) return index
    }
    return shares.length - 1
}
