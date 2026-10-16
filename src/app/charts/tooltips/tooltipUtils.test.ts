import {
    boundingPoints,
    categoryTooltipY,
    defaultTooltipStyle,
    removeTooltip,
    scatterTooltipPointList,
    scatterTooltipPoints,
    sparklineFor,
    spikeStatistics,
    tooltipX,
    tooltipY
} from "./tooltipUtils";
import * as d3 from "d3";
import type {OrdinalStringAxis} from "../axes/axes";

type Point = { x: number, y: number }

const emptyPoint = (): Point => ({x: NaN, y: NaN})

/**
 * A minimal structural fake of a DOM `ParentNode`/`Element` -- just enough surface for
 * `removeTooltip` to touch (`querySelectorAll`, and `remove()` on whatever it returns). No jsdom
 * in this project, so plain object fakes stand in for real DOM nodes (same technique used
 * elsewhere in this suite, e.g. `subscriptions.test.ts`'s `document` stub).
 */
function fakeScope(elementCount: number): {scope: ParentNode, removeSpies: Array<jest.Mock>} {
    const removeSpies = Array.from({length: elementCount}, () => jest.fn())
    const elements = removeSpies.map(remove => ({remove}))
    const scope = {
        querySelectorAll: jest.fn(() => elements),
    } as unknown as ParentNode
    return {scope, removeSpies}
}

describe('boundingPoints', () => {
    test('should not throw on an empty series, returning two empty datums', () => {
        const [before, after] = boundingPoints<Point>([], 10, p => p.x, emptyPoint)
        expect(before).toEqual(emptyPoint())
        expect(after).toEqual(emptyPoint())
    })

    test('should find the bounding points for a value in the middle of the series', () => {
        const data: Array<Point> = [{x: 0, y: 1}, {x: 10, y: 2}, {x: 20, y: 3}]
        const [before, after] = boundingPoints<Point>(data, 15, p => p.x, emptyPoint)
        expect(before).toEqual(data[1])
        expect(after).toEqual(data[2])
    })

    test('should return an empty "before" datum when the value is before the first point', () => {
        const data: Array<Point> = [{x: 10, y: 1}, {x: 20, y: 2}]
        const [before, after] = boundingPoints<Point>(data, 0, p => p.x, emptyPoint)
        expect(before).toEqual(emptyPoint())
        expect(after).toEqual(data[0])
    })

    test('should return an empty "after" datum when the value is after the last point', () => {
        const data: Array<Point> = [{x: 10, y: 1}, {x: 20, y: 2}]
        const [before, after] = boundingPoints<Point>(data, 30, p => p.x, emptyPoint)
        expect(before).toEqual(data[1])
        expect(after).toEqual(emptyPoint())
    })
})

// guards against a regression of M12: removeTooltip used to query `document` unscoped, so it
// removed every `.tooltip` element on the whole page -- any other chart instance's tooltip, or
// any unrelated host-app element that happened to also use the `tooltip` class, got swept up too
describe('removeTooltip', () => {
    test('removes every matched element within the given scope', () => {
        const {scope, removeSpies} = fakeScope(2)

        removeTooltip(scope)

        expect(scope.querySelectorAll).toHaveBeenCalledWith('.tooltip')
        removeSpies.forEach(remove => expect(remove).toHaveBeenCalledTimes(1))
    })

    test('does not touch a different scope, e.g. a second chart instance\'s own overlay container', () => {
        const chartA = fakeScope(1)
        const chartB = fakeScope(1)

        removeTooltip(chartA.scope)

        expect(chartA.removeSpies[0]).toHaveBeenCalledTimes(1)
        expect(chartB.scope.querySelectorAll).not.toHaveBeenCalled()
        expect(chartB.removeSpies[0]).not.toHaveBeenCalled()
    })

    test('does nothing when the scope has no matching elements', () => {
        const {scope} = fakeScope(0)

        expect(() => removeTooltip(scope)).not.toThrow()
    })
})

