import * as d3 from "d3";
import {
    boxesOverlap,
    detailOf,
    drawLayerLabels,
    drawLayerShapes,
    featuresOf,
    type GeoLayer,
    layerShownAt,
    viewBoxOf,
    visibleOf,
} from "./geoLayers";
import {GeoProjections, setUpProjection, setUpShiftedProjection, viewCenteredOn} from "./geoProjections";
import {directPen, type GeoPen} from "./geoPens";

const WIDTH = 800
const HEIGHT = 500

const square = (west: number, south: number, size: number, name: string): GeoJSON.Feature => ({
    type: 'Feature',
    properties: {name},
    geometry: d3.geoGraticule().extent([[west, south], [west + size, south + size]]).outline(),
})
const coarse: d3.GeoPermissibleObjects = {type: 'Sphere'}
const fine: d3.GeoPermissibleObjects = {type: 'FeatureCollection', features: []}

describe('map detail by zoom', () => {
    it('draws the version from the highest zoom at or below the zoom', () => {
        const details = [{minZoom: 8, data: fine}, {minZoom: 1, data: coarse}]
        expect(detailOf(details, 1)).toBe(coarse)
        expect(detailOf(details, 7.9)).toBe(coarse)
        expect(detailOf(details, 8)).toBe(fine)
        expect(detailOf(details, 100)).toBe(fine)
        // (below them all: the coarsest)
        expect(detailOf(details, 0.5)).toBe(coarse)
        // (plain GeoJSON: itself)
        expect(detailOf(fine, 3)).toBe(fine)
    })

    it('shows a layer only at the zooms it says', () => {
        const layer: GeoLayer = {data: fine, minZoom: 4, maxZoom: 40}
        expect(layerShownAt(layer, 3)).toBe(false)
        expect(layerShownAt(layer, 4)).toBe(true)
        expect(layerShownAt(layer, 41)).toBe(false)
        expect(layerShownAt({data: fine}, 1000)).toBe(true)
    })
})

describe('features', () => {
    it('finds the features of a collection, a feature, or a geometry', () => {
        const feature = square(0, 0, 1, 'a')
        expect(featuresOf({type: 'FeatureCollection', features: [feature]})).toEqual([feature])
        expect(featuresOf(feature)).toEqual([feature])
        expect(featuresOf(feature.geometry as d3.GeoPermissibleObjects)).toEqual([{type: 'Feature', geometry: feature.geometry, properties: {}}])
    })
})

