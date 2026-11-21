import * as d3 from "d3";
import {d3WoundRingsOf, MIN_STREETS_ZOOM, tileBoundsOf, tileKeyOf, tileZoomOf, tilesOf, viewTilesOf} from "./streetTiles";

// (how many pixels a degree spans for a tile zoom: 2^z tiles of 512 px around the earth)
const pixelsPerDegreeAt = (zoom: number): number => 512 * 2 ** zoom / 360

describe('the street map\'s tiles', () => {
    it('takes the tiles whose zoom matches the view\'s', () => {
        expect(tileZoomOf(pixelsPerDegreeAt(10))).toBe(10)
        expect(tileZoomOf(pixelsPerDegreeAt(10) * 1.3)).toBe(10)
        // (none more detailed than the most detailed tiles, nor less than the whole earth's)
        expect(tileZoomOf(pixelsPerDegreeAt(20))).toBe(14)
        expect(tileZoomOf(0.01)).toBe(0)
    })

    it('covers the view with the tiles that hold it, the middle first', () => {
        // (central London, at zoom 10: its tiles' columns are 511 and 512, about the meridian)
        const tiles = tilesOf({west: -0.2, south: 51.45, east: 0.1, north: 51.55}, 10)
        expect(new Set(tiles.map(tile => tile.x))).toEqual(new Set([511, 512]))
        expect(tiles.every(tile => tile.z === 10 && tile.y === 340)).toBe(true)
        expect(new Set(tiles.map(tileKeyOf)).size).toBe(tiles.length)
    })

    it('wraps around the antimeridian', () => {
        const tiles = tilesOf({west: 179.5, south: -17, east: -179.5, north: -16}, 8)
        expect([...new Set(tiles.map(tile => tile.x))].sort((a, b) => a - b)).toEqual([0, 255])
    })

    it('takes no tiles for a view of half the earth, or one zoomed out past the streets', () => {
        expect(viewTilesOf(undefined, pixelsPerDegreeAt(12))).toEqual([])
        expect(viewTilesOf({west: -10, south: 40, east: 10, north: 60}, pixelsPerDegreeAt(MIN_STREETS_ZOOM - 1))).toEqual([])
    })

    it('takes the whole earth\'s tiles, for the places, at a zoom with few enough, for a view of half the earth', () => {
        const tiles = viewTilesOf(undefined, pixelsPerDegreeAt(3), 0)
        // (zoom 3's 64 tiles are too many: zoom 2's 16)
        expect(tiles.length).toBe(16)
        expect(tiles.every(tile => tile.z === 2)).toBe(true)
    })

    it('takes the next zoom out, rather than too many tiles, for a large view', () => {
        const box = {west: -2, south: 50, east: 2, north: 53}
        const tiles = viewTilesOf(box, pixelsPerDegreeAt(12))
        expect(tiles.length).toBeGreaterThan(0)
        expect(tiles.length).toBeLessThanOrEqual(48)
        expect(tiles[0].z).toBeLessThan(12)
        expect(tiles[0].z).toBeGreaterThanOrEqual(MIN_STREETS_ZOOM)
    })
})

describe('the street map\'s land and water', () => {
    it('knows the part of the earth a tile covers', () => {
        // (the whole earth's one tile, to the Web Mercator grid's edges)
        const earth = tileBoundsOf({z: 0, x: 0, y: 0})
        expect(earth.west).toBe(-180)
        expect(earth.east).toBe(180)
        expect(earth.north).toBeCloseTo(85.0511, 3)
        expect(earth.south).toBeCloseTo(-85.0511, 3)
        // (and a tile of central London holds it)
        const london = tileBoundsOf({z: 10, x: 511, y: 340})
        expect(london.west).toBeLessThan(-0.1)
        expect(london.east).toBeGreaterThan(-0.1)
        expect(london.south).toBeLessThan(51.5)
        expect(london.north).toBeGreaterThan(51.5)
    })

    it('winds a polygon as d3-geo takes it: its outline clockwise, so that it\'s the small area inside', () => {
        // (a square of 1 degree, wound as GeoJSON winds it: anticlockwise)
        const square: Array<Array<[number, number]>> = [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
        expect(d3.geoArea({type: 'Polygon', coordinates: square})).toBeGreaterThan(2 * Math.PI)
        const wound = d3WoundRingsOf(square)
        expect(d3.geoArea({type: 'Polygon', coordinates: wound})).toBeLessThan(0.001)
        // (one already wound clockwise is left as it is)
        expect(d3WoundRingsOf(wound)).toBe(wound)
    })
})
