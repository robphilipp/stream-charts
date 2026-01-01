import {OrdinalAxisRange} from './OrdinalAxisRange';

describe('scaleOrdinalBounds', () => {
    function validateRanges(actualRanges: OrdinalAxisRange, expectedRanges: OrdinalAxisRange): void {
        const {current: actualRange, original: actualOriginal} = actualRanges

        expect(actualRange.start).toBeCloseTo(expectedRanges.current.start)
        expect(actualRange.end).toBeCloseTo(expectedRanges.current.end)
        expect(actualOriginal.start).toBe(expectedRanges.original.start)
        expect(actualOriginal.end).toBe(expectedRanges.original.end)
    }

    function calculateScale(ranges: OrdinalAxisRange): number {
        return ranges.currentDistance / ranges.originalDistance
    }

    /**
     * Ranges before and after zoom should have the same scale as calculated by the
     * measure of the zoomed range divided by the measure of the original range.
     * @param previousRanges The ranges before the zoom
     * @param currentRanges The ranges after the zoom
     */
    function validateScale(previousRanges: OrdinalAxisRange, currentRanges: OrdinalAxisRange): void {
        expect(Math.abs(calculateScale(previousRanges) - calculateScale(currentRanges))).toBeLessThan(1e-10)
    }

    it('should scale bounds and original bounds the same when they are both the same', () => {
        const expectedRange = OrdinalAxisRange.from(0, 200, 0, 200)
        const range = OrdinalAxisRange.from(0, 100, 0, 100)
        const zoomedRange = range.zoom(100, 200)
        validateRanges(zoomedRange, expectedRange)
        validateScale(range, zoomedRange)
    })

    it('should scale bounds and original bounds when ordinal axis is zoomed by 10 percent', () => {
        const expectedRange = OrdinalAxisRange.from(-55, 220, 0, 110)
        const range = OrdinalAxisRange.from(-50, 200, 0, 100)
        const zoomedRange = range.zoom(100, 110)
        validateRanges(zoomedRange, expectedRange)
    })

    it('should scale bounds and original bounds when ordinal axis is zoomed by 500 percent', () => {
        const expectedRange = OrdinalAxisRange.from(-250, 1000, 0, 500)
        const range = OrdinalAxisRange.from(-50, 200, 0, 100)
        const zoomedRange = range.zoom(100, 500)
        validateRanges(zoomedRange, expectedRange)
    })

    it('should scale bounds and original bounds when ordinal axis is zoomed by 10 percent and ends are same', () => {
        const expectedRange = OrdinalAxisRange.from(-750, 500, 0, 500)
        const range = OrdinalAxisRange.from(-150, 100, 0, 100)
        const zoomedRange = range.zoom(100, 500)
        validateRanges(zoomedRange, expectedRange)
    })
});