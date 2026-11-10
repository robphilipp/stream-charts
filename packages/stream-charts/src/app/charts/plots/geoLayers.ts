import * as d3 from "d3"
import {placeUnder} from "./geoProjections"

/**
 * One version of a map's data, for zooms from `minZoom` in (see {@link GeoMapData}): e.g. coarse land
 * from 1, and finer land from 8
 */
export interface GeoDetail {
    /**
     * The zoom (a factor of the scale that fits the whole sphere) from which this version is drawn
     */
    readonly minZoom: number
    /**
     * The version's GeoJSON
     */
    readonly data: d3.GeoPermissibleObjects
}

/**
 * A map's data (see the {@link GeoPlot}'s `basemap`, `borders`, and `layers`): GeoJSON, or versions of
 * it at different levels of detail, each drawn from its own zoom in (see {@link GeoDetail}) -- so that
 * a coarse version is drawn zoomed out, where the detail couldn't be seen, and quickly, and a finer
 * one zoomed in
 */
export type GeoMapData = d3.GeoPermissibleObjects | ReadonlyArray<GeoDetail>

/**
 * A layer of the map, drawn over the basemap (and under the borders): e.g. the states of a country,
 * colored by a value of each (a choropleth), the roads, or the lakes
 */
export interface GeoLayer {
    /**
     * The layer's GeoJSON (or its versions by zoom, see {@link GeoMapData})
     */
    readonly data: GeoMapData
    /**
     * The fill of the layer's areas: a color, or a feature's color (e.g. by one of its properties;
     * `undefined` leaves the feature unfilled). Not filled when not set.
     */
    readonly fill?: string | ((feature: GeoJSON.Feature) => string | undefined)
    /**
     * The color of the layer's lines (and of its areas' outlines): a color, or a feature's color.
     * Not stroked when not set.
     */
    readonly stroke?: string | ((feature: GeoJSON.Feature) => string | undefined)
    /**
     * The width (px) of the layer's lines. Defaults to 0.5.
     */
    readonly lineWidth?: number
    /**
     * The opacity of the layer (0 to 1). Defaults to 1.
     */
    readonly opacity?: number
    /**
     * The zooms (a factor of the scale that fits the whole sphere) at which the layer is drawn: from
     * `minZoom` (defaults to 0) to `maxZoom` (defaults to no limit) -- e.g. counties only once
     * zoomed in on a state
     */
    readonly minZoom?: number
    readonly maxZoom?: number
    /**
     * A feature's label (e.g. its name), drawn at its middle when the feature is wholly in view, and
     * the label fits inside it as drawn (so that labels come and go with the zoom, rather than piling
     * up); no labels when not set
     */
    readonly label?: (feature: GeoJSON.Feature) => string | undefined
    /**
     * The color of the labels. Defaults to the chart's color.
     */
    readonly labelColor?: string
    /**
     * The labels' font (a CSS font). Defaults to `11px sans-serif`.
     */
    readonly labelFont?: string
}

/**
 * The part of the earth a view shows, as a longitude and latitude box (degrees). A box whose west
 * is east of its east crosses the antimeridian.
 */
export type GeoBox = {west: number, south: number, east: number, north: number}

/**
 * @param data A map's data
 * @param zoom The zoom
 * @return The version of the data to draw at the zoom: the one from the highest zoom at or below it
 * (or, below them all, the one from the lowest)
 */
export function detailOf(data: GeoMapData, zoom: number): d3.GeoPermissibleObjects | undefined {
    if (!Array.isArray(data)) return data as d3.GeoPermissibleObjects
    const details = [...(data as ReadonlyArray<GeoDetail>)].sort((a, b) => a.minZoom - b.minZoom)
    const fitting = details.filter(detail => detail.minZoom <= zoom)
    return (fitting[fitting.length - 1] ?? details[0])?.data
}

/**
 * @param layer A layer
 * @param zoom The zoom
 * @return Whether the layer is drawn at the zoom (see its `minZoom` and `maxZoom`)
 */
export const layerShownAt = (layer: GeoLayer, zoom: number): boolean =>
    zoom >= (layer.minZoom ?? 0) && zoom <= (layer.maxZoom ?? Infinity)

/**
 * @param object GeoJSON
 * @return Its features: a feature collection's, a feature itself, or a geometry as a feature
 */
export function featuresOf(object: d3.GeoPermissibleObjects): Array<GeoJSON.Feature> {
    const geo = object as GeoJSON.GeoJSON | {type: 'Sphere'}
    if (geo.type === 'FeatureCollection') return geo.features
    if (geo.type === 'Feature') return [geo]
    if (geo.type === 'Sphere') return []
    return [{type: 'Feature', geometry: geo as GeoJSON.Geometry, properties: {}}]
}

