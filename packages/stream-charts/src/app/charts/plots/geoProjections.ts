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

/**
 * The ellipse a marker is drawn as: its center (px), its two radii (px), and the rotation (radians)
 * of its first radius' axis
 */
export type MarkerEllipse = [x: number, y: number, radiusX: number, radiusY: number, rotation: number]

// how far (a factor of its radius at the view's center) a marker may be stretched, and how lopsided
// (px) the projection may be over it, before it's drawn exactly instead (see `markerEllipseAt`)
const MAX_MARKER_STRETCH = 20
const MAX_MARKER_LOPSIDEDNESS = 0.5

/**
 * The ellipse that a small circle on the earth (an event's marker) projects to, to draw it quickly.
 * The projection shapes the circle as it shapes the map (e.g. flattened toward a globe's edge, or
 * stretched toward a Mercator map's poles); over a small circle, it's nearly the same throughout, so
 * the circle projects to nearly an ellipse: the one through the projections of its northern,
 * southern, eastern, and western points. (Drawing the circle exactly, as a polygon on the sphere,
 * through the projection, takes a few times longer, which adds up over thousands of markers, redrawn
 * on every frame of a turning globe.) Where the projection changes across the circle -- it's
 * lopsided, e.g. near a Mercator map's poles -- the ellipse is off by about half the lopsidedness, so
 * a circle lopsided by more than half a pixel is left to be drawn exactly.
 * @param projection The projection, set up for the view
 * @param center Where the circle's center is drawn: its `[x, y]` (px)
 * @param longitude The longitude (degrees) of the circle's center
 * @param latitude The latitude (degrees) of the circle's center
 * @param radius The circle's radius (px, at the view's center)
 * @param degreesPerPixel The degrees of the sphere that a pixel spans at the view's center
 * @return The ellipse, or `undefined` where the circle should be drawn exactly instead (where the
 * projection is lopsided over it, or stretches it too far; near a pole; or across a flat map's
 * antimeridian)
 */
export function markerEllipseAt(
    projection: d3.GeoProjection,
    [x, y]: [number, number],
    longitude: number,
    latitude: number,
    radius: number,
    degreesPerPixel: number,
): MarkerEllipse | undefined {
    const angularRadius = radius * degreesPerPixel
    const cosLatitude = Math.cos(latitude / DEGREES)
    if (Math.abs(latitude) + angularRadius > 89 || cosLatitude < 1e-3) return undefined
    // where the circle's eastern, western, northern, and southern points are drawn (the eastern and
    // western points are along the parallel: near enough, for a small circle)
    const east = projection([longitude + angularRadius / cosLatitude, latitude])
    const west = projection([longitude - angularRadius / cosLatitude, latitude])
    const north = projection([longitude, latitude + angularRadius])
    const south = projection([longitude, latitude - angularRadius])
    if (east === null || west === null || north === null || south === null) return undefined

    // how lopsided the projection is over the circle: how far the midpoints of its opposite points
    // are from its center
    const lopsidedness = Math.max(
        Math.hypot((east[0] + west[0]) / 2 - x, (east[1] + west[1]) / 2 - y),
        Math.hypot((north[0] + south[0]) / 2 - x, (north[1] + south[1]) / 2 - y),
    )
    if (!(lopsidedness <= MAX_MARKER_LOPSIDEDNESS)) return undefined

    // the ellipse through the four points is the image of the unit circle under the matrix
    // [[ex, nx], [ey, ny]] (half the distances between opposite points): its radii are the matrix's
    // singular values, and its first radius lies along its first left singular vector (the closed
    // form of a 2x2 singular value decomposition)
    const ex = (east[0] - west[0]) / 2, ey = (east[1] - west[1]) / 2
    const nx = (north[0] - south[0]) / 2, ny = (north[1] - south[1]) / 2
    const e = (ex + ny) / 2, f = (ex - ny) / 2, g = (ey + nx) / 2, h = (ey - nx) / 2
    const q = Math.hypot(e, h), r = Math.hypot(f, g)
    const radiusX = q + r
    const radiusY = Math.abs(q - r)
    if (!Number.isFinite(radiusX) || radiusX > MAX_MARKER_STRETCH * radius) return undefined
    return [
        (east[0] + west[0] + north[0] + south[0]) / 4,
        (east[1] + west[1] + north[1] + south[1]) / 4,
        radiusX,
        radiusY,
        (Math.atan2(g, f) + Math.atan2(h, e)) / 2,
    ]
}

