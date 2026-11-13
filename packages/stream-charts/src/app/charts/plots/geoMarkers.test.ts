import * as d3 from "d3";
import {
    GeoProjections,
    type GeoProjectionName,
    setUpProjection,
    viewCenteredOn,
} from "./geoProjections";
import {
    autoLevelOf,
    bearingOf,
    type DrawnMarker,
    markerAt,
    markerEllipseAt,
    wedgeBearingsOf,
    wedgeIndexAt,
    wedgeOf,
} from "./geoMarkers";
import type {GeoAggregate} from "../datasources/geoRollups";
import {geoDatumOf} from "../series/geoSeries";

const WIDTH = 800
const HEIGHT = 500

const projectionNamed = (name: GeoProjectionName): d3.GeoProjection => GeoProjections[name]()

describe('pie wedges', () => {
    it('spans each group by its share, clockwise from north', () => {
        expect(wedgeBearingsOf([1, 2, 1])).toEqual([[0, 90], [90, 270], [270, 360]])
        expect(wedgeBearingsOf([])).toEqual([])
        expect(wedgeBearingsOf([0, 0])).toEqual([])
    })

    it('gives the bearing from one place to another, clockwise from north', () => {
        expect(bearingOf([0, 0], [0, 10])).toBeCloseTo(0, 9)
        expect(bearingOf([0, 0], [10, 0])).toBeCloseTo(90, 9)
        expect(bearingOf([0, 0], [0, -10])).toBeCloseTo(180, 9)
        expect(bearingOf([0, 0], [-10, 0])).toBeCloseTo(270, 9)
    })

    it('draws a wedge that covers its share of the circle (wound so that d3 sees a small polygon)', () => {
        const center: [number, number] = [20, 45]
        const circle = d3.geoArea(d3.geoCircle().center(center).radius(3).precision(1)())
        const half = d3.geoArea(wedgeOf(center, 3, 0, 180, 1))
        const otherHalf = d3.geoArea(wedgeOf(center, 3, 180, 360, 1))
        expect(half / circle).toBeCloseTo(0.5, 2)
        expect(otherHalf / circle).toBeCloseTo(0.5, 2)
        expect(d3.geoArea(wedgeOf(center, 3, 0, 90, 1)) / circle).toBeCloseTo(0.25, 2)
    })

    it('puts the wedge\'s arc on the circle, from its starting bearing to its ending one', () => {
        const center: [number, number] = [-70, -33]
        const ring = wedgeOf(center, 2, 30, 120, 5).coordinates[0]
        const arc = ring.slice(1, -1) as Array<[number, number]>
        arc.forEach(point => expect(d3.geoDistance(center, point) * 180 / Math.PI).toBeCloseTo(2, 9))
        expect(bearingOf(center, arc[0])).toBeCloseTo(30, 6)
        expect(bearingOf(center, arc[arc.length - 1])).toBeCloseTo(120, 6)
    })

    it('finds the wedge that holds a bearing', () => {
        // shares of 1, 2, and 1: wedges from 0° to 90°, 90° to 270°, and 270° to 360°
        expect(wedgeIndexAt([1, 2, 1], 45)).toBe(0)
        expect(wedgeIndexAt([1, 2, 1], 90)).toBe(1)
        expect(wedgeIndexAt([1, 2, 1], 269)).toBe(1)
        expect(wedgeIndexAt([1, 2, 1], 300)).toBe(2)
        expect(wedgeIndexAt([], 45)).toBe(-1)
    })
})

describe('hit-testing the markers', () => {
    /**
     * @param id The aggregate's (cell's) ID
     * @param x The x of its circle's center
     * @param y The y of its circle's center
     * @param radius The radius of its circle
     * @return The aggregate's drawn marker
     */
    const aggregateMarker = (id: string, x: number, y: number, radius: number): DrawnMarker<unknown> => ({
        x, y, hitRadius: radius,
        target: {kind: 'aggregate', rollup: 'r', aggregate: {id} as GeoAggregate},
    })
    const eventMarker = (sensorId: string, x: number, y: number, hitRadius: number): DrawnMarker<unknown> => ({
        x, y, hitRadius,
        target: {kind: 'event', seriesName: 's', datum: geoDatumOf(sensorId, 0, 0, 0, {})},
    })
    const markersOf = (markers: Array<DrawnMarker<unknown>>): d3.Quadtree<DrawnMarker<unknown>> =>
        d3.quadtree<DrawnMarker<unknown>>().x(marker => marker.x).y(marker => marker.y).addAll(markers)
    const maxRadiusOf = (markers: Array<DrawnMarker<unknown>>): number => Math.max(...markers.map(marker => marker.hitRadius))
    const idAt = (markers: Array<DrawnMarker<unknown>>, x: number, y: number): string | undefined => {
        const target = markerAt(markersOf(markers), maxRadiusOf(markers), x, y)?.target
        return target === undefined ? undefined : target.kind === 'aggregate' ? target.aggregate.id : target.datum.sensorId
    }

    it('finds a large circle under the mouse, even when a small circle\'s center is nearer', () => {
        // the mouse is inside the large circle, and nearer the small one's center, but out of its reach
        const markers = [aggregateMarker('large', 100, 100, 30), aggregateMarker('small', 125, 100, 5)]
        expect(idAt(markers, 115, 100)).toBe('large')
    })

    it('finds the small circle, drawn over a large one, when the mouse is over both', () => {
        const markers = [aggregateMarker('large', 100, 100, 30), aggregateMarker('small', 110, 100, 5)]
        expect(idAt(markers, 108, 100)).toBe('small')
        expect(idAt(markers, 100, 100)).toBe('large')
    })

    it('finds the nearest event that reaches the mouse', () => {
        const markers = [eventMarker('far', 100, 100, 12), eventMarker('near', 106, 100, 6)]
        expect(idAt(markers, 104, 100)).toBe('near')
        expect(idAt(markers, 95, 100)).toBe('far')
    })

    it('finds nothing where no marker reaches the mouse', () => {
        const markers = [aggregateMarker('a', 100, 100, 10), eventMarker('b', 200, 200, 6)]
        expect(idAt(markers, 150, 150)).toBeUndefined()
        expect(markerAt(markersOf([]), 0, 10, 10)).toBeUndefined()
    })
})