/**
 * The part of the earth that the plot area shows, found by putting a grid of points over the area,
 * and finding the places under them: `undefined` (everything, as far as culling goes) when a point
 * is off the map (e.g. beyond a globe's edge, so that a globe's whole hemisphere shows), or when the
 * places span half the earth or more
 * @param projection The projection, set up for the view
 * @param width The width (px) of the plot area
 * @param height The height (px) of the plot area
 * @param steps The grid's points along each side
 * @param gaps Whether a point off the map is only a gap in it (e.g. the sea between a composite
 * projection's regions, like Albers USA's), rather than a sign that the view shows everything
 * @return The box of longitudes and latitudes shown, a little larger (a tenth) to be safe, or
 * `undefined`
 */
export function viewBoxOf(projection: d3.GeoProjection, width: number, height: number, steps: number = 9, gaps: boolean = false): GeoBox | undefined {
    if (!(width > 0 && height > 0)) return undefined
    const places: Array<[number, number]> = []
    for (let i = 0; i < steps; i++) {
        for (let j = 0; j < steps; j++) {
            const place = placeUnder(projection, [width * i / (steps - 1), height * j / (steps - 1)])
            if (place !== undefined) places.push(place)
            else if (!gaps) return undefined
        }
    }
    if (places.length === 0) return undefined
    // (the longitudes are taken relative to the view's middle, so that a box across the antimeridian
    // comes out right)
    const [middleLongitude] = places[Math.floor(places.length / 2)]
    const relative = places.map(([longitude]) => ((longitude - middleLongitude + 540) % 360) - 180)
    const west = Math.min(...relative), east = Math.max(...relative)
    const south = Math.min(...places.map(([, latitude]) => latitude))
    const north = Math.max(...places.map(([, latitude]) => latitude))
    if (east - west >= 180 || north - south >= 90) return undefined
    const marginX = (east - west) / 10, marginY = (north - south) / 10
    const wrap = (longitude: number): number => ((longitude + 540) % 360) - 180
    return {
        west: wrap(middleLongitude + west - marginX),
        east: wrap(middleLongitude + east + marginX),
        south: Math.max(-90, south - marginY),
        north: Math.min(90, north + marginY),
    }
}

/**
 * @param a A box
 * @param b Another box
 * @return Whether the boxes overlap (either may cross the antimeridian)
 */
export function boxesOverlap(a: GeoBox, b: GeoBox): boolean {
    if (a.north < b.south || b.north < a.south) return false
    // (each box's longitudes, as one or two ranges that don't cross the antimeridian)
    const ranges = (box: GeoBox): Array<[number, number]> =>
        box.west <= box.east ? [[box.west, box.east]] : [[box.west, 180], [-180, box.east]]
    return ranges(a).some(([aWest, aEast]) => ranges(b).some(([bWest, bEast]) => aWest <= bEast && bWest <= aEast))
}

// each feature's box (see `d3.geoBounds`), found once
const featureBoxes = new WeakMap<object, GeoBox>()

/**
 * @param feature A feature
 * @return Its box of longitudes and latitudes (found once, and kept)
 */
function boxOf(feature: GeoJSON.Feature): GeoBox {
    let box = featureBoxes.get(feature)
    if (box === undefined) {
        const [[west, south], [east, north]] = d3.geoBounds(feature)
        box = {west, south, east, north}
        featureBoxes.set(feature, box)
    }
    return box
}

// the parts of each multi-polygon and multi-line (e.g. a world's land, or its borders' mesh: one shape
// of many parts), with each part's box, found once
const geometryParts = new WeakMap<object, Array<{part: GeoJSON.Polygon | GeoJSON.LineString, box: GeoBox}>>()

/**
 * @param geometry A multi-polygon, or a multi-line
 * @return Its parts (polygons, or lines), each with its box (found once, and kept)
 */
function partsOf(geometry: GeoJSON.MultiPolygon | GeoJSON.MultiLineString): Array<{part: GeoJSON.Polygon | GeoJSON.LineString, box: GeoBox}> {
    let parts = geometryParts.get(geometry)
    if (parts === undefined) {
        const geometries: Array<GeoJSON.Polygon | GeoJSON.LineString> = geometry.type === 'MultiPolygon' ?
            geometry.coordinates.map((coordinates): GeoJSON.Polygon => ({type: 'Polygon', coordinates})) :
            geometry.coordinates.map((coordinates): GeoJSON.LineString => ({type: 'LineString', coordinates}))
        parts = geometries.map(part => {
            const [[west, south], [east, north]] = d3.geoBounds(part)
            return {part, box: {west, south, east, north}}
        })
        geometryParts.set(geometry, parts)
    }
    return parts
}

/**
 * @param geometry A geometry
 * @param viewBox The view's box
 * @return The geometry, less a multi-polygon's or multi-line's parts that don't overlap the view
 */
function visibleGeometryOf(geometry: GeoJSON.Geometry | null, viewBox: GeoBox): GeoJSON.Geometry | null {
    if (geometry === null || (geometry.type !== 'MultiPolygon' && geometry.type !== 'MultiLineString')) return geometry
    const visible = partsOf(geometry).filter(({box}) => boxesOverlap(box, viewBox)).map(({part}) => part.coordinates)
    return geometry.type === 'MultiPolygon' ?
        {type: 'MultiPolygon', coordinates: visible as Array<GeoJSON.Position[][]>} :
        {type: 'MultiLineString', coordinates: visible as Array<GeoJSON.Position[]>}
}

