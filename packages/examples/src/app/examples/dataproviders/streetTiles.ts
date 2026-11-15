import {VectorTile} from "@mapbox/vector-tile"
import {PbfReader} from "pbf"
import type {GeoViewBox} from "stream-charts"

/*
    The streets for the geo example's street map: OpenStreetMap's roads, from OpenFreeMap's vector
    tiles (in the OpenMapTiles schema, its `transportation` layer), loaded as the view needs them.

    The tiles cover the earth in a grid that doubles at each zoom, and each holds its area's roads,
    generalized for its zoom: zoomed out, only the main roads; zoomed in, every street. So the view
    takes the tiles of the zoom that matches its own (see `tileZoomOf`) that cover it (see
    `tilesOf`), each loaded once, and kept (the most recently used, see `StreetTiles`).
 */

// OpenFreeMap's description of its tiles (TileJSON), which names the URL of the current tiles
const TILES_INFO_URL = 'https://tiles.openfreemap.org/planet'

// the zooms of the tiles that hold roads: none below this (OpenMapTiles' roads start at 4, but
// they're too sparse to be streets), and none more detailed than the most detailed tiles (which
// hold every street, and are used for the zooms past theirs)
export const MIN_STREETS_ZOOM = 6
const MAX_TILE_ZOOM = 14

// the most tiles kept loaded (each a few tens of kB), and the most loaded for one view (a very large
// view of the plot takes the next zoom out, rather than more tiles)
const MAX_TILES_KEPT = 400
const MAX_TILES_IN_VIEW = 48

/**
 * The classes of the roads drawn (OpenMapTiles' `class`), the least important first: drawn in this
 * order, so that the main roads lie over the streets
 */
