import {copyChartData, defaultChartData} from "./ChartData";

describe('defaultChartData', () => {
    it('should return an empty set of series names', () => {
        expect(defaultChartData().seriesNames.size).toBe(0);
    });

    it('should return a fresh Set each call', () => {
        expect(defaultChartData().seriesNames).not.toBe(defaultChartData().seriesNames);
    });
});

describe('copyChartData', () => {
    it('should copy the series names', () => {
        const data = {seriesNames: new Set(['a', 'b'])};
        expect(copyChartData(data).seriesNames).toEqual(new Set(['a', 'b']));
    });

    it('should return an independent copy of the seriesNames set', () => {
        const original = {seriesNames: new Set(['a'])};
        const copy = copyChartData(original);

        expect(copy.seriesNames).not.toBe(original.seriesNames);

        copy.seriesNames.add('b');
        expect(original.seriesNames.has('b')).toBe(false);
    });
});