/**
 * Trims a map's data to what a view might show: a feature collection's features whose boxes overlap
 * the view's, and a multi-polygon's or a multi-line's parts that do (e.g. of a world's land, which is
 * one shape of many parts) -- so that a detailed map, zoomed in, projects only what's near the view
 * @param object GeoJSON
 * @param viewBox The view's box (see {@link viewBoxOf}); `undefined` keeps everything
 * @return The GeoJSON, trimmed
 */
export function visibleOf(object: d3.GeoPermissibleObjects, viewBox: GeoBox | undefined): d3.GeoPermissibleObjects {
    if (viewBox === undefined) return object
    const geo = object as GeoJSON.GeoJSON
    const visibleFeature = (feature: GeoJSON.Feature): GeoJSON.Feature =>
        ({...feature, geometry: visibleGeometryOf(feature.geometry, viewBox) as GeoJSON.Geometry})
    switch (geo.type) {
        case 'FeatureCollection':
            return {
                type: 'FeatureCollection',
                features: geo.features.filter(feature => boxesOverlap(boxOf(feature), viewBox)).map(visibleFeature),
            }
        case 'Feature':
            return visibleFeature(geo)
        case 'MultiPolygon':
        case 'MultiLineString':
            return visibleGeometryOf(geo, viewBox) as d3.GeoPermissibleObjects
        default:
            return object
    }
}

/**
 * Draws a layer's shapes: all at once, when they're all the same color, or one feature at a time,
 * when their colors are functions of the features
 * @param context2D The context to draw into
 * @param path The path generator, drawing into the context
 * @param layer The layer
 * @param object The layer's data, as drawn at this zoom, trimmed to the view
 */
export function drawLayerShapes(
    context2D: CanvasRenderingContext2D,
    path: d3.GeoPath,
    layer: GeoLayer,
    object: d3.GeoPermissibleObjects,
): void {
    const {fill, stroke, lineWidth = 0.5, opacity = 1} = layer
    context2D.save()
    context2D.globalAlpha = opacity
    context2D.lineWidth = lineWidth
    if (typeof fill !== 'function' && typeof stroke !== 'function') {
        context2D.beginPath()
        path(object)
        if (fill !== undefined) {
            context2D.fillStyle = fill
            context2D.fill()
        }
        if (stroke !== undefined) {
            context2D.strokeStyle = stroke
            context2D.stroke()
        }
    } else {
        featuresOf(object).forEach(feature => {
            const featureFill = typeof fill === 'function' ? fill(feature) : fill
            const featureStroke = typeof stroke === 'function' ? stroke(feature) : stroke
            if (featureFill === undefined && featureStroke === undefined) return
            context2D.beginPath()
            path(feature)
            if (featureFill !== undefined) {
                context2D.fillStyle = featureFill
                context2D.fill()
            }
            if (featureStroke !== undefined) {
                context2D.strokeStyle = featureStroke
                context2D.stroke()
            }
        })
    }
    context2D.restore()
}

/**
 * Draws a layer's labels: each feature's, at its middle (as drawn), when the feature is wholly in the
 * plot area, and the label fits inside its drawn bounds. (A feature cut by the plot area's edges --
 * e.g. a country, zoomed in on one of its cities -- has no label: the middle of what's drawn of it
 * isn't its own.)
 * @param context2D The context to draw into
 * @param path The path generator (for the features' middles and bounds)
 * @param layer The layer
 * @param object The layer's data, as drawn at this zoom, trimmed to the view
 * @param color The labels' default color (the chart's)
 * @param width The width (px) of the plot area
 * @param height The height (px) of the plot area
 */
export function drawLayerLabels(
    context2D: CanvasRenderingContext2D,
    path: d3.GeoPath,
    layer: GeoLayer,
    object: d3.GeoPermissibleObjects,
    color: string,
    width: number,
    height: number,
): void {
    const {label} = layer
    if (label === undefined) return
    context2D.save()
    context2D.font = layer.labelFont ?? '11px sans-serif'
    context2D.fillStyle = layer.labelColor ?? color
    context2D.textAlign = 'center'
    context2D.textBaseline = 'middle'
    featuresOf(object).forEach(feature => {
        const text = label(feature)
        if (text === undefined || text === '') return
        const [[x0, y0], [x1, y1]] = path.bounds(feature)
        if (!(x0 >= 0 && y0 >= 0 && x1 <= width && y1 <= height)) return
        const [x, y] = path.centroid(feature)
        const textWidth = context2D.measureText(text).width
        if (textWidth > x1 - x0 || 12 > y1 - y0) return
        context2D.fillText(text, x, y)
    })
    context2D.restore()
}
