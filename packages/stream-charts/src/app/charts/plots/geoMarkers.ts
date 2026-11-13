import * as d3 from "d3"
import type {GeoDatum} from "../series/geoSeries"
import type {GeoAggregate, GeoAggregateGroup} from "../datasources/geoRollups"

/*
    What a GeoPlot draws for its events and aggregates, and finds under the mouse: the markers (as
    the ellipses they project to), the pies' wedges, the roll-up the auto mode shows, and the hit-
    testing of the drawn markers.
 */

const DEGREES = 180 / Math.PI

/**
 * What the tooltip gets about what's under the mouse (see {@link GeoPlotTooltipContent}): an event
 * (in the `events` mode), or a roll-up's aggregate (in the `aggregates` mode)
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
    /**
     * The series whose events the aggregate counts (in the `auto` mode, the chart's series filter);
     * all of them when not set
     */
    seriesFilter?: RegExp
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
 * @param groups An aggregate's groups
 * @return The groups in the order their pie's wedges are drawn, clockwise from north: by name, so
 * that a group's wedge keeps its place as the counts change (an aggregate lists its groups the
 * largest first)
 */
export const pieGroupsOf = (groups: ReadonlyArray<GeoAggregateGroup>): Array<GeoAggregateGroup> =>
    [...groups].sort((a, b) => a.group.localeCompare(b.group))

/**
 * @param shares The groups' shares (e.g. their counts), in the order their wedges are drawn,
 * clockwise from north
 * @return Each group's wedge: the bearings (degrees, clockwise from north) it spans, its angle its
 * share of the whole (none when there are no shares)
 */
export function wedgeBearingsOf(shares: ReadonlyArray<number>): Array<[from: number, to: number]> {
    const total = shares.reduce((sum, share) => sum + share, 0)
    if (!(total > 0)) return []
    let from = 0
    return shares.map(share => {
        const to = from + 360 * share / total
        const wedge: [number, number] = [from, to]
        from = to
        return wedge
    })
}

/**
 * @param shares The groups' shares (e.g. their counts), in the order their wedges are drawn,
 * clockwise from north
 * @param bearing A bearing (degrees, clockwise from north)
 * @return The index of the group whose wedge holds the bearing (-1 when there are no shares)
 */
export function wedgeIndexAt(shares: ReadonlyArray<number>, bearing: number): number {
    const wedges = wedgeBearingsOf(shares)
    const index = wedges.findIndex(([, to]) => bearing < to)
    return index >= 0 ? index : wedges.length - 1
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
 * @param target What's under the mouse
 * @return What identifies its marker (or cell) from one redraw to the next: the event itself, or the
 * aggregate's roll-up and cell (an aggregate is a new object each time its cell changes), whichever
 * of its groups is under the mouse
 */
export const markerKeyOf = <P, >(target: GeoTooltipMetadata<P>): unknown =>
    target.kind === 'event' ? target.datum : `${target.rollup}::${target.aggregate.id}`

/**
 * @param target What's under the mouse
 * @return What identifies it from one redraw to the next: its marker (see `markerKeyOf`), and, for an
 * aggregate's pie, the group whose wedge is under the mouse
 */
export const keyOf = <P, >(target: GeoTooltipMetadata<P>): unknown =>
    target.kind === 'event' ? target.datum : `${markerKeyOf(target)}::${target.group ?? ''}`

/**
 * @param target What's under the mouse
 * @param series The data source's series, by name
 * @return The series it's of, for the legend to highlight: the event's series, or, for an
 * aggregate's pie, the series the group under the mouse is named for (e.g. a carrier); `null` when
 * it's of no one series (so that the legend is left as it is)
 */
export const legendSeriesOf = <P, >(target: GeoTooltipMetadata<P>, series: ReadonlyMap<string, unknown> | undefined): string | null =>
    target.kind === 'event' ? target.seriesName :
        target.group !== undefined && series?.has(target.group) === true ? target.group : null

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