describe('tooltip placement', () => {
    // a 400 x 300 plot, with a 40 px margin on each side (so the plot spans x in [40, 440], and y
    // in [40, 340], relative to the chart)
    const margin = {top: 40, bottom: 40, left: 40, right: 40}
    const plotDimensions = {width: 400, height: 300}
    const style = {...defaultTooltipStyle, paddingLeft: 10, paddingTop: 10}

    describe('tooltipX', () => {
        it('places the tooltip to the right of the mouse when it fits', () => {
            expect(tooltipX(100, 200, plotDimensions, style, margin)).toBe(110)
        })

        it('places the tooltip right up against the plot edge when it just fits', () => {
            // 230 + 10 + 200 = 440, the plot's right edge
            expect(tooltipX(230, 200, plotDimensions, style, margin)).toBe(240)
        })

        it("flips the tooltip to the left of the mouse, the same gap away, when it doesn't fit", () => {
            // the tooltip's right edge sits the gap (10 px) to the left of the mouse -- regardless
            // of the chart's right margin, and of how wide the tooltip is
            expect(tooltipX(400, 200, plotDimensions, style, margin)).toBe(400 - 10 - 200)
            expect(tooltipX(400, 120, plotDimensions, style, margin)).toBe(400 - 10 - 120)
        })

        it("doesn't flip the tooltip past the chart's left edge", () => {
            expect(tooltipX(150, 380, plotDimensions, style, margin)).toBe(0)
        })
    })

    describe('tooltipY', () => {
        it('places the tooltip below the mouse when it fits', () => {
            expect(tooltipY(100, 80, plotDimensions, style, margin)).toBe(110)
        })

        it("moves the tooltip up to the plot's bottom edge when it doesn't fit below the mouse", () => {
            // the plot's bottom is at 340, so an 80 px tooltip's top goes at 260
            expect(tooltipY(300, 80, plotDimensions, style, margin)).toBe(260)
        })

        it("doesn't move the tooltip past the chart's top edge", () => {
            expect(tooltipY(300, 400, plotDimensions, style, margin)).toBe(0)
        })
    })

    describe('categoryTooltipY', () => {
        // ten 30 px categories, "c0" through "c9", from the top of the plot
        const axis = {scale: (name: string) => Number(name.slice(1)) * 30} as unknown as OrdinalStringAxis

        it('centers the tooltip on the category', () => {
            // "c4" spans [160, 190] (relative to the chart), so a 50 px tooltip's top goes at 150
            expect(categoryTooltipY('c4', 50, axis, margin, 30, plotDimensions)).toBe(150)
        })

        it("keeps the tooltip within the plot's top edge", () => {
            expect(categoryTooltipY('c0', 50, axis, margin, 30, plotDimensions)).toBe(40)
        })

        it("keeps the tooltip within the plot's bottom edge", () => {
            // the plot's bottom is at 340, so a 50 px tooltip's top goes at most at 290
            expect(categoryTooltipY('c9', 50, axis, margin, 30, plotDimensions)).toBe(290)
        })
    })
})

describe('scatterTooltipPoints', () => {
    // points every 10 ms, plotted 10 px apart (x: 0..100 ms -> 0..100 px; y: 0..100 -> 100..0 px)
    const xScale = d3.scaleLinear().domain([0, 100]).range([0, 100])
    const yScale = d3.scaleLinear().domain([0, 100]).range([100, 0])
    const data = [{x: 0, y: 50}, {x: 10, y: 60}, {x: 20, y: 40}, {x: 30, y: 70}, {x: 40, y: 50}]
    const at = ({x, y}: {x: number, y: number}, dx = 0, dy = 0): [number, number] => [xScale(x) + dx, yScale(y) + dy]

    it('is the point, and its neighbors, when the mouse is directly over a point', () => {
        expect(scatterTooltipPoints(data, at(data[2], 1, -2), xScale, yScale, 4))
            .toEqual({kind: 'point', before: data[1], point: data[2], after: data[3]})
    })

    it("has no neighbor beyond the series' ends", () => {
        expect(scatterTooltipPoints(data, at(data[0]), xScale, yScale, 4))
            .toEqual({kind: 'point', before: undefined, point: data[0], after: data[1]})
        expect(scatterTooltipPoints(data, at(data[4]), xScale, yScale, 4))
            .toEqual({kind: 'point', before: data[3], point: data[4], after: undefined})
    })

    it('is the points on either side when the mouse is over a segment', () => {
        // halfway between (20, 40) and (30, 70), on the line
        const mouse: [number, number] = [25, yScale(55)]
        expect(scatterTooltipPoints(data, mouse, xScale, yScale, 4))
            .toEqual({kind: 'segment', before: data[2], after: data[3]})
    })

    it("isn't over a point just outside the radius", () => {
        // the radius (4 px) is less than a third of the way to the nearest neighbor (~22 px away)
        expect(scatterTooltipPoints(data, at(data[2], 5, 0), xScale, yScale, 4).kind).toBe('segment')
        expect(scatterTooltipPoints(data, at(data[2], 4, 0), xScale, yScale, 4).kind).toBe('point')
    })

    it('shrinks the radius to a third of the way to the nearest neighbor, for dense data', () => {
        // points 3 px apart (on a flat line): even with a 6 px radius, a point covers only 1 px
        const dense = [{x: 0, y: 50}, {x: 3, y: 50}, {x: 6, y: 50}, {x: 9, y: 50}]
        expect(scatterTooltipPoints(dense, at(dense[1], 1, 0), xScale, yScale, 6).kind).toBe('point')
        expect(scatterTooltipPoints(dense, at(dense[1], 1.5, 0), xScale, yScale, 6))
            .toEqual({kind: 'segment', before: dense[1], after: dense[2]})
    })

    it('picks the nearest point when more than one could be over', () => {
        const dense = [{x: 0, y: 50}, {x: 3, y: 50}, {x: 6, y: 50}]
        const points = scatterTooltipPoints(dense, at(dense[1], -0.5, 0), xScale, yScale, 6)
        expect(points.kind === 'point' && points.point).toEqual(dense[1])
    })

    it('lists the points in order, without the missing ones', () => {
        expect(scatterTooltipPointList({kind: 'point', before: data[1], point: data[2], after: data[3]}))
            .toEqual([data[1], data[2], data[3]])
        expect(scatterTooltipPointList({kind: 'point', point: data[0], after: data[1]})).toEqual([data[0], data[1]])
        expect(scatterTooltipPointList({kind: 'segment', before: data[2], after: data[3]})).toEqual([data[2], data[3]])
    })
})

