import {canvasLocalPoint, type Point, type Rect, seriesAt, type SeriesGeometry} from "./hitTesting";

/**
 * `hitTesting.ts` had zero test coverage (see the adversarial review's H9 finding) despite being
 * exactly the class of file responsible for a previously-fixed dpr/hit-testing bug on the Outlier
 * plot. These tests cover `seriesAt`'s point/segment/rect matching, z-order precedence, and the
 * within-entry geometry-kind precedence (rects > segments > points/asLine), plus
 * `canvasLocalPoint`'s CSS-scaling math.
 */

function pointsGeometry(points: Array<Point>, hitRadius: number, asLine = false): SeriesGeometry {
    return {points, hitRadius, asLine}
}

function segmentsGeometry(segments: Array<[Point, Point]>, hitRadius: number): SeriesGeometry {
    return {points: [], segments, hitRadius}
}

function rectsGeometry(rects: Array<Rect>): SeriesGeometry {
    return {points: [], rects, hitRadius: 0}
}

describe('seriesAt', () => {
    it('returns undefined for an empty geometry map', () => {
        expect(seriesAt(10, 10, new Map())).toBeUndefined()
    })

    it('skips an entry with an empty points array and no segments/rects', () => {
        const geometry = new Map<string, SeriesGeometry>([
            ['empty', pointsGeometry([], 10)],
        ])
        expect(seriesAt(0, 0, geometry)).toBeUndefined()
    })

    describe('point (marker-style) geometry', () => {
        it('hits the point within hitRadius', () => {
            const geometry = new Map<string, SeriesGeometry>([
                ['series-a', pointsGeometry([[10, 10], [50, 50]], 5)],
            ])
            expect(seriesAt(12, 10, geometry)).toEqual({name: 'series-a', index: 0})
        })

        it('returns undefined when the mouse is outside every point\'s hitRadius', () => {
            const geometry = new Map<string, SeriesGeometry>([
                ['series-a', pointsGeometry([[10, 10]], 5)],
            ])
            expect(seriesAt(100, 100, geometry)).toBeUndefined()
        })

        it('picks the nearer of two points that both qualify within hitRadius', () => {
            const geometry = new Map<string, SeriesGeometry>([
                ['series-a', pointsGeometry([[0, 0], [10, 0]], 20)],
            ])
            // sits closer to index 1 (10,0) than index 0 (0,0)
            expect(seriesAt(7, 0, geometry)).toEqual({name: 'series-a', index: 1})
        })

        it('treats the hitRadius boundary as inclusive', () => {
            const geometry = new Map<string, SeriesGeometry>([
                ['series-a', pointsGeometry([[0, 0]], 5)],
            ])
            expect(seriesAt(5, 0, geometry)).toEqual({name: 'series-a', index: 0})
            expect(seriesAt(5.000001, 0, geometry)).toBeUndefined()
        })
    })

    describe('asLine (connected polyline) geometry', () => {
        it('hits a point on a segment between two points', () => {
            const geometry = new Map<string, SeriesGeometry>([
                ['series-a', pointsGeometry([[0, 0], [100, 0]], 5, true)],
            ])
            expect(seriesAt(50, 2, geometry)).toEqual({name: 'series-a', index: expect.any(Number)})
        })

        it('attributes the hit to the nearer endpoint (start)', () => {
            const geometry = new Map<string, SeriesGeometry>([
                ['series-a', pointsGeometry([[0, 0], [100, 0]], 5, true)],
            ])
            // x=10 is much closer to the segment's start (index 0) than its end (index 1)
            expect(seriesAt(10, 2, geometry)).toEqual({name: 'series-a', index: 0})
        })

        it('attributes the hit to the nearer endpoint (end)', () => {
            const geometry = new Map<string, SeriesGeometry>([
                ['series-a', pointsGeometry([[0, 0], [100, 0]], 5, true)],
            ])
            expect(seriesAt(90, 2, geometry)).toEqual({name: 'series-a', index: 1})
        })

        it('does not hit when outside hitRadius of every segment', () => {
            const geometry = new Map<string, SeriesGeometry>([
                ['series-a', pointsGeometry([[0, 0], [100, 0]], 5, true)],
            ])
            expect(seriesAt(50, 20, geometry)).toBeUndefined()
        })

        it('picks the closest of multiple connected segments', () => {
            // a "V" shape: (0,0) -> (50,50) -> (100,0); (75, 25) sits exactly on the second leg
            // (the segment from points[1]=(50,50) to points[2]=(100,0)), 1250px^2 closer than the
            // first leg (from points[0] to points[1]) -- proving the closer of the two segments
            // wins, not just whichever is checked first
            const geometry = new Map<string, SeriesGeometry>([
                ['series-a', pointsGeometry([[0, 0], [50, 50], [100, 0]], 50, true)],
            ])
            const hit = seriesAt(75, 25, geometry)
            expect(hit?.name).toBe('series-a')
            // equidistant from both endpoints of the winning segment (50,50)-(100,0) -- the
            // `toStart <= toEnd` tie-break attributes it to the segment's start, points[1]
            expect(hit?.index).toBe(1)
        })
    })

    describe('disjoint segments geometry', () => {
        it('hits the segment the mouse is near', () => {
            const geometry = new Map<string, SeriesGeometry>([
                ['series-a', segmentsGeometry([
                    [[0, 0], [0, 10]],
                    [[20, 0], [20, 10]],
                ], 3)],
            ])
            expect(seriesAt(20, 5, geometry)).toEqual({name: 'series-a', index: 1})
        })

        it('does not treat disjoint segments as connected to one another', () => {
            const geometry = new Map<string, SeriesGeometry>([
                ['series-a', segmentsGeometry([
                    [[0, 0], [0, 10]],
                    [[20, 0], [20, 10]],
                ], 3)],
            ])
            // (10, 5) sits between the two segments but isn't within hitRadius of either --
            // if they were wrongly treated as one connected polyline this midpoint would hit
            expect(seriesAt(10, 5, geometry)).toBeUndefined()
        })

        it('picks the nearer of two qualifying segments', () => {
            const geometry = new Map<string, SeriesGeometry>([
                ['series-a', segmentsGeometry([
                    [[0, 0], [0, 10]],
                    [[5, 0], [5, 10]],
                ], 10)],
            ])
            expect(seriesAt(4, 5, geometry)).toEqual({name: 'series-a', index: 1})
        })
    })

    describe('rects geometry', () => {
        it('hits via exact containment, ignoring hitRadius entirely', () => {
            const geometry = new Map<string, SeriesGeometry>([
                ['series-a', {...rectsGeometry([{x: 0, y: 0, width: 10, height: 10}]), hitRadius: 0}],
            ])
            expect(seriesAt(5, 5, geometry)).toEqual({name: 'series-a', index: 0})
            // well outside the rect -- a proximity test with any nonzero radius might still miss
            // this, but the point is that containment is the *only* criterion, regardless of radius
            expect(seriesAt(50, 50, geometry)).toBeUndefined()
        })

        it('treats rect boundaries as inclusive', () => {
            const geometry = new Map<string, SeriesGeometry>([
                ['series-a', rectsGeometry([{x: 0, y: 0, width: 10, height: 10}])],
            ])
            expect(seriesAt(10, 10, geometry)).toEqual({name: 'series-a', index: 0})
            expect(seriesAt(10.0001, 10, geometry)).toBeUndefined()
        })

        it('returns the first containing rect by index, not necessarily the smallest', () => {
            const geometry = new Map<string, SeriesGeometry>([
                ['series-a', rectsGeometry([
                    {x: 0, y: 0, width: 100, height: 100},
                    {x: 40, y: 40, width: 20, height: 20},
                ])],
            ])
            // (50, 50) is inside both rects -- findIndex returns the first match (index 0)
            expect(seriesAt(50, 50, geometry)).toEqual({name: 'series-a', index: 0})
        })
    })

    describe('within-entry precedence: rects > segments > points/asLine', () => {
        it('rects win over points on the same entry', () => {
            const geometry = new Map<string, SeriesGeometry>([
                ['series-a', {
                    points: [[5, 5]],
                    rects: [{x: 0, y: 0, width: 10, height: 10}],
                    hitRadius: 1,
                }],
            ])
            // a point at [5,5] with hitRadius 1 would not itself match (5,5) is coincident, but
            // even displacing the mouse to somewhere only the rect covers proves rects are checked
            expect(seriesAt(8, 8, geometry)).toEqual({name: 'series-a', index: 0})
        })

        it('segments win over points/asLine on the same entry', () => {
            const geometry = new Map<string, SeriesGeometry>([
                ['series-a', {
                    points: [[0, 0], [100, 0]],
                    asLine: true,
                    segments: [[[40, 40], [60, 40]]],
                    hitRadius: 5,
                }],
            ])
            // near the segment (40-60, 40), far from the asLine points/polyline near y=0
            expect(seriesAt(50, 40, geometry)).toEqual({name: 'series-a', index: 0})
            // and the asLine geometry is never consulted -- a mouse position that the polyline
            // would have matched, but the (unrelated) segments entry doesn't, misses entirely
            expect(seriesAt(50, 1, geometry)).toBeUndefined()
        })
    })

    describe('z-order (reverse insertion order)', () => {
        it('the most-recently-inserted (topmost) entry wins when both would match', () => {
            const geometry = new Map<string, SeriesGeometry>([
                ['bottom', pointsGeometry([[50, 50]], 100)], // huge radius, would match almost anywhere
                ['top', pointsGeometry([[10, 10]], 5)],
            ])
            expect(seriesAt(10, 10, geometry)).toEqual({name: 'top', index: 0})
        })

        it('a rect (containment) on a lower entry does not lose to a closer, non-matching point on a higher entry', () => {
            const geometry = new Map<string, SeriesGeometry>([
                ['bottom-rect', rectsGeometry([{x: 0, y: 0, width: 100, height: 100}])],
                ['top-point', pointsGeometry([[500, 500]], 5)],
            ])
            // top-point doesn't match at all here, so it must fall through to bottom-rect
            expect(seriesAt(50, 50, geometry)).toEqual({name: 'bottom-rect', index: 0})
        })

        it('falls through to an earlier entry when the topmost entry does not match at all', () => {
            const geometry = new Map<string, SeriesGeometry>([
                ['first', pointsGeometry([[10, 10]], 5)],
                ['second', pointsGeometry([[500, 500]], 5)],
            ])
            expect(seriesAt(10, 10, geometry)).toEqual({name: 'first', index: 0})
        })
    })
})

