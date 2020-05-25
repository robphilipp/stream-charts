import {interval, Observable} from "rxjs";
import {Datum} from "../charts/datumSeries";
import {map, scan} from "rxjs/operators";

const UPDATE_PERIOD_MS = 25;

/**
 * The spike-chart data produced by the rxjs observable that is pushed to the `RasterChart`
 */
export interface ChartData {
    maxTime: number;
    newPoints: Array<IndexedDatum>
}

interface IndexedDatum {
    index: number;
    datum: Datum;
}

/**
 * Creates an empty chart data object with all the values set to 0
 * @param {number} numSeries The number of series in the chart data
 * @return {ChartData} An empty chart data object
 */
function emptyChartData(numSeries: number): ChartData {
    return {
        maxTime: 0,
        newPoints: new Array<Datum>(numSeries)
            .fill({} as Datum)
            .map((_: Datum, i: number) => ({
                index: i,
                datum: {
                    time: 0,
                    value: 0
                }
            }))
    }
}

/**
 * Creates a random spike for each series and within (time - update_period, time)
 * @param {number} time The current time
 * @param {number} numSeries The number of series
 * @param {number} updatePeriod The update period (ms)
 * @return {ChartData} A random chart data
 */
function randomSpikeData(time: number, numSeries: number, updatePeriod: number): ChartData {
    return {
        maxTime: time,
        newPoints: new Array<Datum>(numSeries)
            .fill({} as Datum)
            .map((_: Datum, i: number) => ({
                index: i,
                datum: {
                    time: time - Math.ceil(Math.random() * updatePeriod),
                    value: Math.random() > 0.2 ? Math.random() : 0
                }
            }))
    };
}

/**
 * Creates random set of time-series data
 * @param {number} numSeries The number of time-series for which to generate data (i.e. one for each neuron)
 * @param {number} [updatePeriod=25] The time-interval between the generation of subsequent data points
 * @return {Observable<SpikesChartData>} An observable that produces data.
 */
export function randomSpikeDataObservable(numSeries: number, updatePeriod: number = UPDATE_PERIOD_MS): Observable<ChartData> {
    return interval(updatePeriod).pipe(
        // convert the number sequence to a time
        map(sequence => sequence * updatePeriod),
        // create a random spike for each series
        map((time, index) => randomSpikeData(time, numSeries, updatePeriod))
    );
}

/**
 * Creates random weight data
 * @param {number} time The current time
 * @param {number} numSeries The number of series
 * @param {number} updatePeriod The update period (ms)
 * @param {number} delta The largest change in weight
 * @return {ChartData} The random chart data
 */
function randomWeightData(time: number, numSeries: number, updatePeriod: number, delta: number): ChartData {
    return {
        maxTime: time,
        newPoints: new Array<Datum>(numSeries)
            .fill({} as Datum)
            .map((_: Datum, i: number) => ({
                index: i,
                datum: {
                    time: time - Math.ceil(Math.random() * updatePeriod),
                    value: (Math.random() - 0.5) * 2 * delta
                }
            }))
    };
}

/**
 * Adds the accumulated chart data to the current random one
 * @param {ChartData} acc The accumulated chart data
 * @param {ChartData} cd The random chart data
 * @return {ChartData} The accumulated chart data
 */
function accumulateChartData(acc: ChartData, cd: ChartData): ChartData {
    return {
        maxTime: cd.maxTime,
        newPoints: acc.newPoints.map((datum: IndexedDatum, i: number) => ({
            index: i,
            datum: {
                time: cd.newPoints[i].datum.time,
                value: datum.datum.value + cd.newPoints[i].datum.value
            }
        }))
    }
}

/**
 * Creates random set of time-series data, essential creating a random walk for each series
 * @param {number} numSeries The number of time-series for which to generate data (i.e. one for each neuron)
 * @param {number} delta The max change in weight
 * @param {number} [updatePeriod=25] The time-interval between the generation of subsequent data points
 * @return {Observable<ChartData>} An observable that produces data.
 */
export function randomWeightDataObservable(numSeries: number, delta: number, updatePeriod: number = 25): Observable<ChartData> {
    return interval(updatePeriod).pipe(
        // convert the number sequence to a time
        map(sequence => (sequence + 1) * updatePeriod),

        // create a new (time, value) for each series
        map((time, index) => randomWeightData(time, numSeries, updatePeriod, delta)),

        // add the random value to the previous random value in succession to create a random walk for each series
        scan((acc, value) => accumulateChartData(acc, value), emptyChartData(numSeries))
    );
}
