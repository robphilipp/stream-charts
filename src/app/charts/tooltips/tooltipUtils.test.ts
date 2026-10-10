import {boundingPoints, categoryTooltipY, defaultTooltipStyle, removeTooltip, tooltipX, tooltipY} from "./tooltipUtils";
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
