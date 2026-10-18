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

    it('should not divide by zero when the before-dimension is zero (e.g. a chart mounted while hidden)', () => {
        const range = OrdinalAxisRange.from(0, 100, 0, 100)
        const zoomedRange = range.zoom(0, 300)
        expect(Number.isFinite(zoomedRange.current.start)).toBe(true)
        expect(Number.isFinite(zoomedRange.current.end)).toBe(true)
        expect(Number.isFinite(zoomedRange.original.start)).toBe(true)
        expect(Number.isFinite(zoomedRange.original.end)).toBe(true)
        expect(zoomedRange.current.start).toBe(0)
        expect(zoomedRange.current.end).toBe(300)
    })

    it('should not divide by zero when scaling a range whose original is degenerate (e.g. a plot laid out with 0 width/height)', () => {
        const range = OrdinalAxisRange.from(0, 0, 0, 0)
        const scaled = range.scale(2, 0)
        expect(Number.isFinite(scaled.current.start)).toBe(true)
        expect(Number.isFinite(scaled.current.end)).toBe(true)
        // no meaningful scale factor can be derived from a zero-measure original, so the range
        // is left unchanged rather than corrupted to NaN/Infinity
        expect(scaled.current.start).toBe(0)
        expect(scaled.current.end).toBe(0)
    })

    it('should not divide by zero when constrained-scaling a range whose original is degenerate', () => {
        const range = OrdinalAxisRange.from(0, 0, 0, 0)
        const scaled = range.constrainedScale(2, 0, [0, 0])
        expect(Number.isFinite(scaled.current.start)).toBe(true)
        expect(Number.isFinite(scaled.current.end)).toBe(true)
    })
});

describe('scale and constrainedScale should be immune to pivot drift', () => {
    /**
     * Zooming in at one pivot and back out (cumulative factor returning to 1) at a *different*
     * pivot must land exactly back on `.original`, regardless of the pivots used along the way --
     * this is the bug reported against BarPlot where zooming in at one location and back out at
     * another left categories permanently clipped off one edge.
     */
    it('should return exactly to the original range after zooming in at one pivot and back out at a different pivot', () => {
        const original = OrdinalAxisRange.from(0, 1000)

        const zoomedIn = original.scale(5, 300)
        const zoomedOut = zoomedIn.scale(1, 800)

        expect(zoomedOut.current.start).toBe(original.original.start)
        expect(zoomedOut.current.end).toBe(original.original.end)
    })

    it('should return exactly to the original range via constrainedScale as well', () => {
        const original = OrdinalAxisRange.from(0, 1000)
        // matches real usage (see `calcOrdinalZoomAndUpdate`): the constraint is the original
        // bounds, which `constrainedScale` widens the result to include if the scaled interval
        // would otherwise be narrower.
        const constraint: [min: number, max: number] = [original.original.start, original.original.end]

        const zoomedIn = original.constrainedScale(5, 300, constraint)
        const zoomedOut = zoomedIn.constrainedScale(1, 800, constraint)

        expect(zoomedOut.current.start).toBe(original.original.start)
        expect(zoomedOut.current.end).toBe(original.original.end)
    })

    /**
     * Continuing to zoom (not returning to the k=1 floor) at a *different* pivot than a prior zoom
     * event must compose smoothly from `.current` -- not jump. A naive "always scale `.original` by
     * the cumulative factor" fix for the pivot-drift bug above breaks this: it recomputes the whole
     * zoom from scratch at the new pivot every event, discarding history, which is only equivalent
     * to the correct composition when the pivot never changes.
     */
    it('should compose smoothly (no jump) when continuing to zoom at a different pivot without returning to k=1', () => {
        const original = OrdinalAxisRange.from(0, 1000)

        const afterFirstZoom = original.scale(5, 300)
        const afterSecondZoom = afterFirstZoom.scale(6, 800)

        // correct incremental composition: from current=[-1200,3800] (k=5), stepping to k=6 is an
        // incremental factor of 6/5 pivoting at 800 -- dtStart=2000, dtEnd=3000
        // start = 800 - 2000*(6/5) = -1600; end = 800 + 3000*(6/5) = 4400
        expect(afterSecondZoom.current.start).toBeCloseTo(-1600)
        expect(afterSecondZoom.current.end).toBeCloseTo(4400)
    })
})