/**
 * A flash of a new event (see the {@link GeoPlot}'s `flashes`): where, how large, how long, and in
 * what color its ring is. Anything not set is the event's: its place, the plot's `flashRadius` and
 * `flashDuration`, and its marker's color.
 */
export interface GeoFlash {
    /**
     * The latitude (degrees) of the flash's center. Defaults to the event's.
     */
    latitude?: number
    /**
     * The longitude (degrees) of the flash's center. Defaults to the event's.
     */
    longitude?: number
    /**
     * The radius (px, at the view's center) the flash's ring grows to. Defaults to the plot's
     * `flashRadius`.
     */
    radius?: number
    /**
     * How long (ms) the flash lasts. Defaults to the plot's `flashDuration`.
     */
    duration?: number
    /**
     * The color of the flash's ring. Defaults to the event's marker's color.
     */
    color?: string
}

/**
 * A flash, with everything set (see {@link GeoFlash})
 */
export type ResolvedGeoFlash = {
    latitude: number
    longitude: number
    radius: number
    duration: number
    color: string | undefined
}

/**
 * The flashes of a new event, from what the plot's `flashes` says of it
 * @param spec Whether the event flashes (`true`, once, as the plot's settings say; `false`, not at
 * all), or its flashes (none, for an empty list)
 * @param datum The event
 * @param defaults The plot's flash radius (px) and duration (ms)
 * @return The event's flashes, with everything that isn't set taken from the event and the defaults
 * (the color, from the event's marker, is left `undefined`); none for a flash with a place that isn't
 * a finite latitude and longitude
 */
export function resolvedFlashes(
    spec: boolean | ReadonlyArray<GeoFlash>,
    datum: {latitude: number, longitude: number},
    defaults: {radius: number, duration: number},
): Array<ResolvedGeoFlash> {
    const flashes = spec === true ? [{}] : spec === false ? [] : spec
    return flashes
        .map(flash => ({
            latitude: flash.latitude ?? datum.latitude,
            longitude: flash.longitude ?? datum.longitude,
            radius: flash.radius ?? defaults.radius,
            duration: flash.duration ?? defaults.duration,
            color: flash.color,
        }))
        .filter(flash => Number.isFinite(flash.latitude) && Number.isFinite(flash.longitude) && flash.duration > 0)
}

/**
 * A flash's ring at an age: it grows from the marker outward, quickly at first and then more slowly,
 * fading as it grows, until it's gone
 * @param age How long (ms) since the flash started (its event arrived)
 * @param duration How long (ms) a flash lasts
 * @param radius The radius (px) the ring grows to
 * @return The ring's radius (px) and opacity (0 to 1), or `undefined` before the flash starts and
 * once it's over
 */
export function flashRingOf(age: number, duration: number, radius: number): {radius: number, opacity: number} | undefined {
    if (!(age >= 0 && age < duration)) return undefined
    const t = age / duration
    // (eased out: 1 - (1 - t)^2)
    const grown = 1 - (1 - t) * (1 - t)
    return {radius: 2 + (radius - 2) * grown, opacity: 1 - t}
}

/**
 * The roll-up that the {@link GeoPlot}'s `auto` mode shows: the coarsest whose cells span at most
 * `clusterDistance` pixels on the screen (so that what it merges into one cell couldn't be told
 * apart anyway), or, once even the finest roll-up's cells span more, the events themselves. So that
 * zooming across a boundary doesn't flicker between two levels, the level shown stays shown while
 * its cells span up to `hysteresis` times the distance, and the next coarser level's more than the
 * distance divided by it.
 * @param levels The roll-ups to choose from, and how large (px) their cells are on the screen
 * @param clusterDistance The most (px) that a roll-up's cells may span
 * @param current The roll-up shown now (`undefined` for the events), or `null` when nothing is yet
 * @param hysteresis How far (a factor of the distance) past it the level shown now stays shown
 * @return The name of the roll-up to show, or `undefined` for the events
 */
