import {emptyTimeSeriesChartData, type TimeSeriesChartData} from "../series/timeSeriesChartData";
import {type Datum, datumOf, type TimeSeries} from "../series/timeSeries";
import {seriesFrom} from "../series/baseSeries";
import {Observable, of, range} from "rxjs";
import {map} from "rxjs/operators";
import {type OrdinalChartData, ordinalsObservable} from "./ordinals";
import {calculateOrdinalStats, type OrdinalDatum, ordinalDatumOf} from "../series/ordinalSeries";

export function sinFn(x: number, period: number): number {
    return Math.sin(2 * Math.PI * x / period)
}

describe('when generating ordinal series', () => {
    const NUM_POINTS = 10
    const UPDATE_PERIOD = 25
    const seriesData: Array<[string, number]> = [["test1", sinFn(0, 250)], ["test2", sinFn(1, 251)], ["test3", sinFn(2, 252)]]

    const initialData: Array<TimeSeries> = seriesData
        .map(([name, value], index) => seriesFrom(name, [datumOf(index, value)]))

    test('should be able to generate ordinals', done => {
        const results: Array<OrdinalChartData> = []
        ordinalsObservable(
            sineDataObservable(initialData, NUM_POINTS, UPDATE_PERIOD)
        ).subscribe(chartData => results.push(chartData))

        // blocks until done is called
        done()

        expect(results).toHaveLength(NUM_POINTS)

        results.forEach((result, timeIndex) => {
            Array.from(result.newPoints.entries()).forEach(([seriesName, ordinalDatum], index) => {
                expect(seriesName).toEqual(seriesData[index][0])

                // check the time for the datum (only one new-point datum)
                expect(ordinalDatum).toBeDefined()
                expect(ordinalDatum.length).toBe(1)
                expect(ordinalDatum[0].time).toEqual(index+ timeIndex * UPDATE_PERIOD)

                // should be bounded (data is bounded)
                expect(ordinalDatum[0].value).toBeLessThanOrEqual(1)
                expect(ordinalDatum[0].value).toBeGreaterThanOrEqual(-1)
            })

            // the min time should be 1 and the max time should be (3 + timeIndex + updatePeriod)
            expect(result.stats.minDatum.time.time).toBe(0)
            expect(result.stats.maxDatum.time.time).toBe(2 + timeIndex * UPDATE_PERIOD)
        })

    })

})

/**
 * Builds a single-tick {@link TimeSeriesChartData} with one series holding one (x, y) datum, used
 * to drive {@link ordinalsObservable}'s internal `scan` accumulator one point at a time.
 */
function tick(seriesName: string, x: number, y: number): TimeSeriesChartData {
    return {
        ...emptyTimeSeriesChartData([seriesName]),
        maxTime: x,
        maxTimes: new Map([[seriesName, x]]),
        newPoints: new Map([[seriesName, [{x, y}]]]),
    }
}

describe('min/max time and value tracking', () => {
    // guards against a regression of M10: the reducer used `if (x < min) {...} else if (x > max)
    // {...}`, so a single datum could only ever update min OR max, never both. Since min/max start
    // at +-Infinity, a single data point (which is trivially both the min and the max so far) or a
    // decreasing sequence of points left the other bound frozen at its +-Infinity sentinel forever
    it('sets both min and max to a single data point, which is trivially both', () => {
        const results: Array<OrdinalChartData> = []
        ordinalsObservable(of(tick('s1', 10, 5))).subscribe(chartData => results.push(chartData))

        expect(results).toHaveLength(1)
        const {stats} = results[0]
        expect(stats.minDatum.time.time).toBe(10)
        expect(stats.maxDatum.time.time).toBe(10)
        expect(stats.minDatum.value.value).toBe(5)
        expect(stats.maxDatum.value.value).toBe(5)
    })

    it('tracks the max across a decreasing time/value sequence instead of freezing at the sentinel', () => {
        const results: Array<OrdinalChartData> = []
        ordinalsObservable(of(tick('s1', 10, 8), tick('s1', 5, 3)))
            .subscribe(chartData => results.push(chartData))

        expect(results).toHaveLength(2)
        const {stats} = results[1]
        expect(stats.minDatum.time.time).toBe(5)
        expect(stats.maxDatum.time.time).toBe(10)
        expect(stats.minDatum.value.value).toBe(3)
        expect(stats.maxDatum.value.value).toBe(8)
    })
})

