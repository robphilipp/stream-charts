import {emptyIterateDatum, iterateDatumOf, iterateSeriesFromTuples, nonEmptyIterateDatum} from "./iterateSeries";

describe('iterateDatumOf', () => {
    it('should build an IterateDatum from (time, iterateN, iterateN_1)', () => {
        expect(iterateDatumOf(1, 2, 3)).toEqual({time: 1, iterateN: 2, iterateN_1: 3});
    });
});

describe('emptyIterateDatum', () => {
    it('should have time, iterateN, and iterateN_1 all NaN', () => {
        expect(emptyIterateDatum.time).toBeNaN();
        expect(emptyIterateDatum.iterateN).toBeNaN();
        expect(emptyIterateDatum.iterateN_1).toBeNaN();
    });

    it('should be considered empty by nonEmptyIterateDatum', () => {
        expect(nonEmptyIterateDatum(emptyIterateDatum)).toBe(false);
    });
});

describe('nonEmptyIterateDatum', () => {
    it('should return true when time, iterateN, and iterateN_1 are all defined', () => {
        expect(nonEmptyIterateDatum(iterateDatumOf(1, 2, 3))).toBe(true);
    });

    it('should return false when only time is NaN', () => {
        expect(nonEmptyIterateDatum(iterateDatumOf(NaN, 2, 3))).toBe(false);
    });

    it('should return false when only iterateN is NaN', () => {
        expect(nonEmptyIterateDatum(iterateDatumOf(1, NaN, 3))).toBe(false);
    });

    it('should return false when only iterateN_1 is NaN', () => {
        expect(nonEmptyIterateDatum(iterateDatumOf(1, 2, NaN))).toBe(false);
    });
});

describe('iterateSeriesFromTuples', () => {
    it('should build a series from an array of (time, iterateN, iterateN_1) tuples', () => {
        const series = iterateSeriesFromTuples('s1', [[0, 1, 2], [1, 2, 3]]);
        expect(series.name).toBe('s1');
        expect(series.length()).toBe(2);
        expect(series.last().getOrElse(emptyIterateDatum)).toEqual({time: 1, iterateN: 2, iterateN_1: 3});
    });

    it('should default to an empty series when no data is given', () => {
        expect(iterateSeriesFromTuples('s1').isEmpty()).toBe(true);
    });
});