describe('sparklineFor', () => {
    const series = (...values: Array<number>) => values.map((value, index) => ({time: index * 10, value}))

    it('scales time across the width, and the values to fill the height (highest at the top)', () => {
        // 100 x 20, with 0 padding: times 0..20 -> x 0..100; values 0..10 -> y 20..0
        const sparkline = sparklineFor(series(0, 10, 5), 100, 20, 0)
        expect(sparkline?.path).toBe('M0,20 L50,0 L100,10')
        expect(sparkline?.end).toEqual([100, 10])
    })

    it('leaves the padding around the line', () => {
        expect(sparklineFor(series(0, 10), 100, 20, 2)?.path).toBe('M2,18 L98,2')
    })

    it('draws a flat line in the middle', () => {
        expect(sparklineFor(series(5, 5, 5), 100, 20, 0)?.path).toBe('M0,10 L50,10 L100,10')
    })

    it("is undefined when there aren't two values to draw", () => {
        expect(sparklineFor([], 100, 20)).toBeUndefined()
        expect(sparklineFor(series(3), 100, 20)).toBeUndefined()
        expect(sparklineFor(series(NaN, 3), 100, 20)).toBeUndefined()
    })

    it('skips values that are not finite', () => {
        expect(sparklineFor(series(0, NaN, 10), 100, 20, 0)?.path).toBe('M0,20 L100,0')
    })

    it("reduces a long series to each pixel column's first, lowest, highest, and last values", () => {
        // 1,000 values across 10 px: a sawtooth, with one spike that must survive the reduction
        const values = Array.from({length: 1000}, (_, index) => index === 555 ? 100 : index % 10)
        const sparkline = sparklineFor(series(...values), 10, 20, 0)!
        const ys = sparkline.path.split(' ').map(command => Number(command.split(',')[1]))
        // at most four points per column (11 columns: 0..10)
        expect(ys.length).toBeLessThanOrEqual(4 * 11)
        // the spike (the highest value) is at the top
        expect(Math.min(...ys)).toBe(0)
        // and the line ends at the last value (999 % 10 = 9, near the bottom of 0..100)
        expect(sparkline.end[1]).toBeCloseTo(20 - 9 / 100 * 20)
    })
})

describe('spikeStatistics', () => {
    const spikes = (...xys: Array<[number, number]>) => xys.map(([x, y]) => ({x, y}))

    it('calculates the mean and (sample) standard deviation of the values, and the mean interval', () => {
        // values 2, 4, 4, 4, 5, 5, 7, 9: mean 5, sample standard deviation sqrt(32 / 7)
        const data = spikes([0, 2], [10, 4], [20, 4], [30, 4], [40, 5], [50, 5], [60, 7], [70, 9])
        const statistics = spikeStatistics(data)
        expect(statistics.count).toBe(8)
        expect(statistics.meanValue).toBe(5)
        expect(statistics.valueStandardDeviation).toBeCloseTo(Math.sqrt(32 / 7))
        expect(statistics.meanInterval).toBe(10)
    })

    it('averages uneven intervals', () => {
        // intervals of 10, 30, and 20: a mean of 20
        expect(spikeStatistics(spikes([0, 1], [10, 1], [40, 1], [60, 1])).meanInterval).toBe(20)
    })

    it("leaves what needs two spikes undefined when there's only one", () => {
        expect(spikeStatistics(spikes([5, 3]))).toEqual(
            {count: 1, meanValue: 3, valueStandardDeviation: undefined, meanInterval: undefined}
        )
    })

    it("is empty when there are no spikes", () => {
        expect(spikeStatistics([])).toEqual(
            {count: 0, meanValue: undefined, valueStandardDeviation: undefined, meanInterval: undefined}
        )
    })

    it("skips spikes whose value or time isn't finite", () => {
        expect(spikeStatistics(spikes([0, 1], [10, NaN], [20, 3])).meanValue).toBe(2)
    })
})
