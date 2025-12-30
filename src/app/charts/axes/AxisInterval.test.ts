import {AxisInterval, copyRangeMap} from "./AxisInterval";

describe('AxisInterval', () => {

    describe('AxisInterval creation', () => {
        it('should create an AxisInterval with valid start and end values', () => {
            const interval = AxisInterval.from(1, 5);
            expect(interval.start).toBe(1);
            expect(interval.end).toBe(5);
        });

        it('should create an AxisInterval with correct start and end when the start is greater than the end', () => {
            const interval = AxisInterval.from(5, 1);
            expect(interval.start).toBe(1);
            expect(interval.end).toBe(5);
        })

        it('should create an AxisInterval from a tuple holding start and end values', () => {
            const interval = AxisInterval.as([1, 5]);
            expect(interval.start).toBe(1);
            expect(interval.end).toBe(5);
        })

        it('should create an empty AxisInterval', () => {
            const interval = AxisInterval.empty();
            expect(interval.start).toBeNaN()
            expect(interval.end).toBeNaN()
        })

        it('should create an empty AxisInterval with start and end NaN', () => {
            const interval = AxisInterval.from(NaN, NaN);
            expect(interval.start).toBeNaN()
            expect(interval.end).toBeNaN()
        })

        it('should create a new copy of an existing AxisInterval', () => {
            const interval = AxisInterval.from(1, 5);
            const copy = interval.copy();
            expect(copy.start).toBe(1);
            expect(copy.end).toBe(5);
            expect(copy).not.toBe(interval);
        })
    })

    describe('AxisInterval comparison', () => {
        const interval1 = AxisInterval.from(1, 5);
        const interval2 = AxisInterval.from(1, 5);
        const interval3 = AxisInterval.from(2, 5);
        const emptyInterval = AxisInterval.empty();

        it('should return true when comparing two AxisIntervals with the same start and end values', () => {
            expect(interval1.equals(interval2)).toBe(true)
            expect(interval1.equalsInterval(1, 5)).toBe(true)
        });

        it('should return not-equal when comparing two AxisIntervals with different start and end values', () => {
            expect(interval1.equals(interval3)).toBe(false)
            expect(interval1.equalsInterval(1, 3)).toBe(false)
        })

        it('should return true when comparing two empty intervals', () => {
            expect(AxisInterval.empty().equals(emptyInterval)).toBe(true)
        })
    })

    describe('AxisInterval conversion', () => {
        it('should convert an AxisInterval to a tuple', () => {
            const interval = AxisInterval.from(1, 5);
            const tuple = interval.asTuple();
            expect(tuple).toEqual([1, 5]);
        })

        it('should map an AxisInterval to a new AxisInterval', () => {
            const interval = AxisInterval.from(1, 5)
            const mappedInterval = interval.map((start, end) => ([start * 2, end * 3]))

            expect(mappedInterval.start).toBe(2);
            expect(mappedInterval.end).toBe(15);
            expect(mappedInterval).not.toBe(interval);
        })

        it('should calculate the measure of an AxisInterval', () => {
            const interval = AxisInterval.from(1, 5)
            expect(interval.measure()).toBe(4);
        })

        it('should calculate the measure of an empty AxisInterval', () => {
            const interval = AxisInterval.empty()
            expect(interval.measure()).toBe(0);
        })

        it('should translate the start of the AxisInterval', () => {
            const interval = AxisInterval.from(1, 5)
            const translatedInterval = interval.translateStart(12)
            expect(translatedInterval.start).toBe(5);
            expect(translatedInterval.end).toBe(13);
            expect(translatedInterval).not.toBe(interval);
        })

        it('should translate the start of an empty interval into an empty interval', () => {
            expect(AxisInterval.empty().translateStart(12)).toEqual(AxisInterval.empty())
        })

        it('should translate the end of the AxisInterval', () => {
            const interval = AxisInterval.from(1, 5)
            const translatedInterval = interval.translateEnd(-12)
            expect(translatedInterval.start).toBe(-7);
            expect(translatedInterval.end).toBe(1);
            expect(translatedInterval).not.toBe(interval);
        })

        it('should translate the end of an empty interval into an empty interval', () => {
            expect(AxisInterval.empty().translateEnd(12)).toEqual(AxisInterval.empty())
        })

        it('should translate an AxisInterval', () => {
            const interval = AxisInterval.from(1, 5)
            const translatedInterval = interval.translate(-12)
            expect(translatedInterval.start).toBe(-11);
            expect(translatedInterval.end).toBe(-7);
            expect(translatedInterval).not.toBe(interval);
        })

        it('should translate an empty interval into an empty interval', () => {
            expect(AxisInterval.empty().translate(12)).toEqual(AxisInterval.empty())
        })
    })

    describe('Copy a range map', () => {
        it('should create a copy of a range map', () => {
            const ranges = new Map<string, AxisInterval>([
                ['a', AxisInterval.from(1, 5)],
                ['b', AxisInterval.from(10, 20)]
            ])
            const copy = copyRangeMap(ranges)

            expect(copy).not.toBe(ranges)
            expect(copy.size).toBe(ranges.size)
            expect(copy.get('a')).toEqual(ranges.get('a'))
            expect(copy.get('b')).toEqual(ranges.get('b'))
        })
    })
})