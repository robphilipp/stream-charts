import {emptyTimeSeriesChartData, initialTimeSeriesChartData} from "./timeSeriesChartData";
import {timeSeriesFromTuples} from "./timeSeries";

describe('emptyTimeSeriesChartData', () => {
    it('should seed a zeroed (0,0) datum and 0 maxTime for each series name', () => {
        const data = emptyTimeSeriesChartData(['a', 'b']);
        expect(data.seriesNames).toEqual(new Set(['a', 'b']));
        expect(data.maxTime).toBe(0);
        expect(data.maxTimes).toEqual(new Map([['a', 0], ['b', 0]]));
        expect(data.newPoints.get('a')).toEqual([{x: 0, y: 0}]);
        expect(data.newPoints.get('b')).toEqual([{x: 0, y: 0}]);
    });

    it('should return empty collections for an empty series list', () => {
        const data = emptyTimeSeriesChartData([]);
        expect(data.seriesNames.size).toBe(0);
        expect(data.maxTimes.size).toBe(0);
        expect(data.newPoints.size).toBe(0);
    });
});

describe('initialTimeSeriesChartData', () => {
    it('should seed maxTime/maxTimes/newPoints from each series\' last datum', () => {
        const seriesList = [
            timeSeriesFromTuples('a', [[0, 1], [5, 2]]),
            timeSeriesFromTuples('b', [[0, 1], [3, 9]]),
        ];
        const data = initialTimeSeriesChartData(seriesList);

        expect(data.seriesNames).toEqual(new Set(['a', 'b']));
        expect(data.maxTime).toBe(5);
        expect(data.maxTimes).toEqual(new Map([['a', 5], ['b', 3]]));
        expect([...data.newPoints.get('a')!]).toEqual([{x: 5, y: 2}]);
        expect([...data.newPoints.get('b')!]).toEqual([{x: 3, y: 9}]);
    });

    it('should default a series with no data to the (0, 0) datum', () => {
        const data = initialTimeSeriesChartData([timeSeriesFromTuples('empty')]);
        expect(data.maxTimes.get('empty')).toBe(0);
        expect([...data.newPoints.get('empty')!]).toEqual([{x: 0, y: 0}]);
    });

    it('should default maxTime to -Infinity when there are no series at all', () => {
        expect(initialTimeSeriesChartData([]).maxTime).toBe(-Infinity);
    });

    it('should default currentTime to 0 and accept an explicit value', () => {
        expect(initialTimeSeriesChartData([]).currentTime).toBe(0);
        expect(initialTimeSeriesChartData([], 42).currentTime).toBe(42);
    });
});
