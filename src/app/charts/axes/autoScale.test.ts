import * as d3 from "d3";
import {clampedDomain, extentWith, grownDomain, sameAutoScale, visibleExtent} from "./autoScale";

const linear = d3.scaleLinear()
const noLimits = {min: -Infinity, max: Infinity, padding: 0}

describe('clampedDomain', () => {
    it('leaves a domain within the limits as it is', () => {
        expect(clampedDomain([0, 100], -10, 200)).toEqual([0, 100])
    })

    it('clamps a domain that reaches past the limits', () => {
        expect(clampedDomain([0, 1000], 10, 800)).toEqual([10, 800])
    })

    it('collapses a domain that lies entirely beyond a limit onto it', () => {
        expect(clampedDomain([900, 1000], 0, 800)).toEqual([800, 800])
    })
})

describe('sameAutoScale', () => {
    const settings = {domain: [0, 100] as [number, number], min: 0, max: 200, padding: 0.05}

    it('compares the settings by value', () => {
        expect(sameAutoScale(settings, {...settings, domain: [0, 100]})).toBe(true)
        expect(sameAutoScale(settings, {...settings, domain: [0, 110]})).toBe(false)
        expect(sameAutoScale(settings, {...settings, max: 150})).toBe(false)
        expect(sameAutoScale(settings, {...settings, padding: 0})).toBe(false)
    })

    it('treats undefined as "not auto-scaling"', () => {
        expect(sameAutoScale(undefined, undefined)).toBe(true)
        expect(sameAutoScale(settings, undefined)).toBe(false)
        expect(sameAutoScale(undefined, settings)).toBe(false)
    })
})

describe('grownDomain', () => {
    it("leaves the domain as it is when there's no data", () => {
        expect(grownDomain([0, 100], undefined, noLimits, linear)).toEqual([0, 100])
    })

    it('leaves the domain as it is when the data is within it', () => {
        expect(grownDomain([0, 100], [10, 90], {...noLimits, padding: 0.05}, linear)).toEqual([0, 100])
    })

    it('grows the domain to fit data beyond it, on either side', () => {
        expect(grownDomain([0, 100], [10, 150], noLimits, linear)).toEqual([0, 150])
        expect(grownDomain([0, 100], [-20, 90], noLimits, linear)).toEqual([-20, 100])
        expect(grownDomain([0, 100], [-20, 150], noLimits, linear)).toEqual([-20, 150])
    })

    it("doesn't grow past the limits", () => {
        expect(grownDomain([0, 100], [-50, 150], {min: -10, max: 120, padding: 0}, linear)).toEqual([-10, 120])
        // nor does the padding take it past them
        expect(grownDomain([0, 100], [0, 119], {min: -10, max: 120, padding: 0.1}, linear)).toEqual([0, 120])
    })

    it('never shrinks a side, should the domain already be past a limit', () => {
        expect(grownDomain([0, 100], [10, 150], {...noLimits, max: 80}, linear)).toEqual([0, 100])
    })

    it('leaves padding beyond the extreme, on the growing side only', () => {
        // grown to [0, 150], then extended so that 150 sits 10% of the axis' length below the top
        const [min, max] = grownDomain([0, 100], [50, 150], {...noLimits, padding: 0.1}, linear)
        expect(min).toBe(0)
        expect((max - 150) / (max - min)).toBeCloseTo(0.1)
    })

    it('leaves the same padding on both sides when both grow', () => {
        const [min, max] = grownDomain([0, 100], [-50, 150], {...noLimits, padding: 0.1}, linear)
        expect((-50 - min) / (max - min)).toBeCloseTo(0.1)
        expect((max - 150) / (max - min)).toBeCloseTo(0.1)
    })

    it('pads in the scale\'s own space (e.g. logarithmically)', () => {
        const log = d3.scaleLog()
        const [min, max] = grownDomain([10, 100], [10, 1000], {...noLimits, padding: 0.1}, log)
        expect(min).toBe(10)
        // 1000 sits 10% of the axis' (logarithmic) length below the top
        expect((Math.log(max) - Math.log(1000)) / (Math.log(max) - Math.log(min))).toBeCloseTo(0.1)
    })
})

describe('extentWith', () => {
    it('starts an extent', () => {
        expect(extentWith(undefined, 5)).toEqual([5, 5])
    })

    it('extends an extent to include a value', () => {
        expect(extentWith([0, 10], 15)).toEqual([0, 15])
        expect(extentWith([0, 10], -5)).toEqual([-5, 10])
        expect(extentWith([0, 10], 5)).toEqual([0, 10])
    })
})

describe('visibleExtent', () => {
    const points = (...xys: Array<[number, number]>) => xys.map(([x, y]) => ({x, y}))

    it('covers the points within the window', () => {
        const data = points([0, 50], [10, 20], [20, 80], [30, 60], [40, 999])
        expect(visibleExtent(data, [10, 30], linear, false)).toEqual([20, 80])
    })

    it("is undefined when there's nothing in the window", () => {
        expect(visibleExtent(points([0, 50], [10, 20]), [20, 30], linear, false)).toBeUndefined()
        expect(visibleExtent([], [0, 10], linear, true)).toBeUndefined()
    })

    it("includes the line's height where it crosses the window's edges", () => {
        // the line from (0, 0) up to (20, 100) crosses the left edge (x = 10) at 50; the line from
        // (30, 60) down to (50, -40) crosses the right edge (x = 40) at 10
        const data = points([0, 0], [20, 100], [30, 60], [50, -40])
        expect(visibleExtent(data, [10, 40], linear, true)).toEqual([10, 100])
        // without a line, just the points
        expect(visibleExtent(data, [10, 40], linear, false)).toEqual([60, 100])
    })

    it('includes a line that passes straight across the window, with no point within it', () => {
        // from (0, 0) to (100, 100): at x = 40 it's at 40, and at x = 60 it's at 60
        const data = points([0, 0], [100, 100])
        expect(visibleExtent(data, [40, 60], linear, true)).toEqual([40, 60])
    })

    it("skips values the scale can't show, e.g. values <= 0 on a log scale", () => {
        const log = d3.scaleLog()
        const data = points([0, 10], [10, -5], [20, 0], [30, 100])
        expect(visibleExtent(data, [0, 30], log, false)).toEqual([10, 100])
    })

    it('calculates the crossings in the scale\'s own space', () => {
        // on a log scale, the straight (on-screen) line from 1 to 100 is at 10 halfway across
        const data = points([0, 1], [100, 100])
        const [min] = visibleExtent(data, [50, 100], d3.scaleLog(), true)!
        expect(min).toBeCloseTo(10)
    })
})
