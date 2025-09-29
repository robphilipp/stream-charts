import {emptySeries, seriesFrom} from "./baseSeries";

describe('should be able to create an empty series', () => {
    test('an empty series should be empty', () => {
        expect(emptySeries('test1').isEmpty());
    });

    test('an empty series should not have a last element', () => {
        expect(emptySeries('test1').last().failed);
    });

    test('an empty series should have 0 length', () => {
        expect(emptySeries('test1').length()).toBe(0);
    });

    test('an empty series should not have any data', () => {
        expect(emptySeries('test1').data.length).toBe(0);
    });

    test('an empty series should have the specified name', () => {
        expect(emptySeries('test1').name).toBe('test1');
    });
});

describe('should be able to create a series from data', () => {
    const data = [
        {time: 1, value: 10},
        {time: 2, value: 20},
        {time: 3, value: 30},
        {time: 4, value: 40},
        {time: 5, value: 50},
        {time: 6, value: 60},
        {time: 7, value: 70},
        {time: 8, value: 80},
        {time: 9, value: 90},
        {time: 10, value: 100},
    ];
    const series = seriesFrom('test2', data);

    test('series should not be empty', () => {
        expect(!series.isEmpty())
    });

    test('series name should be test2', () => {
        expect(series.name).toEqual('test2')
    });

    test('series should have 10 points', () => {
        expect(series.length()).toBe(10);
    });

    test('last value in series should be (10, 100)', () => {
        const lastElement = series.last().getOrElse({time: NaN, value: NaN});
        expect(lastElement).toEqual({time: 10, value: 100});
    });

    test('series data should equal original data', () => {
        expect(series.data).toEqual(data);
    });
});