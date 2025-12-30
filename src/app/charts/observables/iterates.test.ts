import {scan} from 'rxjs/operators';
import {Observable, range} from 'rxjs';
import {initialTimeSeriesChartData, TimeSeriesChartData} from "../series/timeSeriesChartData";
import {Datum, datumOf, TimeSeries} from "../series/timeSeries";
import {seriesFrom} from "../series/baseSeries";

/**
 * Higher-order function that forms a closure on the tent-map parameter, mu,
 * and returns a tent-map function that accepts time and an iterate value. The
 * time is only used for chart information, and not in the calculation of the
 * next iterate.
 * <pre>f[n+1](x) = mu * min(f[n](x), 1 - f[n](x))</pre>
 * @param mu The "slope" of the tent function
 * @return A datum, (t, f[n+1](x)) holding the informational time, and the
 * value of the next iterate
 */
function tentMapFn(mu: number): (time: number, xn: number) => Datum {
    const cleanMu = Math.max(0, Math.min(mu, 2))

    // the time is just the data collection time and does not factor int
    // the tent map calculation.
    return (time: number, xn: number): Datum => {
        const xn1 = cleanMu * Math.min(xn, 1 - xn)
        return datumOf(time, xn1)
    }
}

/**
 * Higher-order function that forms a closure on the update-period of the incoming data.
 * This function returns an accumulator function that uses the previous iterate (time-series
 * chart-data) to calculate the next iterate (time-series chart-data).
 * @param updatePeriod The update period, in milliseconds, forming the processing
 * windows of the graph
 * @return A function returns an accumulator function that uses the previous iterate (time-series
 * chart-data) to calculate the next iterate (time-series chart-data).
 */
function accumulateTentDataAt(updatePeriod: number):
    (previous: TimeSeriesChartData, iterateNum: number, tentMap: (time: number, xn: number) => Datum) => TimeSeriesChartData
{
    /**
     * Calculates the next iterate, given the previous iterate, by applying the
     * specified `tentMap` function
     * @param previous The previous iterate
     * @param iterateNum The iterate
     * @param tentMap The function to calculate the tent-map
     * @return The next iterate
     */
    return (
        previous: TimeSeriesChartData,
        iterateNum: number,
        tentMap: (time: number, xn: number) => Datum
    ): TimeSeriesChartData => {
        // make a copy of the current max times, which we'll update with new points
        const maxTimes = new Map(previous.maxTimes.entries())
        previous.newPoints.forEach((datum, name) => {
            maxTimes.set(name, (datum[datum.length - 1].time + updatePeriod))
        })
        // deep copy of the previous data points, and calculate the next point
        const newPoints = new Map(Array.from(previous.newPoints.entries())
            .map(([name, data]) => [name, data.slice()]))
        newPoints.forEach((data, _) => {
            const lastDatum = data[data.length - 1]
            const newDatum = tentMap(lastDatum.time + updatePeriod, lastDatum.value)
            data.shift()
            data.push(newDatum)
        })

        return {
            seriesNames: new Set<string>(previous.newPoints.keys()),
            maxTime: previous.maxTime + updatePeriod,
            maxTimes,
            newPoints,
            currentTime: (previous.currentTime || 0) + updatePeriod
        }
    }
}

/**
 * Calculates and returns a time-series of iterates of the tent-map function.
 * @param numPoints The number of iterates to calculate
 * @param mu The slope of the tent-map function
 * @param series The initial series
 * @param updatePeriod The update period (chart-window processing)
 * @return An observable of time-series chart-data holding the iterates
 */
function tentMapTimeSeriesObservable(
    numPoints: number = 10,
    mu: number,
    series: Array<TimeSeries>,
    updatePeriod: number = 25
): Observable<TimeSeriesChartData> {
    const maxTime = series
        .map(srs => srs.last().map(datum => datum.time).getOrElse(0))
        .reduce((tMax, tCurr) => (tCurr > tMax) ? tCurr : tMax, -Infinity)
    const initialData = initialTimeSeriesChartData(series, maxTime)
    const tentMap = tentMapFn(mu)
    const accumulateFn = accumulateTentDataAt(updatePeriod);
    return range(series.length, numPoints).pipe(
        scan((prev, sequence) => accumulateFn(prev, sequence + 1, tentMap), initialData)
    )
}