function fakeMouseEvent(clientX: number, clientY: number): MouseEvent {
    return {clientX, clientY} as unknown as MouseEvent
}

function fakeCanvas(
    rect: {left: number, top: number, width: number, height: number},
    clientWidth: number,
    clientHeight: number,
): HTMLCanvasElement {
    return {
        getBoundingClientRect: () => rect as DOMRect,
        clientWidth,
        clientHeight,
    } as unknown as HTMLCanvasElement
}

describe('canvasLocalPoint', () => {
    it('subtracts the canvas\'s on-page offset with no CSS scaling', () => {
        const canvas = fakeCanvas({left: 20, top: 30, width: 200, height: 100}, 200, 100)
        expect(canvasLocalPoint(fakeMouseEvent(120, 80), canvas)).toEqual([100, 50])
    })

    it('applies CSS scaling when the displayed size differs from the backing-store size', () => {
        // canvas is drawn at 200x100 backing-store pixels, but CSS has shrunk its displayed size
        // to 100x50 -- a mouse event at the displayed-size midpoint must map to the backing-store
        // midpoint, not the raw (unscaled) displayed-pixel offset
        const canvas = fakeCanvas({left: 0, top: 0, width: 100, height: 50}, 200, 100)
        expect(canvasLocalPoint(fakeMouseEvent(50, 25), canvas)).toEqual([100, 50])
    })

    it('scales x and y independently', () => {
        const canvas = fakeCanvas({left: 0, top: 0, width: 100, height: 100}, 300, 100)
        expect(canvasLocalPoint(fakeMouseEvent(10, 10), canvas)).toEqual([30, 10])
    })

    it('defaults the scale to 1 when the bounding rect has zero width/height (guards divide-by-zero)', () => {
        const canvas = fakeCanvas({left: 5, top: 5, width: 0, height: 0}, 200, 100)
        const [x, y] = canvasLocalPoint(fakeMouseEvent(15, 25), canvas)
        expect(Number.isFinite(x)).toBe(true)
        expect(Number.isFinite(y)).toBe(true)
        expect([x, y]).toEqual([10, 20])
    })
})
