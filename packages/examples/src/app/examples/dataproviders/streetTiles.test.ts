import {MIN_STREETS_ZOOM, tileKeyOf, tileZoomOf, tilesOf, viewTilesOf} from "./streetTiles";

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

    it('takes the next zoom out, rather than too many tiles, for a large view', () => {
        const box = {west: -2, south: 50, east: 2, north: 53}
        const tiles = viewTilesOf(box, pixelsPerDegreeAt(12))
        expect(tiles.length).toBeGreaterThan(0)
        expect(tiles.length).toBeLessThanOrEqual(48)
        expect(tiles[0].z).toBeLessThan(12)
        expect(tiles[0].z).toBeGreaterThanOrEqual(MIN_STREETS_ZOOM)
    })
})