describe('when calculating tent-map iterates', () => {

    const expected: Array<TimeSeriesChartData> = [
        {
            seriesNames: new Set<string>(["test1"]),
            maxTime: 26,
            maxTimes: new Map([["test1", 26]]),
            newPoints: new Map([["test1", [datumOf(26, 0.578)]]]),
            currentTime: 26
        },
        {
            seriesNames: new Set<string>(["test1"]),
            maxTime: 51,
            maxTimes: new Map([["test1", 51]]),
            newPoints: new Map([["test1", [datumOf(51, 0.7174)]]]),
            currentTime: 51
        },
        {
            seriesNames: new Set<string>(["test1"]),
            maxTime: 76,
            maxTimes: new Map([["test1", 76]]),
            newPoints: new Map([["test1", [datumOf(76, 0.48042)]]]),
            currentTime: 76
        },
        {
            seriesNames: new Set<string>(["test1"]),
            maxTime: 101,
            maxTimes: new Map([["test1", 101]]),
            newPoints: new Map([["test1", [datumOf(101, 0.816714)]]]),
            currentTime: 101
        },
        {
            seriesNames: new Set<string>(["test1"]),
            maxTime: 126,
            maxTimes: new Map([["test1", 126]]),
            newPoints: new Map([["test1", [datumOf(126, 0.3115862)]]]),
            currentTime: 126
        },
        {
            seriesNames: new Set<string>(["test1"]),
            maxTime: 151,
            maxTimes: new Map([["test1", 151]]),
            newPoints: new Map([["test1", [datumOf(151, 0.52969654)]]]),
            currentTime: 151
        },
        {
            seriesNames: new Set<string>(["test1"]),
            maxTime: 176,
            maxTimes: new Map([["test1", 176]]),
            newPoints: new Map([["test1", [datumOf(176, 0.799515882)]]]),
            currentTime: 176
        },
        {
            seriesNames: new Set<string>(["test1"]),
            maxTime: 201,
            maxTimes: new Map([["test1", 201]]),
            newPoints: new Map([["test1", [datumOf(201, 0.3408230006)]]]),
            currentTime: 201
        },
        {
            seriesNames: new Set<string>(["test1"]),
            maxTime: 226,
            maxTimes: new Map([["test1", 226]]),
            newPoints: new Map([["test1", [datumOf(226, 0.5793991)]]]),
            currentTime: 226
        },
        {
            seriesNames: new Set<string>(["test1"]),
            maxTime: 251,
            maxTimes: new Map([["test1", 251]]),
            newPoints: new Map([["test1", [datumOf(251, 0.7150215282659962)]]]),
            currentTime: 251
        },
    ]

    function assertChartDataEqual(expected: TimeSeriesChartData, actual: TimeSeriesChartData): void {
        expect(actual.maxTime).toEqual(expected.maxTime);
        expect(actual.maxTimes).toEqual(expected.maxTimes);
        Array.from(actual.newPoints.entries())
            .forEach(([name, data]: [string, Array<Datum>], index: number) => {
                data.forEach(actualDatum => {
                    const expectedDatum: Datum = expected.newPoints.get(name)![index]
                    expect(actualDatum.time).toEqual(expectedDatum.time)
                    expect(actualDatum.value).toBeCloseTo(expectedDatum.value, 6)
                })
            })
    }

    test('should be able to calculate the tent-map iterates', done => {
        let results: Array<TimeSeriesChartData> = []
        const initialData: Array<TimeSeries> = [seriesFrom("test1", [datumOf(1, 0.66)])]
        tentMapTimeSeriesObservable(10, 1.7, initialData).subscribe(chartData => results.push(chartData))
        done()
        expect(results).toHaveLength(10)
        results.forEach((result, index) => {
            assertChartDataEqual(expected[index], result)
        })
    })
})