export const STREET_CLASSES = ['service', 'minor', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway'] as const
export type StreetClass = typeof STREET_CLASSES[number]

/**
 * A tile's roads: each class's lines, as `[longitude, latitude]` coordinates
 */
export type TileStreets = Map<StreetClass, Array<Array<[number, number]>>>

/**
 * A tile's place in the grid of tiles: its zoom, and its column and row
 */
export type TileId = {z: number, x: number, y: number}

/**
 * @param pixelsPerDegree How many pixels a degree of arc spans at the view's center
 * @return The zoom of the tiles whose detail matches the view's: the tiles are 512 px across, and
 * the 2^z of zoom z span the 360° around the earth (at the most detailed tiles' zoom, at most)
 */
export function tileZoomOf(pixelsPerDegree: number): number {
    const zoom = Math.round(Math.log2(pixelsPerDegree * 360 / 512))
    return Number.isFinite(zoom) ? Math.max(0, Math.min(MAX_TILE_ZOOM, zoom)) : 0
}

/**
 * @param longitude A longitude (degrees)
 * @param zoom A tile zoom
 * @return The column of the tiles at the zoom that holds the longitude
 */
const columnOf = (longitude: number, zoom: number): number =>
    Math.floor((longitude + 180) / 360 * 2 ** zoom)

/**
 * @param latitude A latitude (degrees)
 * @param zoom A tile zoom
 * @return The row of the tiles at the zoom that holds the latitude (the tiles are a Web Mercator
 * grid, which ends a little short of the poles)
 */
function rowOf(latitude: number, zoom: number): number {
    const phi = Math.max(-85.0511, Math.min(85.0511, latitude)) * Math.PI / 180
    const rows = 2 ** zoom
    return Math.max(0, Math.min(rows - 1, Math.floor((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2 * rows)))
}

/**
 * @param box The longitudes and latitudes in view (`west` past `east` across the antimeridian)
 * @param zoom A tile zoom
 * @return The tiles at the zoom that cover the box (the nearer the box's middle the earlier, so
 * that the middle of the view loads first)
 */
export function tilesOf(box: GeoViewBox, zoom: number): Array<TileId> {
    const columns = 2 ** zoom
    const west = columnOf(box.west, zoom)
    // (across the antimeridian, the columns wrap around)
    const east = columnOf(box.east, zoom) + (box.west > box.east ? columns : 0)
    const north = rowOf(box.north, zoom)
    const south = rowOf(box.south, zoom)
    const middle = [(west + east) / 2, (north + south) / 2]
    const tiles: Array<TileId & {distance: number}> = []
    for (let column = west; column <= Math.min(east, west + columns - 1); column++) {
        for (let row = north; row <= south; row++) {
            tiles.push({z: zoom, x: ((column % columns) + columns) % columns, y: row, distance: Math.hypot(column - middle[0], row - middle[1])})
        }
    }
    return tiles.sort((a, b) => a.distance - b.distance).map(({z, x, y}) => ({z, x, y}))
}

/**
 * @param box The longitudes and latitudes in view
 * @param pixelsPerDegree How many pixels a degree of arc spans at the view's center
 * @return The tiles that the view takes: those at the zoom that matches the view, or, should that
 * take too many (a large plot), the zooms out from it; none below the streets' zoom
 */
export function viewTilesOf(box: GeoViewBox | undefined, pixelsPerDegree: number): Array<TileId> {
    if (box === undefined) return []
    for (let zoom = tileZoomOf(pixelsPerDegree); zoom >= MIN_STREETS_ZOOM; zoom--) {
        const tiles = tilesOf(box, zoom)
        if (tiles.length <= MAX_TILES_IN_VIEW) return tiles
    }
    return []
}

/**
 * @param tile A tile's place in the grid
 * @return Its key (e.g. for the tiles kept)
 */
export const tileKeyOf = ({z, x, y}: TileId): string => `${z}/${x}/${y}`

/**
 * @param data A tile's vector-tile data
 * @param tile The tile's place in the grid
 * @return The tile's roads, by class (the other classes -- paths, tracks, railways, and so on --
 * left out)
 */
export function streetsOfTile(data: ArrayBuffer, {z, x, y}: TileId): TileStreets {
    const streets: TileStreets = new Map()
    const layer = new VectorTile(new PbfReader(data)).layers.transportation
    if (layer === undefined) return streets
    for (let index = 0; index < layer.length; index++) {
        const feature = layer.feature(index)
        const roadClass = feature.properties.class as StreetClass
        if (!STREET_CLASSES.includes(roadClass)) continue
        const {geometry} = feature.toGeoJSON(x, y, z)
        const lines = geometry.type === 'LineString' ? [geometry.coordinates] :
            geometry.type === 'MultiLineString' ? geometry.coordinates :
                []
        const kept = streets.get(roadClass) ?? []
        lines.forEach(line => kept.push(line as Array<[number, number]>))
        streets.set(roadClass, kept)
    }
    return streets
}

/**
 * Loads OpenFreeMap's tiles' roads, each tile once, and keeps the most recently used (so that panning
 * back, or zooming out and in, draws without loading again). A tile that fails to load isn't kept,
 * so it's tried again the next time it's needed.
 */
export class StreetTiles {
    // the URL of the tiles (`{z}`, `{x}`, and `{y}` filled in), from OpenFreeMap's description of them
    private tilesUrl: Promise<string> | undefined = undefined
    // the tiles' roads, loaded or loading, by tile (see `tileKeyOf`), the most recently used last
    private readonly tiles = new Map<string, Promise<TileStreets>>()

    /**
     * @return The URL of the tiles, with `{z}`, `{x}`, and `{y}` to fill in
     */
    private urlTemplate(): Promise<string> {
        if (this.tilesUrl === undefined) {
            this.tilesUrl = fetch(TILES_INFO_URL)
                .then(response => response.json() as Promise<{tiles: Array<string>}>)
                .then(info => info.tiles[0])
                .catch(error => {
                    // (tried again the next time)
                    this.tilesUrl = undefined
                    throw error
                })
        }
        return this.tilesUrl
    }

    /**
     * @param tile A tile's place in the grid
     * @return The tile's roads, loaded (or kept, from before)
     */
    streetsOf(tile: TileId): Promise<TileStreets> {
        const key = tileKeyOf(tile)
        let streets = this.tiles.get(key)
        if (streets !== undefined) {
            // (the most recently used last)
            this.tiles.delete(key)
        } else {
            streets = this.urlTemplate()
                .then(template => fetch(template.replace('{z}', `${tile.z}`).replace('{x}', `${tile.x}`).replace('{y}', `${tile.y}`)))
                .then(response => {
                    if (!response.ok) throw new Error(`tile ${key}: ${response.status}`)
                    return response.arrayBuffer()
                })
                .then(data => streetsOfTile(data, tile))
                .catch(error => {
                    this.tiles.delete(key)
                    throw error
                })
        }
        this.tiles.set(key, streets)
        // (the least recently used go, past the most kept)
        while (this.tiles.size > MAX_TILES_KEPT) {
            const oldest = this.tiles.keys().next().value
            if (oldest === undefined) break
            this.tiles.delete(oldest)
        }
        return streets
    }
}
