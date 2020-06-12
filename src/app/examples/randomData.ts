import {interval, Observable} from "rxjs";
import {Datum} from "../charts/datumSeries";
import {map, scan} from "rxjs/operators";
import {ChartData, emptyChartData} from "../charts/chartData";

const UPDATE_PERIOD_MS = 25;

/**
 * Creates a random spike for each series and within (time - update_period, time)
 * @param {number} time The current time
 * @param {Array<string>} series The list of series names (identifiers) to update
 * @param {number} updatePeriod The update period (ms)
 * @return {ChartData} A random chart data
 */
function randomSpikeData(time: number, series: Array<string>, updatePeriod: number): ChartData {
    return {
        maxTime: time,
        newPoints: new Map(series
            .filter(_ => Math.random() > 0.5)
            .map(name => [
                name,
                [{
                    time: time - Math.ceil(Math.random() * updatePeriod),
                    value: Math.random()
                }]
            ]))
    };
}

/**
 * Creates random set of time-series data
 * @param {Array<string>} series The list of series names (identifiers) to update
 * @param {number} [updatePeriod=25] The time-interval between the generation of subsequent data points
 * @return {Observable<SpikesChartData>} An observable that produces data.
 */
export function randomSpikeDataObservable(series: Array<string>, updatePeriod: number = UPDATE_PERIOD_MS): Observable<ChartData> {
    return interval(updatePeriod).pipe(
        // convert the number sequence to a time
        map(sequence => sequence * updatePeriod),
        // create a random spike for each series
        map((time) => randomSpikeData(time, series, updatePeriod))
    );
}

/**
 * Creates random weight data
 * @param {number} time The current time
 * @param {Array<string>} series The list of series names (identifiers) to update
 * @param {number} updatePeriod The update period (ms)
 * @param {number} delta The largest change in weight
 * @return {ChartData} The random chart data
 */
function randomWeightData(time: number, series: Array<string>, updatePeriod: number, delta: number): ChartData {
    return {
        maxTime: time,
        newPoints: new Map(series.map(name => [
            name,
            [{
                time: time - Math.ceil(Math.random() * updatePeriod),
                value: (Math.random() - 0.5) * 2 * delta
            }]
        ]))
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
        newPoints: mergeSeries(acc.newPoints, cd.newPoints)
    }
}

/**
 * Calculates the successive differences in the values to create a random walk for simulating neuron weights
 * @param {Map<string, Array<Datum>>} accum The "position" in the random walk
 * @param {Map<string, Array<Datum>>} incoming The changes in position
 * @return {Map<string, Array<Datum>>} The merged map holding the new random walk segments
 */
function mergeSeries(accum: Map<string, Array<Datum>>, incoming: Map<string, Array<Datum>>): Map<string, Array<Datum>> {
    incoming.forEach((data, name) => {
        const accData = accum.get(name) || [];
        const lastAccum = accData.length > 0 ? accData[accData.length - 1].value : 0;
        const newData = data.map((datum, index, array) => ({
            time: datum.time,
            value: index === 0 ? lastAccum + datum.value : data[index - 1].value + datum.value
        }))
        accum.set(name, newData);
    })
    return accum;
}

/**
 * Creates random set of time-series data, essential creating a random walk for each series
 * @param {Array<string>} series The number of time-series for which to generate data (i.e. one for each neuron)
 * @param {number} delta The max change in weight
 * @param {number} [updatePeriod=25] The time-interval between the generation of subsequent data points
 * @return {Observable<ChartData>} An observable that produces data.
 */
export function randomWeightDataObservable(series: Array<string>, delta: number, updatePeriod: number = 25): Observable<ChartData> {
    return interval(updatePeriod).pipe(
        // convert the number sequence to a time
        map(sequence => (sequence + 1) * updatePeriod),

        // create a new (time, value) for each series
        map((time, index) => randomWeightData(time, series, updatePeriod, delta)),

        // add the random value to the previous random value in succession to create a random walk for each series
        scan((acc, value) => accumulateChartData(acc, value), emptyChartData(series))
    );
}
