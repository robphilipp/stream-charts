import * as d3 from "d3";
import {
    bearingOf,
    type GeoPlotViewState,
    GeoProjections,
    type GeoProjectionName,
    isGlobe,
    panView,
    placeUnder,
    setUpProjection,
    viewCenteredOn,
    wedgeIndexAt,
    wedgeOf,
    zoomViewAbout,
} from "./geoProjections";

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

