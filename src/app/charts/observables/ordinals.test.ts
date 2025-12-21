import {TimeSeriesChartData} from "../series/timeSeriesChartData";
import {Datum, datumOf, TimeSeries} from "../series/timeSeries";
import {seriesFrom} from "../series/baseSeries";
import {Observable, range} from "rxjs";
import {map} from "rxjs/operators";
import {OrdinalChartData, ordinalsObservable} from "./ordinals";
import {sinFn} from "../../examples/randomOrdinalData";

describe('when generating ordinal series', () => {
    const NUM_POINTS = 10
    const UPDATE_PERIOD = 25
    const seriesData: Array<[string, number]> = [["test1", sinFn(0, 250)], ["test2", sinFn(1, 251)], ["test3", sinFn(2, 252)]]

    const initialData: Array<TimeSeries> = seriesData
        .map(([name, value], index) => seriesFrom(name, [datumOf(index, value)]))

    test('should be able to generate ordinals', done => {
        let results: Array<OrdinalChartData> = []
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
            return [name, [{time, value}]]
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
        (tMax, series) => Math.max(tMax, series.last().map(datum => datum.time).getOrElse(-Infinity)),
        -Infinity
    )
    return {
        seriesNames: new Set(seriesList.map(series => series.name)),
        maxTime,
        maxTimes: new Map(seriesList.map(series => [series.name, series.last().map(datum => datum.time).getOrElse(0)])),
        newPoints: new Map<string, Array<Datum>>(seriesList.map(series => [
            series.name,
            [{
                time: series.last().map(datum => datum.time).getOrElse(0),
                value: series.last().map(datum => datum.value).getOrElse(0)
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
