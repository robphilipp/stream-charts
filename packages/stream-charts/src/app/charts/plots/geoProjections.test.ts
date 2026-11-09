import * as d3 from "d3";
import {
    autoLevelOf,
    bearingOf,
    type DrawnMarker,
    flashGroupsOf,
    flashRingOf,
    resolvedFlashes,
    type GeoPlotViewState,
    GeoProjections,
    type GeoProjectionName,
    isGlobe,
    markerAt,
    markerEllipseAt,
    panView,
    placeUnder,
    setUpProjection,
    viewCenteredOn,
    wedgeIndexAt,
    wedgeOf,
    zoomViewAbout,
} from "./geoProjections";
import type {GeoAggregate} from "../datasources/geoRollups";
import {geoDatumOf} from "../series/geoSeries";

const WIDTH = 800
const HEIGHT = 500

const projectionNamed = (name: GeoProjectionName): d3.GeoProjection => GeoProjections[name]()

/**
 * @param projection A projection set up for a view
 * @param point A point of the plot area (on the map)
 * @return The [longitude, latitude] under the point
 */
const placeAt = (projection: d3.GeoProjection, point: [number, number]): [number, number] =>
    placeUnder(projection, point)!

describe('geo views', () => {
    it('centers a view on a longitude and latitude, un-zoomed', () => {
        expect(viewCenteredOn([30, 20])).toEqual({rotate: [-30, -20, 0], k: 1, offsetY: 0})
    })

    it('tells a globe (which clips at an angle) from a flat map', () => {
        expect(isGlobe(projectionNamed('orthographic'))).toBe(true)
        expect(isGlobe(projectionNamed('stereographic'))).toBe(true)
        expect(isGlobe(projectionNamed('mercator'))).toBe(false)
        expect(isGlobe(projectionNamed('naturalEarth1'))).toBe(false)
    })

    it('puts the view\'s center at the middle of the plot area', () => {
        const projection = projectionNamed('orthographic')
        setUpProjection(projection, viewCenteredOn([30, 20]), WIDTH, HEIGHT)
        const [x, y] = projection([30, 20])!
        expect(x).toBeCloseTo(WIDTH / 2, 6)
        expect(y).toBeCloseTo(HEIGHT / 2, 6)
    })

    it('only turns a flat map east and west, ignoring the view\'s tilt', () => {
        const projection = projectionNamed('equirectangular')
        setUpProjection(projection, viewCenteredOn([30, 45]), WIDTH, HEIGHT)
        const [lambda, phi, gamma] = projection.rotate()
        expect(lambda).toBeCloseTo(-30, 9)
        expect(phi).toBeCloseTo(0, 9)
        expect(gamma).toBeCloseTo(0, 9)
    })

    it('keeps a flat map that fits centered, whatever its offset', () => {
        const projection = projectionNamed('naturalEarth1')
        const offsetY = setUpProjection(projection, {...viewCenteredOn([0, 0]), offsetY: 200}, WIDTH, HEIGHT)
        expect(Math.abs(offsetY)).toBeLessThan(1)
    })

    it('limits a zoomed-in flat map\'s offset so that the map always covers the plot area', () => {
        const projection = projectionNamed('mercator')
        const view: GeoPlotViewState = {...viewCenteredOn([0, 0]), k: 4, offsetY: 1e6}
        setUpProjection(projection, view, WIDTH, HEIGHT)
        const [[, top], [, bottom]] = d3.geoPath(projection).bounds({type: 'Sphere'})
        expect(top).toBeCloseTo(0, 3)
        expect(bottom).toBeGreaterThan(HEIGHT)
    })

    describe('dragging', () => {
        it('turns a globe under the mouse: dragging right shows places further west', () => {
            const projection = projectionNamed('orthographic')
            const view = panView(projection, viewCenteredOn([0, 0]), 50, 0, WIDTH, HEIGHT)
            setUpProjection(projection, view, WIDTH, HEIGHT)
            expect(placeAt(projection, [WIDTH / 2, HEIGHT / 2])[0]).toBeLessThan(0)
        })

        it('tilts a globe, but never past a pole', () => {
            const projection = projectionNamed('orthographic')
            const view = panView(projection, viewCenteredOn([0, 0]), 0, 1e6, WIDTH, HEIGHT)
            expect(view.rotate[1]).toBe(-90)
        })

        it('shifts a zoomed-in flat map north and south, without tilting it', () => {
            const projection = projectionNamed('mercator')
            const zoomed: GeoPlotViewState = {...viewCenteredOn([0, 0]), k: 4}
            const view = panView(projection, zoomed, 0, 60, WIDTH, HEIGHT)
            expect(view.offsetY).toBeCloseTo(60, 6)
            expect(view.rotate[1]).toBe(0)
        })
    })

    describe('zooming about a point', () => {
        it.each<GeoProjectionName>(['orthographic', 'azimuthalEqualArea', 'mercator', 'naturalEarth1', 'conicEqualArea'])(
            'keeps the place under the point under it (%s)',
            name => {
                const projection = projectionNamed(name)
                // (starting zoomed in, so that a flat map already covers the plot area: one that
                // fits is kept centered, and can't keep the place under the point vertically)
                let view: GeoPlotViewState = {...viewCenteredOn([10, 20]), k: 2}
                const point: [number, number] = [WIDTH / 2 + 90, HEIGHT / 2 - 60]
                setUpProjection(projection, view, WIDTH, HEIGHT)
                const place = placeAt(projection, point)

                // a few wheel steps in
                for (const k of [2.2, 2.5, 3, 4]) {
                    view = zoomViewAbout(projection, view, k, point, WIDTH, HEIGHT)
                }
                setUpProjection(projection, view, WIDTH, HEIGHT)
                const [x, y] = projection(place)!
                expect(view.k).toBe(4)
                expect(Math.hypot(x - point[0], y - point[1])).toBeLessThan(0.5)
            }
        )

        it('finds no place under a point beyond the globe\'s edge', () => {
            const projection = projectionNamed('orthographic')
            setUpProjection(projection, viewCenteredOn([10, 20]), WIDTH, HEIGHT)
            expect(placeUnder(projection, [2, 2])).toBeUndefined()
            expect(placeUnder(projection, [WIDTH / 2, HEIGHT / 2])).toBeDefined()
        })

        it('zooms about the center when the point is off the globe', () => {
            const projection = projectionNamed('orthographic')
            const view = zoomViewAbout(projection, viewCenteredOn([10, 20]), 2, [2, 2], WIDTH, HEIGHT)
            expect(view.rotate).toEqual([-10, -20, 0])
            expect(view.k).toBe(2)
        })
    })
})