describe('trimming to the view', () => {
    it('finds the boxes that overlap, across the antimeridian too', () => {
        expect(boxesOverlap({west: 0, south: 0, east: 10, north: 10}, {west: 5, south: 5, east: 15, north: 15})).toBe(true)
        expect(boxesOverlap({west: 0, south: 0, east: 10, north: 10}, {west: 20, south: 0, east: 30, north: 10})).toBe(false)
        expect(boxesOverlap({west: 170, south: 0, east: -170, north: 10}, {west: -175, south: 5, east: -160, north: 8})).toBe(true)
        expect(boxesOverlap({west: 170, south: 0, east: -170, north: 10}, {west: 0, south: 0, east: 10, north: 10})).toBe(false)
    })

    it('finds the part of the earth that a zoomed-in view shows, and none (everything) for a whole globe', () => {
        const projection = GeoProjections.orthographic()
        setUpProjection(projection, {...viewCenteredOn([-0.13, 51.5]), k: 50}, WIDTH, HEIGHT)
        const box = viewBoxOf(projection, WIDTH, HEIGHT)!
        expect(box.west).toBeLessThan(-0.13)
        expect(box.east).toBeGreaterThan(-0.13)
        expect(box.south).toBeLessThan(51.5)
        expect(box.north).toBeGreaterThan(51.5)
        expect(box.east - box.west).toBeLessThan(20)

        setUpProjection(projection, viewCenteredOn([0, 20]), WIDTH, HEIGHT)
        expect(viewBoxOf(projection, WIDTH, HEIGHT)).toBeUndefined()
    })

    it('finds the part of the earth shown over the gaps of a composite projection (e.g. the sea around Albers USA\'s regions)', () => {
        const projection = GeoProjections.albersUsa()
        // (the map shifted half out of the plot area, to the right and down: its top-left quarter is
        // off the map's regions)
        const lower48 = d3.geoGraticule().extent([[-125, 25], [-67, 49]]).outline()
        setUpShiftedProjection(projection, lower48, {rotate: [0, 0, 0], k: 1, offsetX: WIDTH / 2, offsetY: HEIGHT / 2}, WIDTH, HEIGHT)
        expect(viewBoxOf(projection, WIDTH, HEIGHT)).toBeUndefined()
        const box = viewBoxOf(projection, WIDTH, HEIGHT, 9, true)!
        // (the north-west of the lower 48 is what shows)
        expect(box.west).toBeLessThan(-115)
        expect(box.north).toBeGreaterThan(45)
    })

    it('keeps only the features that overlap the view (and everything without a view)', () => {
        const near = square(0, 50, 1, 'near')
        const far = square(100, -30, 1, 'far')
        const collection: d3.GeoPermissibleObjects = {type: 'FeatureCollection', features: [near, far]}
        const box = {west: -2, south: 48, east: 3, north: 53}
        expect((visibleOf(collection, box) as GeoJSON.FeatureCollection).features).toEqual([near])
        expect(visibleOf(collection, undefined)).toBe(collection)
        expect(visibleOf(near, box)).toEqual(near)
    })

    it('keeps only the parts of a multi-polygon, or a multi-line, that overlap the view (e.g. of one shape of all the land)', () => {
        const near = (square(0, 50, 1, 'near').geometry as GeoJSON.Polygon).coordinates
        const far = (square(100, -30, 1, 'far').geometry as GeoJSON.Polygon).coordinates
        const land: GeoJSON.MultiPolygon = {type: 'MultiPolygon', coordinates: [near, far]}
        const box = {west: -2, south: 48, east: 3, north: 53}
        expect(visibleOf(land, box)).toEqual({type: 'MultiPolygon', coordinates: [near]})
        const feature: GeoJSON.Feature = {type: 'Feature', properties: {}, geometry: land}
        expect((visibleOf({type: 'FeatureCollection', features: [feature]}, box) as GeoJSON.FeatureCollection).features[0].geometry)
            .toEqual({type: 'MultiPolygon', coordinates: [near]})
        const borders: GeoJSON.MultiLineString = {type: 'MultiLineString', coordinates: [[[0, 50], [1, 51]], [[100, -30], [101, -29]]]}
        expect(visibleOf(borders, box)).toEqual({type: 'MultiLineString', coordinates: [[[0, 50], [1, 51]]]})
    })
})

describe('drawing layers', () => {
    /**
     * @return A stand-in for a canvas context, recording the colors its shapes were filled and
     * stroked with
     */
    function recordingContext(): {context: CanvasRenderingContext2D, fills: Array<string>, strokes: Array<string>} {
        const fills: Array<string> = []
        const strokes: Array<string> = []
        const state: Record<string, unknown> = {}
        const context = {
            save: () => undefined, restore: () => undefined, beginPath: () => undefined,
            fill: () => fills.push(state.fillStyle as string),
            stroke: () => strokes.push(state.strokeStyle as string),
            set fillStyle(value: string) { state.fillStyle = value },
            set strokeStyle(value: string) { state.strokeStyle = value },
            set lineWidth(value: number) { state.lineWidth = value },
            set globalAlpha(value: number) { state.globalAlpha = value },
        }
        return {context: context as unknown as CanvasRenderingContext2D, fills, strokes}
    }
    const states: d3.GeoPermissibleObjects = {type: 'FeatureCollection', features: [square(0, 0, 1, 'a'), square(2, 0, 1, 'b')]}
    const traced: Array<d3.GeoPermissibleObjects> = []
    const pen = directPen(((object: d3.GeoPermissibleObjects) => traced.push(object)) as unknown as d3.GeoPath)

    it('draws a layer of one color at once', () => {
        const {context, fills, strokes} = recordingContext()
        drawLayerShapes(context, pen, {data: states, fill: '#ccc', stroke: '#333'}, states)
        expect(fills).toEqual(['#ccc'])
        expect(strokes).toEqual(['#333'])
    })

    it('draws each feature in its own color (a choropleth), and leaves out a feature without one', () => {
        const {context, fills} = recordingContext()
        const colors: Record<string, string | undefined> = {a: 'red', b: undefined}
        drawLayerShapes(context, pen, {data: states, fill: feature => colors[feature.properties?.name]}, states)
        expect(fills).toEqual(['red'])
    })

    it("doesn't trace a layer of labels alone (with neither a fill nor an outline)", () => {
        const {context, fills, strokes} = recordingContext()
        traced.length = 0
        drawLayerShapes(context, pen, {data: states, label: feature => feature.properties?.name}, states)
        expect(traced).toEqual([])
        expect(fills).toEqual([])
        expect(strokes).toEqual([])
    })
})

