import {
    firstIndexAtOrAfter,
    fontStringFor,
    formatChange,
    formatNumber,
    formatTime,
    formatTimeChange,
    formatValue,
    formatValueChange,
    mouseInPlotAreaFor,
    noop,
    textDimensions,
} from "./utils";
import type {Dimensions, Margin} from "./styling/margins";

describe('noop', () => {
    it('does nothing and returns undefined', () => {
        expect(noop()).toBeUndefined()
    })
})

describe('mouseInPlotAreaFor', () => {
    const margin: Margin = {top: 10, right: 10, bottom: 10, left: 10}
    const dimensions: Dimensions = {width: 100, height: 100}

    it('returns true when the point is inside the plot area', () => {
        expect(mouseInPlotAreaFor(50, 50, margin, dimensions)).toBe(true)
    })

    it('returns false on or outside the left/top boundary (exclusive bounds)', () => {
        expect(mouseInPlotAreaFor(10, 50, margin, dimensions)).toBe(false)
        expect(mouseInPlotAreaFor(50, 10, margin, dimensions)).toBe(false)
        expect(mouseInPlotAreaFor(-5, 50, margin, dimensions)).toBe(false)
        expect(mouseInPlotAreaFor(50, -5, margin, dimensions)).toBe(false)
    })

    it('returns false on or outside the right/bottom boundary (exclusive bounds)', () => {
        expect(mouseInPlotAreaFor(90, 50, margin, dimensions)).toBe(false)
        expect(mouseInPlotAreaFor(50, 90, margin, dimensions)).toBe(false)
        expect(mouseInPlotAreaFor(150, 50, margin, dimensions)).toBe(false)
        expect(mouseInPlotAreaFor(50, 150, margin, dimensions)).toBe(false)
    })

    it('respects asymmetric margins', () => {
        const asymmetricMargin: Margin = {top: 5, right: 20, bottom: 30, left: 1}
        // just inside the tight right/bottom bounds
        expect(mouseInPlotAreaFor(79, 69, asymmetricMargin, dimensions)).toBe(true)
        // just outside them
        expect(mouseInPlotAreaFor(80, 50, asymmetricMargin, dimensions)).toBe(false)
        expect(mouseInPlotAreaFor(50, 70, asymmetricMargin, dimensions)).toBe(false)
    })
})

/**
 * A minimal structural fake of `CanvasRenderingContext2D` -- just enough surface for
 * `textWidthOf`/`textDimensions`/`textMetricsOf` to touch (`measureText`, returning a controllable
 * `TextMetrics`-shaped object). No jsdom in this project, so a plain object fake stands in for the
 * real canvas context, the same technique used elsewhere in this suite (e.g. `plot.test.ts`).
 */
function fakeContext(metrics: Partial<TextMetrics>): CanvasRenderingContext2D {
    return {
        measureText: () => metrics as TextMetrics,
    } as unknown as CanvasRenderingContext2D
}

describe('textDimensions', () => {
    it('always reports x=0, y=0 (canvas text has no bbox offset)', () => {
        const box = textDimensions(fakeContext({width: 10}), 'abc')
        expect(box.x).toBe(0)
        expect(box.y).toBe(0)
    })

    it('reports the measured width', () => {
        expect(textDimensions(fakeContext({width: 17}), 'abc').width).toBe(17)
    })

    it('prefers actualBoundingBoxAscent/Descent over fontBoundingBoxAscent/Descent when both are present', () => {
        const box = textDimensions(
            fakeContext({
                width: 10,
                actualBoundingBoxAscent: 7,
                actualBoundingBoxDescent: 3,
                fontBoundingBoxAscent: 100,
                fontBoundingBoxDescent: 100,
            }),
            'abc'
        )
        expect(box.height).toBe(10)
    })

    it('falls back to fontBoundingBoxAscent/Descent when the actual* metrics are undefined', () => {
        const box = textDimensions(
            fakeContext({width: 10, fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 2}),
            'abc'
        )
        expect(box.height).toBe(10)
    })

    it('falls back to 0 ascent/descent when neither metric is available', () => {
        const box = textDimensions(fakeContext({width: 10}), 'abc')
        expect(box.height).toBe(0)
    })
})

describe('fontStringFor', () => {
    it('builds a CSS font shorthand string', () => {
        expect(fontStringFor(12, 'sans-serif', 300)).toBe('300 12px sans-serif')
    })
})

describe('formatNumber', () => {
    it('formats a number using the given d3 format spec', () => {
        expect(formatNumber(1234.5, " ,.0f")).toBe(" 1,235")
    })

    it('uses a unicode minus sign for negative numbers (d3 default)', () => {
        expect(formatNumber(-1234.5, " ,.0f")).toBe("−1,235")
    })

    it('returns "---" for NaN regardless of format', () => {
        expect(formatNumber(NaN, " ,.0f")).toBe('---')
    })
})

describe('formatTime', () => {
    it('formats the value with no units by default', () => {
        expect(formatTime(1234.5)).toBe(" 1,235")
    })

    it('appends the units, space-separated, when provided', () => {
        expect(formatTime(1234.5, "ms")).toBe(" 1,235 ms")
    })

    it('returns "---" for NaN and omits the units entirely', () => {
        expect(formatTime(NaN, "ms")).toBe('---')
    })
})

describe('formatValue', () => {
    it('formats with 3 decimal places', () => {
        expect(formatValue(1234.5678)).toBe(" 1,234.568")
    })

    it('returns "---" for NaN', () => {
        expect(formatValue(NaN)).toBe('---')
    })
})

describe('formatChange', () => {
    it('formats the difference (v2 - v1) using the given format spec', () => {
        expect(formatChange(5, 10, " ,.0f")).toBe(" 5")
        expect(formatChange(10, 5, " ,.0f")).toBe("−5")
    })

    it('returns "---" if either value is NaN', () => {
        expect(formatChange(NaN, 5, " ,.0f")).toBe('---')
        expect(formatChange(5, NaN, " ,.0f")).toBe('---')
    })
})

describe('formatTimeChange', () => {
    it('formats the difference with 0 decimal places', () => {
        expect(formatTimeChange(5, 10)).toBe(" 5")
    })

    it('returns "---" if either value is NaN', () => {
        expect(formatTimeChange(NaN, 10)).toBe('---')
    })
})

describe('formatValueChange', () => {
    it('formats the difference with 3 decimal places', () => {
        expect(formatValueChange(1.111, 2.222)).toBe(" 1.111")
    })

    it('returns "---" if either value is NaN', () => {
        expect(formatValueChange(1.111, NaN)).toBe('---')
    })
})

describe('firstIndexAtOrAfter', () => {
    const data = [0, 10, 20, 30, 40]
    const xFrom = (x: number): number => x

    it('finds the first element >= value', () => {
        expect(firstIndexAtOrAfter(data, 25, xFrom)).toBe(3)
    })

    it('returns the exact index on an exact match (lower-bound semantics)', () => {
        expect(firstIndexAtOrAfter(data, 20, xFrom)).toBe(2)
    })

    it('returns the leftmost index when there are duplicate values', () => {
        expect(firstIndexAtOrAfter([10, 10, 10, 20], 10, xFrom)).toBe(0)
    })

    it('returns 0 when value is before every element', () => {
        expect(firstIndexAtOrAfter(data, -100, xFrom)).toBe(0)
    })

    it('returns data.length when value is after every element', () => {
        expect(firstIndexAtOrAfter(data, 100, xFrom)).toBe(data.length)
    })

    it('returns 0 for an empty collection', () => {
        expect(firstIndexAtOrAfter([], 5, xFrom)).toBe(0)
    })
})
