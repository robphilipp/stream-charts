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
    const path = (() => null) as unknown as d3.GeoPath

    it('draws a layer of one color at once', () => {
        const {context, fills, strokes} = recordingContext()
        drawLayerShapes(context, path, {data: states, fill: '#ccc', stroke: '#333'}, states)
        expect(fills).toEqual(['#ccc'])
        expect(strokes).toEqual(['#333'])
    })

    it('draws each feature in its own color (a choropleth), and leaves out a feature without one', () => {
        const {context, fills} = recordingContext()
        const colors: Record<string, string | undefined> = {a: 'red', b: undefined}
        drawLayerShapes(context, path, {data: states, fill: feature => colors[feature.properties?.name]}, states)
        expect(fills).toEqual(['red'])
    })
})

describe('labels', () => {
    /**
     * @param bounds Each feature's drawn bounds, by name
     * @return A stand-in for a path generator, drawing the features at those bounds
     */
    const pathFor = (bounds: Record<string, [[number, number], [number, number]]>): d3.GeoPath => {
        const boundsOf = (feature: GeoJSON.Feature): [[number, number], [number, number]] => bounds[feature.properties?.name]
        return Object.assign(() => null, {
            bounds: boundsOf,
            centroid: (feature: GeoJSON.Feature) => {
                const [[x0, y0], [x1, y1]] = boundsOf(feature)
                return [(x0 + x1) / 2, (y0 + y1) / 2]
            },
        }) as unknown as d3.GeoPath
    }
    const labelled = (bounds: Record<string, [[number, number], [number, number]]>): Array<string> => {
        const drawn: Array<string> = []
        const context = {
            save: () => undefined, restore: () => undefined,
            measureText: (text: string) => ({width: 6 * text.length}),
            fillText: (text: string) => drawn.push(text),
        } as unknown as CanvasRenderingContext2D
        const features: d3.GeoPermissibleObjects = {type: 'FeatureCollection', features: Object.keys(bounds).map(name => square(0, 0, 1, name))}
        drawLayerLabels(context, pathFor(bounds), {data: features, label: feature => feature.properties?.name}, features, '#000', WIDTH, HEIGHT)
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
})
