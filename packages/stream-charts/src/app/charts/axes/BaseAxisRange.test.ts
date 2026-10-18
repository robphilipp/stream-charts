import {BaseAxisRange} from "./BaseAxisRange";

/**
 * `BaseAxisRange` is abstract, and its concrete `matchesOriginal`/`currentDistance`/
 * `originalDistance` are already indirectly exercised through `ContinuousAxisRange.test.ts`/
 * `OrdinalAxisRange.test.ts`. This minimal test double exists only to test those directly, plus
 * the `false` case for `matchesOriginal` that isn't asserted anywhere else -- the abstract
 * methods are stubbed since this class doesn't need real zoom/pan behavior for these tests.
 */
class TestAxisRange extends BaseAxisRange {
    constructor(start: number, end: number, originalStart?: number, originalEnd?: number) {
        super(start, end, originalStart, originalEnd)
    }

    scale(): BaseAxisRange {
        return this
    }

    constrainedScale(): BaseAxisRange {
        return this
    }

    translate(): BaseAxisRange {
        return this
    }

    update(): BaseAxisRange {
        return this
    }

    updateOriginal(): BaseAxisRange {
        return this
    }
}

describe('BaseAxisRange', () => {
    it('should default the original interval to (start, end) when not given', () => {
        const range = new TestAxisRange(10, 20)
        expect(range.current.equalsInterval(10, 20)).toBe(true)
        expect(range.original.equalsInterval(10, 20)).toBe(true)
    })

    it('should use the given original interval when provided', () => {
        const range = new TestAxisRange(10, 20, 0, 100)
        expect(range.current.equalsInterval(10, 20)).toBe(true)
        expect(range.original.equalsInterval(0, 100)).toBe(true)
    })

    describe('matchesOriginal', () => {
        it('should return true when the interval matches the original', () => {
            const range = new TestAxisRange(10, 20, 0, 100)
            expect(range.matchesOriginal(0, 100)).toBe(true)
        })

        it('should return false when the interval does not match the original', () => {
            const range = new TestAxisRange(10, 20, 0, 100)
            expect(range.matchesOriginal(10, 20)).toBe(false)
        })
    })

    describe('currentDistance/originalDistance', () => {
        it('should return the measure of the current and original intervals', () => {
            const range = new TestAxisRange(10, 30, 0, 100)
            expect(range.currentDistance).toBe(20)
            expect(range.originalDistance).toBe(100)
        })
    })
})
