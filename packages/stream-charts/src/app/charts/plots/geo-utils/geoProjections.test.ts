import * as d3 from "d3";
import {
    canTurn,
    type GeoPlotViewState,
    GeoProjections,
    type GeoProjectionName,
    isGlobe,
    panView,
    placeUnder,
    setUpProjection,
    setUpShiftedProjection,
    SHIFT_REFERENCE_VIEW,
    shiftOf,
    shiftView,
    viewCenteredOn,
    viewFitting,
    zoomShiftedViewAbout,
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

describe('fitting a view to a shape', () => {
    // about Colorado: a box of 7° of longitude and 4° of latitude (wound as d3 wants a small polygon)
    const colorado = d3.geoGraticule().extent([[-109, 37], [-102, 41]]).outline()
    const PADDING = 20

    it.each<GeoProjectionName>(['orthographic', 'mercator', 'conicEqualArea'])(
        'frames the shape on the %s projection: centered, filling the area less the padding one way or the other',
        name => {
            const projection = projectionNamed(name)
            const view = viewFitting(projection, colorado, WIDTH, HEIGHT, PADDING)
            setUpProjection(projection, view, WIDTH, HEIGHT)
            const [[x0, y0], [x1, y1]] = d3.geoPath(projection).bounds(colorado)
            expect(view.k).toBeGreaterThan(10)
            // (within the area, less the padding, and filling it across or down)
            expect(x0).toBeGreaterThanOrEqual(PADDING - 1)
            expect(x1).toBeLessThanOrEqual(WIDTH - PADDING + 1)
            expect(y0).toBeGreaterThanOrEqual(PADDING - 1)
            expect(y1).toBeLessThanOrEqual(HEIGHT - PADDING + 1)
            expect(Math.max((x1 - x0) / (WIDTH - 2 * PADDING), (y1 - y0) / (HEIGHT - 2 * PADDING))).toBeCloseTo(1, 1)
            // (centered)
            expect((x0 + x1) / 2).toBeCloseTo(WIDTH / 2, -1)
            expect((y0 + y1) / 2).toBeCloseTo(HEIGHT / 2, -1)
        }
    )

    it('shows the whole sphere, centered on a shape with no size', () => {
        const view = viewFitting(projectionNamed('orthographic'), {type: 'Point', coordinates: [10, 50]}, WIDTH, HEIGHT)
        expect(view.k).toBe(1)
        expect(view.rotate[0]).toBeCloseTo(-10, 9)
        expect(view.rotate[1]).toBeCloseTo(-50, 9)
    })
})

describe('the shift view mode (e.g. for a composite projection)', () => {
    // the lower 48 states, about
    const lower48 = d3.geoGraticule().extent([[-125, 25], [-67, 49]]).outline()
    const start = {rotate: [0, 0, 0] as [number, number, number], k: 1, offsetX: 0, offsetY: 0}
    const kansas: [number, number] = [-98, 38.5]

    it('knows a composite projection can\'t be turned, and isn\'t a globe', () => {
        const albersUsa = GeoProjections.albersUsa()
        expect(canTurn(albersUsa)).toBe(false)
        expect(isGlobe(albersUsa)).toBe(false)
        expect(canTurn(GeoProjections.orthographic())).toBe(true)
    })

    it('fits the base shape into the plot area, less the padding', () => {
        const projection = GeoProjections.albersUsa()
        setUpShiftedProjection(projection, lower48, start, WIDTH, HEIGHT, 20)
        const [[x0, y0], [x1, y1]] = d3.geoPath(projection).bounds(lower48)
        expect(x0).toBeGreaterThanOrEqual(19)
        expect(y0).toBeGreaterThanOrEqual(19)
        expect(x1).toBeLessThanOrEqual(WIDTH - 19)
        expect(y1).toBeLessThanOrEqual(HEIGHT - 19)
        expect(Math.max((x1 - x0) / (WIDTH - 40), (y1 - y0) / (HEIGHT - 40))).toBeCloseTo(1, 2)
    })

    it('zooms about a point, keeping the place under it there', () => {
        const projection = GeoProjections.albersUsa()
        setUpShiftedProjection(projection, lower48, start, WIDTH, HEIGHT)
        const before = projection(kansas)!
        const zoomed = zoomShiftedViewAbout(start, 4, before, WIDTH, HEIGHT)
        setUpShiftedProjection(projection, lower48, zoomed, WIDTH, HEIGHT)
        const after = projection(kansas)!
        expect(after[0]).toBeCloseTo(before[0], 6)
        expect(after[1]).toBeCloseTo(before[1], 6)
        // (and the scale is four times as large)
        const [[x0], [x1]] = d3.geoPath(projection).bounds(lower48)
        setUpShiftedProjection(projection, lower48, start, WIDTH, HEIGHT)
        const [[ux0], [ux1]] = d3.geoPath(projection).bounds(lower48)
        expect((x1 - x0) / (ux1 - ux0)).toBeCloseTo(4, 3)
    })

    it('shifts the map as far as it\'s dragged', () => {
        const projection = GeoProjections.albersUsa()
        setUpShiftedProjection(projection, lower48, start, WIDTH, HEIGHT)
        const before = projection(kansas)!
        setUpShiftedProjection(projection, lower48, shiftView(start, 30, -20), WIDTH, HEIGHT)
        const after = projection(kansas)!
        expect(after[0] - before[0]).toBeCloseTo(30, 6)
        expect(after[1] - before[1]).toBeCloseTo(-20, 6)
    })

    it('finds the places under the plot area\'s points, but none off its regions', () => {
        const projection = GeoProjections.albersUsa()
        setUpShiftedProjection(projection, lower48, start, WIDTH, HEIGHT)
        const place = placeUnder(projection, projection(kansas)!)!
        expect(place[0]).toBeCloseTo(kansas[0], 6)
        expect(place[1]).toBeCloseTo(kansas[1], 6)
        // (far beyond the regions -- each a rectangle, the sea around its land included)
        expect(placeUnder(projection, [-WIDTH, -HEIGHT])).toBeUndefined()
    })

    it('takes a view to a scale and slide of the reference view, for a composite and for a conic', () => {
        const places: Array<[number, number]> = [kansas, [-74, 40.7], [-122.4, 37.8], [-150, 61.2], [-157.8, 21.3]]
        const views = [{...start, k: 3, offsetX: -250, offsetY: 120}, {...start, k: 0.5, offsetX: 40, offsetY: -10}]
        for (const name of ['albersUsa', 'conicEqualArea'] as Array<GeoProjectionName>) {
            const reference = GeoProjections[name]()
            setUpShiftedProjection(reference, lower48, SHIFT_REFERENCE_VIEW, WIDTH, HEIGHT, 20)
            const projected = places.map(place => reference(place)!)
            for (const view of views) {
                const projection = GeoProjections[name]()
                setUpShiftedProjection(projection, lower48, view, WIDTH, HEIGHT, 20)
                const {k, x0, y0} = shiftOf(view, WIDTH, HEIGHT)
                places.forEach((place, i) => {
                    const [x, y] = projection(place)!
                    expect(k * projected[i][0] + x0).toBeCloseTo(x, 6)
                    expect(k * projected[i][1] + y0).toBeCloseTo(y, 6)
                })
            }
        }
    })
})