describe('marker ellipses', () => {
    /**
     * How far (px) the points of a small circle on the earth, projected exactly, are from the ellipse
     * its marker is drawn as
     * @param projection The projection, set up for a view
     * @param longitude The circle's center's longitude
     * @param latitude The circle's center's latitude
     * @param radius The circle's radius (px at the view's center)
     * @return The largest distance (px), or `undefined` when the marker is drawn exactly (no ellipse)
     */
    const largestError = (projection: d3.GeoProjection, longitude: number, latitude: number, radius: number): number | undefined => {
        const degreesPerPixel = 180 / Math.PI / projection.scale()
        const center = projection([longitude, latitude])!
        const ellipse = markerEllipseAt(projection, center, longitude, latitude, radius, degreesPerPixel)
        if (ellipse === undefined) return undefined
        const [x, y, radiusX, radiusY, rotation] = ellipse
        const ring = d3.geoCircle().center([longitude, latitude]).radius(radius * degreesPerPixel).precision(5)().coordinates[0]
        return ring.reduce((largest, point) => {
            const [px, py] = projection(point as [number, number])!
            // the point, in the ellipse's own frame (on the ellipse at a normalized distance of 1), and
            // how far it is from the ellipse along the ray from the ellipse's center
            const dx = px - x, dy = py - y
            const u = (dx * Math.cos(rotation) + dy * Math.sin(rotation)) / radiusX
            const v = (-dx * Math.sin(rotation) + dy * Math.cos(rotation)) / radiusY
            return Math.max(largest, Math.hypot(dx, dy) * Math.abs(1 - 1 / Math.hypot(u, v)))
        }, 0)
    }

    it.each<[GeoProjectionName, number, number, number]>([
        ['orthographic', 0, 20, 12],      // the view's center
        ['orthographic', 70, 30, 12],     // toward the globe's edge (flattened)
        ['orthographic', -60, -40, 12],
        ['mercator', 20, 60, 3],          // toward a Mercator map's pole (stretched)
        ['equirectangular', 120, -35, 12],
        ['stereographic', 100, 10, 6],
        ['conicEqualArea', -80, 45, 12],
    ])('draws a small circle on the %s projection, at %d° %d°, as the ellipse it projects to', (name, longitude, latitude, radius) => {
        const projection = projectionNamed(name)
        setUpProjection(projection, viewCenteredOn([0, 20]), WIDTH, HEIGHT)
        expect(largestError(projection, longitude, latitude, radius)).toBeLessThan(0.5)
    })

    it('draws a marker exactly where the projection is lopsided over it, near a pole, or across a flat map\'s antimeridian', () => {
        const mercator = projectionNamed('mercator')
        setUpProjection(mercator, viewCenteredOn([0, 20]), WIDTH, HEIGHT)
        expect(largestError(mercator, 20, 70, 12)).toBeUndefined()

        const globe = projectionNamed('orthographic')
        setUpProjection(globe, viewCenteredOn([0, 60]), WIDTH, HEIGHT)
        expect(largestError(globe, 10, 89.5, 6)).toBeUndefined()

        const flat = projectionNamed('equirectangular')
        setUpProjection(flat, viewCenteredOn([0, 0]), WIDTH, HEIGHT)
        expect(largestError(flat, 179.9, 0, 6)).toBeUndefined()
    })
})

describe('the auto mode\'s levels', () => {
    // a grid of 10°, 1°, and 0.1° cells, at a zoom where a degree spans `perDegree` px
    const levels = (perDegree: number): Array<{rollup: string, cellPixels: number}> =>
        [['10°', 10], ['1°', 1], ['0.1°', 0.1]].map(([rollup, degrees]) => ({rollup: rollup as string, cellPixels: (degrees as number) * perDegree}))

    it('shows the coarsest roll-up whose cells span at most the distance, or else the events', () => {
        // (zoomed out: 10° cells span 66 px, 1° cells 6.6 px)
        expect(autoLevelOf(levels(6.6), 20, null)).toBe('1°')
        // (further out: even 10° cells span less)
        expect(autoLevelOf(levels(1.5), 20, null)).toBe('10°')
        // (zoomed in: 0.1° cells span 30 px)
        expect(autoLevelOf(levels(300), 20, null)).toBeUndefined()
        expect(autoLevelOf(levels(150), 20, null)).toBe('0.1°')
    })

    it('keeps showing a level a little past its boundaries, so that it doesn\'t flicker', () => {
        // (1° cells grow past the distance, but not by a quarter)
        expect(autoLevelOf(levels(22), 20, '1°')).toBe('1°')
        expect(autoLevelOf(levels(26), 20, '1°')).toBe('0.1°')
        // (zooming back out: the coarser 1° cells shrink below the distance, but not by a quarter)
        expect(autoLevelOf(levels(18), 20, '0.1°')).toBe('0.1°')
        expect(autoLevelOf(levels(15), 20, '0.1°')).toBe('1°')
        // (the events, while the finest cells are only a little smaller than the distance)
        expect(autoLevelOf(levels(180), 20, undefined)).toBeUndefined()
        expect(autoLevelOf(levels(150), 20, undefined)).toBe('0.1°')
    })
})