describe('labels', () => {
    /**
     * @param bounds Each feature's drawn bounds, by name
     * @return A pen drawing the features at those bounds
     */
    const penFor = (bounds: Record<string, [[number, number], [number, number]]>): GeoPen => {
        const boundsOf = (feature: GeoJSON.Feature): [[number, number], [number, number]] => bounds[feature.properties?.name]
        return {
            draw: () => undefined,
            bounds: boundsOf,
            centroid: feature => {
                const [[x0, y0], [x1, y1]] = boundsOf(feature)
                return [(x0 + x1) / 2, (y0 + y1) / 2]
            },
        }
    }
    const labelled = (bounds: Record<string, [[number, number], [number, number]]>): Array<string> => {
        const drawn: Array<string> = []
        const context = {
            save: () => undefined, restore: () => undefined,
            measureText: (text: string) => ({width: 6 * text.length}),
            fillText: (text: string) => drawn.push(text),
        } as unknown as CanvasRenderingContext2D
        const features: d3.GeoPermissibleObjects = {type: 'FeatureCollection', features: Object.keys(bounds).map(name => square(0, 0, 1, name))}
        drawLayerLabels(context, penFor(bounds), {data: features, label: feature => feature.properties?.name}, features, '#000', WIDTH, HEIGHT)
        return drawn
    }

    it('labels the features wholly in view whose labels fit inside them', () => {
        expect(labelled({
            spacious: [[100, 100], [300, 200]],
            tiny: [[100, 100], [110, 105]],
        })).toEqual(['spacious'])
    })

    it('doesn\'t label a feature cut by the plot area\'s edges', () => {
        expect(labelled({huge: [[-4, -4], [WIDTH + 4, HEIGHT + 4]], partly: [[WIDTH - 100, 100], [WIDTH + 50, 200]]})).toEqual([])
    })

    describe('on a globe', () => {
        // (a globe filling the plot area, looking at 0° E, 0° N)
        const globe = (rotate: [number, number]): d3.GeoProjection =>
            d3.geoOrthographic().fitSize([WIDTH, HEIGHT], {type: 'Sphere'}).rotate(rotate)
        const at = (projection: d3.GeoProjection, feature: GeoJSON.Feature): [number, number] =>
            directPen(d3.geoPath(projection)).centroid(feature)

        it('places a label at the middle of the whole feature, not of the part in sight', () => {
            // (a square from 85° E to 105° E: the globe's edge, at 90° E, cuts it, leaving its middle
            // out of sight)
            const cut = square(85, 0, 20, 'cut')
            const [x, y] = at(globe([0, 0]), cut)
            expect(x).toBeNaN()
            expect(y).toBeNaN()
            // (turned 30° west, the square is in sight, and its label in its middle)
            const projection = globe([-30, 0])
            const [x1, y1] = at(projection, cut)
            const [mx, my] = projection(d3.geoCentroid(cut)) as [number, number]
            expect(x1).toBeCloseTo(mx, 0)
            expect(y1).toBeCloseTo(my, 0)
        })

        it("places a feature in pieces' label at the middle of its largest piece", () => {
            const pieces: GeoJSON.Feature = {
                type: 'Feature',
                properties: {name: 'pieces'},
                geometry: {
                    type: 'MultiPolygon',
                    coordinates: [square(30, 40, 4, 'small'), square(-20, 0, 20, 'large')]
                        .map(piece => (piece.geometry as GeoJSON.Polygon).coordinates),
                },
            }
            const projection = globe([0, 0])
            const [x, y] = at(projection, pieces)
            const [mx, my] = projection(d3.geoCentroid(square(-20, 0, 20, 'large'))) as [number, number]
            expect(x).toBeCloseTo(mx, 6)
            expect(y).toBeCloseTo(my, 6)
        })

        it('keeps a label in place on the feature as the globe turns it out of sight', () => {
            // (a square from 30° W to 0° E: turned 70° west, the globe's edge, at 20° W, cuts it)
            const feature = square(-30, 20, 30, 'turning')
            const offsets = [0, -40, -70].map(turn => {
                const projection = globe([turn, 0])
                const [x, y] = at(projection, feature)
                const [mx, my] = projection(d3.geoCentroid(feature)) as [number, number]
                return [x - mx, y - my]
            })
            offsets.forEach(([dx, dy]) => {
                expect(dx).toBeCloseTo(0, 6)
                expect(dy).toBeCloseTo(0, 6)
            })
        })
    })
})

