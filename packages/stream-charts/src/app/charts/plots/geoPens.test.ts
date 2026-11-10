import * as d3 from "d3";
import {directPen, ReferenceShapes, shiftedPen} from "./geoPens";
import {GeoProjections, setUpShiftedProjection, SHIFT_REFERENCE_VIEW, shiftOf} from "./geoProjections";

const WIDTH = 800
const HEIGHT = 500

// the lower 48 states, about, and two of them, about
const lower48 = d3.geoGraticule().extent([[-125, 25], [-67, 49]]).outline()
const state = (name: string, [[west, south], [east, north]]: [[number, number], [number, number]]): GeoJSON.Feature => ({
    type: 'Feature',
    properties: {name},
    geometry: d3.geoGraticule().extent([[west, south], [east, north]]).outline(),
})
const colorado = state('Colorado', [[-109.05, 37], [-102.05, 41]])
const wyoming = state('Wyoming', [[-111.05, 41], [-104.05, 45]])

/**
 * @return A stand-in for a `Path2D`, recording the points traced into it
 */
const recordingPath = (): Path2D => {
    const points: Array<[number, number]> = []
    const record = (x: number, y: number): void => {
        points.push([x, y])
    }
    return {points, moveTo: record, lineTo: record, closePath: () => undefined, arc: record} as unknown as Path2D
}

/**
 * @param projection A projection
 * @param withReference Counts each projecting
 * @return The shapes projected at the reference view (with recording paths), and how often the
 * reference was asked for
 */
function referenceFor(projection: d3.GeoProjection): {shapes: ReferenceShapes, calls: () => number} {
    let calls = 0
    const shapes = new ReferenceShapes(<T, >(project: (path: d3.GeoPath) => T): T => {
        calls += 1
        setUpShiftedProjection(projection, lower48, SHIFT_REFERENCE_VIEW, WIDTH, HEIGHT, 20)
        return project(d3.geoPath(projection))
    }, recordingPath)
    return {shapes, calls: () => calls}
}

describe('the shifted pen', () => {
    const view = {rotate: [0, 0, 0] as [number, number, number], k: 4, offsetX: -900, offsetY: 300}

    it('gives the same bounds and middles as projecting at the view', () => {
        const {shapes} = referenceFor(GeoProjections.albersUsa())
        const pen = shiftedPen(shapes, shiftOf(view, WIDTH, HEIGHT))
        const projection = GeoProjections.albersUsa()
        setUpShiftedProjection(projection, lower48, view, WIDTH, HEIGHT, 20)
        const direct = directPen(d3.geoPath(projection))
        for (const feature of [colorado, wyoming]) {
            const [[x0, y0], [x1, y1]] = pen.bounds(feature)
            const [[dx0, dy0], [dx1, dy1]] = direct.bounds(feature)
            // (the reference follows the curves more closely, which barely moves the bounds)
            expect([x0, y0, x1, y1].map(v => Math.round(v))).toEqual([dx0, dy0, dx1, dy1].map(v => Math.round(v)))
            const [x, y] = pen.centroid(feature)
            const [dx, dy] = direct.centroid(feature)
            expect(Math.hypot(x - dx, y - dy)).toBeLessThan(0.5)
        }
    })

    it('projects each shape once, however many views draw it', () => {
        const {shapes, calls} = referenceFor(GeoProjections.albersUsa())
        const context = {
            save: () => undefined, restore: () => undefined, transform: () => undefined,
            fill: () => undefined, stroke: () => undefined,
        } as unknown as CanvasRenderingContext2D
        for (const k of [1, 2, 4]) {
            const pen = shiftedPen(shapes, shiftOf({...view, k}, WIDTH, HEIGHT))
            pen.draw(context, colorado, '#ccc', '#333', 1)
            pen.bounds(colorado)
            pen.centroid(colorado)
        }
        // (once for its path, once for its bounds, and once for its middle)
        expect(calls()).toBe(3)
        expect(shapes.pathOf(colorado)).toBe(shapes.pathOf(colorado))
    })

    it('draws the projected shape scaled and slid to the view, keeping the outline\'s width', () => {
        const {shapes} = referenceFor(GeoProjections.albersUsa())
        const drawn: Array<string> = []
        const state: {lineWidth?: number} = {}
        const context = {
            save: () => undefined, restore: () => undefined,
            transform: (...values: Array<number>) => drawn.push(`transform ${values.map(v => v.toFixed(1)).join(' ')}`),
            fill: (path: Path2D) => drawn.push(`fill ${path === shapes.pathOf(colorado)}`),
            stroke: () => drawn.push(`stroke ${state.lineWidth}`),
            set fillStyle(_: string) { /* (unrecorded) */ },
            set strokeStyle(_: string) { /* (unrecorded) */ },
            set lineWidth(value: number) { state.lineWidth = value },
        } as unknown as CanvasRenderingContext2D
        const shift = shiftOf(view, WIDTH, HEIGHT)
        shiftedPen(shapes, shift).draw(context, colorado, '#ccc', '#333', 2)
        expect(drawn).toEqual([
            `transform 4.0 0.0 0.0 4.0 ${shift.x0.toFixed(1)} ${shift.y0.toFixed(1)}`,
            'fill true',
            'stroke 0.5',
        ])
    })

    it('draws nothing for a shape with neither a fill nor an outline', () => {
        const {shapes, calls} = referenceFor(GeoProjections.albersUsa())
        const context = {} as unknown as CanvasRenderingContext2D
        shiftedPen(shapes, shiftOf(view, WIDTH, HEIGHT)).draw(context, colorado, undefined, undefined, 1)
        expect(calls()).toBe(0)
    })
})
