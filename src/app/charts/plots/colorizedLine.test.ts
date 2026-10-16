import * as d3 from "d3";
import {lineColorScale, strokeColorizedLine} from "./colorizedLine";

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
    it('strokes each segment of a linear line in its own color, from the start color to the end color', () => {
        const {context, strokes} = fakeContext()
        strokeColorizedLine(context, points([0, 0], [10, 0], [20, 5]), p => p[0], p => p[1], d3.curveLinear, t => `c${t}`)
        expect(strokes).toEqual([
            {color: 'c0', commands: ['M0,0', 'L10,0']},
            {color: 'c1', commands: ['M10,0', 'L20,5']},
        ])
    })

    it('strokes consecutive segments of the same color together, as one continuous path', () => {
        const {context, strokes} = fakeContext()
        // (more segments than color bands, so neighbors share colors)
        const many = Array.from({length: 201}, (_, i) => [i, 0] as [number, number])
        strokeColorizedLine(context, many, p => p[0], p => p[1], d3.curveLinear, t => `c${t}`)
        expect(strokes.length).toBeLessThanOrEqual(64)
        expect(strokes[0].color).toBe('c0')
        expect(strokes[strokes.length - 1].color).toBe('c1')
        // every run starts where the previous one ended, and the runs cover all 200 segments
        expect(strokes.reduce((count, stroke) => count + stroke.commands.length - 1, 0)).toBe(200)
        strokes.slice(1).forEach((stroke, index) => {
            const previous = strokes[index].commands
            expect(stroke.commands[0]).toBe(`M${previous[previous.length - 1].slice(1)}`)
        })
    })

    it("keeps the curve's own pieces (e.g. a basis curve's bezier curves)", () => {
        const {context, strokes} = fakeContext()
        strokeColorizedLine(context, points([0, 0], [10, 10], [20, 0], [30, 10]), p => p[0], p => p[1], d3.curveBasis, t => `c${t}`)
        const drawn = strokes.flatMap(stroke => stroke.commands.filter(command => !command.startsWith('M')))
        expect(drawn.some(command => command.startsWith('C'))).toBe(true)
    })

    it('draws nothing for fewer than two points', () => {
        const {context, strokes} = fakeContext()
        strokeColorizedLine(context, points([0, 0]), p => p[0], p => p[1], d3.curveLinear, t => `c${t}`)
        expect(strokes).toEqual([])
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
