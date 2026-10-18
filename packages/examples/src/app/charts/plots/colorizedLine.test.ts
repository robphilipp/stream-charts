import * as d3 from "d3";
import {lineColorScale, pointColorScale, strokeColorizedLine, sweepFraction} from "./colorizedLine";

/**
 * A minimal fake of `CanvasRenderingContext2D` that records the path commands, and each stroke's
 * color and commands (no jsdom in this project)
 */
function fakeContext() {
    const strokes: Array<{color: string, commands: Array<string>}> = []
    let commands: Array<string> = []
    const context = {
        strokeStyle: '',
        lineJoin: '',
        lineCap: '',
        save: () => {},
        restore: () => {},
        beginPath: () => { commands = [] },
        moveTo: (x: number, y: number) => commands.push(`M${x},${y}`),
        lineTo: (x: number, y: number) => commands.push(`L${x},${y}`),
        bezierCurveTo: (_1: number, _2: number, _3: number, _4: number, x: number, y: number) => commands.push(`C${x},${y}`),
        stroke: () => strokes.push({color: context.strokeStyle, commands}),
    }
    return {context: context as unknown as CanvasRenderingContext2D, strokes}
}

const points = (...coordinates: Array<[number, number]>) => coordinates

describe('strokeColorizedLine', () => {
    it("strokes each segment of a linear line in the color of the point it starts at", () => {
        const {context, strokes} = fakeContext()
        strokeColorizedLine(context, points([0, 0], [10, 0], [20, 5]), p => p[0], p => p[1], d3.curveLinear, i => `c${i}`)
        expect(strokes).toEqual([
            {color: 'c0', commands: ['M0,0', 'L10,0']},
            {color: 'c1', commands: ['M10,0', 'L20,5']},
        ])
    })

    it('strokes consecutive segments of the same color together, as one continuous path', () => {
        const {context, strokes} = fakeContext()
        const many = Array.from({length: 11}, (_, i) => [i, 0] as [number, number])
        // (two colors: the first half of the points, and the second)
        strokeColorizedLine(context, many, p => p[0], p => p[1], d3.curveLinear, i => i < 5 ? 'a' : 'b')
        expect(strokes).toEqual([
            {color: 'a', commands: ['M0,0', 'L1,0', 'L2,0', 'L3,0', 'L4,0', 'L5,0']},
            {color: 'b', commands: ['M5,0', 'L6,0', 'L7,0', 'L8,0', 'L9,0', 'L10,0']},
        ])
    })

    it("keeps the curve's own pieces (e.g. a basis curve's bezier curves), colored by where they are along the line", () => {
        const {context, strokes} = fakeContext()
        strokeColorizedLine(context, points([0, 0], [10, 10], [20, 0], [30, 10]), p => p[0], p => p[1], d3.curveBasis, i => `c${i}`)
        const drawn = strokes.flatMap(stroke => stroke.commands.filter(command => !command.startsWith('M')))
        expect(drawn.some(command => command.startsWith('C'))).toBe(true)
        expect(strokes[0].color).toBe('c0')
        // (the last piece is at the last segment's starting point)
        expect(strokes[strokes.length - 1].color).toBe('c2')
    })

    it('draws nothing for fewer than two points', () => {
        const {context, strokes} = fakeContext()
        strokeColorizedLine(context, points([0, 0]), p => p[0], p => p[1], d3.curveLinear, i => `c${i}`)
        expect(strokes).toEqual([])
    })
})

describe('sweepFraction', () => {
    it('advances one step per point, from 0 to 1 over the steps', () => {
        expect(sweepFraction(0, 100)).toBe(0)
        expect(sweepFraction(25, 100)).toBe(0.25)
        expect(sweepFraction(100, 100)).toBe(1)
    })

    it('bounces back from 1 to 0 over the next steps, and so on', () => {
        expect(sweepFraction(125, 100)).toBe(0.75)
        expect(sweepFraction(200, 100)).toBe(0)
        expect(sweepFraction(250, 100)).toBe(0.5)
    })

    it('never jumps from one point to the next', () => {
        const fractions = Array.from({length: 500}, (_, i) => sweepFraction(i, 100))
        fractions.slice(1).forEach((fraction, i) => expect(Math.abs(fraction - fractions[i])).toBeLessThanOrEqual(0.01 + 1e-12))
    })
})

describe('pointColorScale', () => {
    it('gives the start color at the first point, and the end color after the steps', () => {
        const colorOf = pointColorScale('#0000ff', '#ff0000', 1000)
        expect(d3.color(colorOf(0))!.formatHex()).toBe('#0000ff')
        expect(d3.color(colorOf(1000))!.formatHex()).toBe('#ff0000')
        expect(d3.color(colorOf(2000))!.formatHex()).toBe('#0000ff')
    })
})

describe('lineColorScale', () => {
    it('goes from the start color to the end color', () => {
        const colorAt = lineColorScale('#0000ff', '#ff0000')
        expect(d3.color(colorAt(0))!.formatHex()).toBe('#0000ff')
        expect(d3.color(colorAt(1))!.formatHex()).toBe('#ff0000')
    })

    it('sweeps the long way around the hue circle (blue to red passes through green, not magenta)', () => {
        const middle = d3.hsl(lineColorScale('#0000ff', '#ff0000')(0.5))
        // blue is 240, red is 0 (or 360): the short way is through magenta (300); the long way is
        // through green (120)
        expect(middle.h).toBeCloseTo(120)
    })
})