describe('points (e.g. cities)', () => {
    const city = (name: string): GeoJSON.Feature => ({type: 'Feature', properties: {name}, geometry: {type: 'Point', coordinates: [0, 0]}})
    /**
     * @param places Where each city is drawn, by name
     * @return A pen drawing the cities there (and recording any shapes it's asked to draw)
     */
    const penAt = (places: Record<string, [number, number]>): GeoPen & {shapes: Array<unknown>} => {
        const shapes: Array<unknown> = []
        return {
            shapes,
            draw: (_, object) => shapes.push(object),
            bounds: () => [[0, 0], [0, 0]],
            centroid: feature => places[feature.properties?.name],
        }
    }

    it('draws each point as a dot of the layer\'s radius at its place, rather than as a shape', () => {
        const dots: Array<string> = []
        const context = {
            save: () => undefined, restore: () => undefined, beginPath: () => undefined, fill: () => undefined,
            arc: (x: number, y: number, radius: number) => dots.push(`${x},${y} r${radius}`),
            set fillStyle(_: string) { /* (unrecorded) */ },
            set globalAlpha(_: number) { /* (unrecorded) */ },
        } as unknown as CanvasRenderingContext2D
        const cities: d3.GeoPermissibleObjects = {type: 'FeatureCollection', features: [city('near'), city('far side')]}
        const pen = penAt({'near': [100, 50], 'far side': [NaN, NaN]})
        drawLayerShapes(context, pen, {data: cities, fill: '#333', pointRadius: 3}, cities)
        // (and nothing for a point the projection can't show, e.g. on a globe's far side)
        expect(dots).toEqual(['100,50 r3'])
        expect(pen.shapes).toEqual([])
    })

    it('labels each point beside its dot, unless its label would overlap one drawn before it, or leave the plot area', () => {
        const drawn: Array<string> = []
        const context = {
            save: () => undefined, restore: () => undefined,
            measureText: (text: string) => ({width: 6 * text.length}),
            fillText: (text: string, x: number, y: number) => drawn.push(`${text} ${x},${y}`),
        } as unknown as CanvasRenderingContext2D
        const names = ['Chicago', 'Evanston', 'Gary', 'Edge']
        const cities: d3.GeoPermissibleObjects = {type: 'FeatureCollection', features: names.map(city)}
        const pen = penAt({Chicago: [100, 100], Evanston: [110, 95], Gary: [100, 140], Edge: [WIDTH - 5, 100]})
        drawLayerLabels(context, pen, {data: cities, label: feature => feature.properties?.name}, cities, '#000', WIDTH, HEIGHT)
        // (beside the dot: past its radius, 2.5, and a gap of 3)
        expect(drawn).toEqual(['Chicago 105.5,100', 'Gary 105.5,140'])
    })
})
