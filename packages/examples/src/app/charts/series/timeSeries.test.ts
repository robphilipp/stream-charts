import {datumOf, emptyDatum, timeSeriesFromTuples} from "./timeSeries";

describe('datumOf', () => {
    it('should build a Datum from a (time, value) pair', () => {
        expect(datumOf(5, 10)).toEqual({x: 5, y: 10});
    });
});

describe('emptyDatum', () => {
    it('should return a datum with both x and y as NaN', () => {
        const datum = emptyDatum();
        expect(datum.x).toBeNaN();
        expect(datum.y).toBeNaN();
    });
});

describe('timeSeriesFromTuples', () => {
    it('should build a series from an array of (x, y) tuples', () => {
        const series = timeSeriesFromTuples('s1', [[0, 10], [1, 20], [2, 30]]);
        expect(series.name).toBe('s1');
        expect(series.length()).toBe(3);
        expect(series.last().getOrElse(emptyDatum())).toEqual({x: 2, y: 30});
    });

    it('should default to an empty series when no data is given', () => {
        const series = timeSeriesFromTuples('s1');
        expect(series.isEmpty()).toBe(true);
    });
});