describe('pie wedges', () => {
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

describe('flashes', () => {
    it('grows a ring outward, quickly at first, fading as it grows', () => {
        const start = flashRingOf(0, 1000, 20)!
        const middle = flashRingOf(500, 1000, 20)!
        const late = flashRingOf(900, 1000, 20)!
        expect(start).toEqual({radius: 2, opacity: 1})
        // (three quarters of the way out at half time)
        expect(middle.radius).toBeCloseTo(15.5, 9)
        expect(middle.opacity).toBeCloseTo(0.5, 9)
        expect(late.radius).toBeGreaterThan(middle.radius)
        expect(late.radius).toBeLessThan(20)
        expect(late.opacity).toBeCloseTo(0.1, 9)
    })

    it('flashes an event once, at its place, as the plot\'s settings say -- or not at all', () => {
        const datum = {latitude: 51.5, longitude: -0.1}
        const defaults = {radius: 20, duration: 1500}
        expect(resolvedFlashes(true, datum, defaults)).toEqual([{latitude: 51.5, longitude: -0.1, radius: 20, duration: 1500, color: undefined}])
        expect(resolvedFlashes(false, datum, defaults)).toEqual([])
        expect(resolvedFlashes([], datum, defaults)).toEqual([])
    })

    it('flashes an event as many times as it says, each where, as large, as long, and in the color it says', () => {
        const flashes = resolvedFlashes(
            [{}, {latitude: 51.51, longitude: -0.12, radius: 8, duration: 600, color: '#ffb300'}],
            {latitude: 51.5, longitude: -0.1},
            {radius: 20, duration: 1500},
        )
        expect(flashes).toEqual([
            {latitude: 51.5, longitude: -0.1, radius: 20, duration: 1500, color: undefined},
            {latitude: 51.51, longitude: -0.12, radius: 8, duration: 600, color: '#ffb300'},
        ])
    })

    it('leaves out a flash with no place, or no time to show', () => {
        expect(resolvedFlashes([{latitude: NaN}, {duration: 0}], {latitude: 51.5, longitude: -0.1}, {radius: 20, duration: 1500})).toEqual([])
    })

    it('has no ring before the flash starts, or once it\'s over', () => {
        expect(flashRingOf(-1, 1000, 20)).toBeUndefined()
        expect(flashRingOf(1000, 1000, 20)).toBeUndefined()
        expect(flashRingOf(NaN, 1000, 20)).toBeUndefined()
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

describe('merging flashes', () => {
    const flash = (x: number, y: number, start: number, color: string = 'magenta', duration: number = 1500): {x: number, y: number, start: number, duration: number, color: string} =>
        ({x, y, start, duration, color})

    it('groups the flashes of a color that start within a flash\'s length of each other, close together', () => {
        const groups = flashGroupsOf([flash(100, 100, 1600), flash(104, 103, 2900), flash(130, 100, 1600), flash(101, 101, 1600, 'orange')], 12)
        expect(groups.map(group => group.length).sort()).toEqual([1, 1, 2])
    })

    it('keeps flashes apart that start in different stretches of a flash\'s length, or last different lengths', () => {
        expect(flashGroupsOf([flash(100, 100, 1000), flash(100, 100, 1600)], 12).length).toBe(2)
        expect(flashGroupsOf([flash(100, 100, 1600), flash(100, 100, 1600, 'magenta', 600)], 12).length).toBe(2)
    })

    it('doesn\'t group flashes when the distance is 0', () => {
        expect(flashGroupsOf([flash(100, 100, 1000), flash(100, 100, 1000)], 0).length).toBe(2)
    })
})