export function autoLevelOf(
    levels: ReadonlyArray<{rollup: string, cellPixels: number}>,
    clusterDistance: number,
    current: string | undefined | null,
    hysteresis: number = 1.25,
): string | undefined {
    // coarsest first, then the events (whose "cells" have no size)
    const sorted: Array<{rollup: string | undefined, cellPixels: number}> = [
        ...[...levels].filter(level => Number.isFinite(level.cellPixels)).sort((a, b) => b.cellPixels - a.cellPixels),
        {rollup: undefined, cellPixels: 0},
    ]
    if (current !== null) {
        const index = sorted.findIndex(level => level.rollup === current)
        const coarser = index > 0 ? sorted[index - 1] : undefined
        if (index >= 0 && sorted[index].cellPixels <= clusterDistance * hysteresis &&
            (coarser === undefined || coarser.cellPixels > clusterDistance / hysteresis)) {
            return current
        }
    }
    return sorted.find(level => level.cellPixels <= clusterDistance)?.rollup
}

/**
 * Groups flashes that would be drawn as one: of the same color and length, starting within the same
 * stretch of time as long as one of them, and centered in the same `distance`-pixel square of the
 * screen -- e.g. a city's many new events, seen from far away. Drawn as one ring each, a place's
 * flashes pulse steadily, one ring at a time (or two, as one fades and the next starts), however
 * many new events it has.
 * @param flashes The flashes: where they're drawn (px), when they started, how long they last (ms),
 * and their color
 * @param distance The size (px) of the squares; 0 (or less) not to group them
 * @return The groups, each one flash or more
 * @template T The type of the flashes
 */
export function flashGroupsOf<T extends {x: number, y: number, start: number, duration: number, color: string}>(
    flashes: ReadonlyArray<T>,
    distance: number,
): Array<Array<T>> {
    if (!(distance > 0)) return flashes.map(flash => [flash])
    const groups = new Map<string, Array<T>>()
    flashes.forEach(flash => {
        const stretch = Math.floor(flash.start / flash.duration)
        const key = `${flash.color}|${flash.duration}|${Math.floor(flash.x / distance)}|${Math.floor(flash.y / distance)}|${stretch}`
        const group = groups.get(key)
        if (group === undefined) groups.set(key, [flash])
        else group.push(flash)
    })
    return Array.from(groups.values())
}

// a drawn marker (an event's, or an aggregate's circle), for hit-testing the mouse (in canvas
// coordinates), and what it shows
export type DrawnMarker<P> = {
    x: number
    y: number
    hitRadius: number
    target: GeoTooltipMetadata<P>
}

/**
 * The marker under the mouse: of the markers that reach the mouse, an aggregate's smallest circle
 * (the circles are drawn largest first, so the smallest is on top), or the nearest event
 * @param markers The drawn markers
 * @param maxHitRadius The largest of their hit radii
 * @param x The mouse's x (canvas coordinates)
 * @param y The mouse's y (canvas coordinates)
 * @return The marker, or `undefined` when none reaches the mouse
 * @template P The type of the events' payload
 */
export function markerAt<P>(markers: d3.Quadtree<DrawnMarker<P>>, maxHitRadius: number, x: number, y: number): DrawnMarker<P> | undefined {
    let hit: {marker: DrawnMarker<P>, distance: number} | undefined = undefined
    // (only the quadtree's nodes within the largest hit radius of the mouse are visited)
    markers.visit((node, x0, y0, x1, y1) => {
        if (!node.length) {
            let leaf: d3.QuadtreeLeaf<DrawnMarker<P>> | undefined = node as d3.QuadtreeLeaf<DrawnMarker<P>>
            while (leaf !== undefined) {
                const marker = leaf.data
                const distance = Math.hypot(marker.x - x, marker.y - y)
                const better = hit === undefined || (marker.target.kind === 'aggregate' ?
                    marker.hitRadius < hit.marker.hitRadius || (marker.hitRadius === hit.marker.hitRadius && distance < hit.distance) :
                    distance < hit.distance)
                if (distance <= marker.hitRadius && better) hit = {marker, distance}
                leaf = leaf.next
            }
        }
        return x0 > x + maxHitRadius || x1 < x - maxHitRadius || y0 > y + maxHitRadius || y1 < y - maxHitRadius
    })
    return (hit as {marker: DrawnMarker<P>} | undefined)?.marker
}