describe('seeding the stats with the stats of existing data', () => {
    it('accumulates the stats from the seed rather than from scratch', () => {
        const seed = calculateOrdinalStats([seriesFrom<OrdinalDatum>('s1', [ordinalDatumOf(0, 's1', 2), ordinalDatumOf(1, 's1', 4)])])
        const results: Array<OrdinalChartData> = []
        ordinalsObservable(of(tick('s1', 10, 6)), undefined, seed).subscribe(chartData => results.push(chartData))

        expect(results).toHaveLength(1)
        const stats = results[0].stats
        // the existing two points (2, 4) plus the new one (6)
        expect(stats.valueStatsForSeries.get('s1')!.count).toBe(3)
        expect(stats.valueStatsForSeries.get('s1')!.mean).toBe(4)
        expect(stats.minDatum.value.value).toBe(2)
        expect(stats.maxDatum.value.value).toBe(6)
        expect(stats.minDatum.time.time).toBe(0)
        expect(stats.maxDatum.time.time).toBe(10)
        // only the new point is emitted as new
        expect(results[0].newPoints.get('s1')!.length).toBe(1)
    })

    it('does not modify the seed', () => {
        const seed = calculateOrdinalStats([seriesFrom<OrdinalDatum>('s1', [ordinalDatumOf(0, 's1', 2)])])
        ordinalsObservable(of(tick('s1', 10, 6)), undefined, seed).subscribe()
        expect(seed.valueStatsForSeries.get('s1')!.count).toBe(1)
    })
})

/**
 * Creates random data
 * @param sequenceTime The current time
 * @param maxTime The number of points in the series
 * @param series The list of series names (identifiers) to update
 * @param seriesMaxTimes The maximum time for each series
 * @return The random chart data
 */
function sineData(
    sequenceTime: number,
    maxTime: number,
    series: Array<string>,
    seriesMaxTimes: Map<string, number>
): TimeSeriesChartData {
    const maxTimes = new Map(Array.from(
        seriesMaxTimes.entries()).map(([name, maxTime]) => [name, maxTime + sequenceTime])
    )
    return {
        seriesNames: new Set(series),
        maxTime: sequenceTime,
        maxTimes,
        newPoints: new Map(series.map((name, index) => {
            const time = sequenceTime + index
            const value = sinFn(time, maxTime + index)
            return [name, [{x: time, y: value}]]
        }))
    };
}

/**
 * Creates an empty chart data object with all the values set to 0
 * @param seriesList The list of series names (identifiers) to update
 * @param currentTime=0] The current time
 * @return An empty chart data object
 */
function initialChartData(seriesList: Array<TimeSeries>, currentTime: number = 0): TimeSeriesChartData {
    const maxTime = seriesList.reduce(
        (tMax, series) => Math.max(tMax, series.last().map(datum => datum.x).getOrElse(-Infinity)),
        -Infinity
    )
    return {
        seriesNames: new Set(seriesList.map(series => series.name)),
        maxTime,
        maxTimes: new Map(seriesList.map(series => [series.name, series.last().map(datum => datum.x).getOrElse(0)])),
        newPoints: new Map<string, Array<Datum>>(seriesList.map(series => [
            series.name,
            [{
                x: series.last().map(datum => datum.x).getOrElse(0),
                y: series.last().map(datum => datum.y).getOrElse(0)
            }]
        ])),
        currentTime: currentTime
    }
}

/**
 * Creates random set of time-series data, essentially creating a random walk for each series
 * @param series The number of time-series for which to generate data (i.e. one for each neuron)
 * @param numPoints The number of points to generate
 * @param [updatePeriod=25] The time-interval between the generation of subsequent data points
 * @return An observable that produces data.
 */
function sineDataObservable(
    series: Array<TimeSeries>,
    numPoints: number = 10,
    updatePeriod: number = 25,
): Observable<TimeSeriesChartData> {
    const seriesNames = series.map(series => series.name)
    const initialData = initialChartData(series)
    return range(0, numPoints).pipe(
        // convert the number sequence to a time
        map(sequence => sequence * updatePeriod),

        // create a new (time, value) for each series
        map(time => {
            if (time <= initialData.maxTime) {
                return initialData
            }
            return sineData(time, numPoints * updatePeriod, seriesNames, initialData.maxTimes)
        }),
    )
}
