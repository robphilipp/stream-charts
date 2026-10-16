/*
 * for the StreamingBarChart
 */

import {type BaseSeries, seriesFrom} from "../../charts/series/baseSeries.ts";
import {type Datum, datumOf} from "../../charts/series/timeSeries.ts";
import type {TimeSeriesChartData} from "../../charts/series/timeSeriesChartData.ts";
import type {OrdinalDatum} from "../../charts/series/ordinalSeries.ts"
import {interval, Observable} from "rxjs";
import {map, scan} from "rxjs/operators";

/**
 * Creates the initial (static) data for the dancing bars: for each series, `numPoints` values at
 * successive times (`timeInterval` apart, starting at 0), calculated with the same function as
 * the streamed data (see {@link barDanceValue}), and limited to the same range (see
 * {@link barDanceDataObservable}) -- so the initial bars and the streamed ones follow the same
 * dance.
 * @param seriesNames The names of the series
 * @param timeInterval The time (ms) between successive points
 * @param numPoints The number of points for each series
 * @param [min=-1] The minimum allowed value
 * @param [max=1] The maximum allowed value
 * @return The initial data, one series for each name
 */
export function initialBarDanceData(
    seriesNames: Array<string>,
    timeInterval: number,
    numPoints: number,
    min: number = -1,
    max: number = 1
): Array<BaseSeries<Datum>> {
    return seriesNames.map((name, index) => {
        const data: Array<Datum> = []
        for (let point = 0; point < numPoints; point++) {
            const time = point * timeInterval
            data.push(datumOf(time, Math.max(min, Math.min(max, barDanceValue(time, index, seriesNames.length)))))
        }
        return seriesFrom<Datum>(name, data)
    })
}

/**
 * Creates a time-series chart data object based on the values from the time-series
 * @param seriesList The list of series names (identifiers) to update
 * @param [currentTime=0] The current time
 * @return An empty chart data object
 */
export function initialOrdinalChartData(seriesList: Array<BaseSeries<OrdinalDatum>>, currentTime: number = 0): TimeSeriesChartData {
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
            series.data.map(datum => ({x: datum.time, y: datum.value} as Datum)),
        ])),
        currentTime: currentTime
    }
}

/**
 * Creates random set of time-series data, designed to make the bar chart dance. Only *new* data is
 * emitted -- the specified series are the starting point (their latest values and times), not part of
 * the stream -- so that resuming from a chart's accumulated data doesn't re-emit (and duplicate) it.
 * @param series The number of time-series for which to generate data (i.e. one for each neuron)
 * @param [updatePeriod=25] The time-interval between the generation of subsequent data points
 * @param [min=-1] The minimum allowed value
 * @param [max=1] The maximum allowed value
 * @return An observable that produces data.
 */
export function barDanceDataObservable(
    series: Array<BaseSeries<OrdinalDatum>>,
    // series: Array<TimeSeries>,
    updatePeriod: number = 25,
    min: number = -1,
    max: number = 1
): Observable<TimeSeriesChartData> {
    const seriesNames = series.map(series => series.name)
    const initialData = initialOrdinalChartData(series)
    // the time of the latest existing datum, from which the new data continues
    const startTime = isFinite(initialData.maxTime) ? initialData.maxTime : 0
    return interval(updatePeriod).pipe(
        // convert the number sequence to a time: one update period after the latest existing datum,
        // then one more for each subsequent tick
        map(sequence => startTime + (sequence + 1) * updatePeriod),

        // create a new (time, value) for each series
        map(time => barDanceData(time, seriesNames)),

        // create an observable for the ordinal chart data, starting from the existing data (the
        // seed isn't itself emitted)
        scan((accumulated, chartData) => ({
            seriesNames: new Set(accumulated.seriesNames),
            maxTime: chartData.maxTime,
            maxTimes: chartData.maxTimes,
            newPoints: mergeOrdinalSeries(accumulated.newPoints, chartData.newPoints, min, max)
        }), initialData)
    )
}

/**
 * *Side effect*
 * Updates the specified `accum` parameter.
 * @param accum The "position" in the random walk
 * @param incoming The changes in position
 * @param min The minimum allowed value
 * @param max The maximum allowed value
 * @return The merged map holding the new random walk segments
 */
function mergeOrdinalSeries(
    accum: Map<string, Array<Datum>>,
    incoming: Map<string, Array<Datum>>,
    min: number,
    max: number
): Map<string, Array<Datum>> {
    // builds a brand-new map (rather than mutating and returning `accum`) so that each emitted
    // `newPoints` is an independent snapshot -- see randomWeightData.ts's `mergeSeries` for the
    // full explanation of the bug this avoids: reusing/mutating the same object here would mean
    // every emission -- including ones already sitting in an RxJS `bufferTime` buffer, waiting to
    // be read -- aliases the same object, and would retroactively appear to hold only the latest
    // tick's value once the buffer flushes.
    const merged = new Map<string, Array<Datum>>(accum)
    incoming.forEach((data, name) => {
        const newData = data.map((datum, index) => ({
            x: datum.x,
            y: index === 0 ? Math.max(min, Math.min(max, datum.y)) : data[index - 1].y + datum.y
        }))
        merged.set(name, newData);
    })
    return merged;
}

/**
 * Some complicated function to make the bars dance
 * @param sequenceTime The current time (every series gets a new point at this time)
 * @param seriesNames An array holding the names of the series
 * @return A time-series chart data
 */
function barDanceData(
    sequenceTime: number,
    seriesNames: Array<string>,
): TimeSeriesChartData {
    // every series' latest point is the new one, at the current time
    const maxTimes = new Map(seriesNames.map(name => [name, sequenceTime]))
    return {
        seriesNames: new Set(seriesNames),
        maxTime: sequenceTime,
        maxTimes,
        newPoints: new Map(seriesNames.map((name, index) => {
            return [
                name,
                [{
                    x: sequenceTime,
                    y: barDanceValue(sequenceTime, index, seriesNames.length),
                }]
            ]
        }))
    };
}

/**
 * The value of a dancing bar (series) at the specified time: some complicated function to make the
 * bars dance. Used for both the initial data and the streamed data, so the two match.
 * @param time The time
 * @param index The index of the series
 * @param numSeries The number of series
 * @return The series' value at that time
 */
function barDanceValue(time: number, index: number, numSeries: number): number {
    const intercept = 0.1
    const slope = 0.3 / numSeries
    return Math.cos((6 * index) * Math.PI / numSeries) * // envelope for index
        Math.min(1, (1.2 + Math.sin(time * Math.PI / 1513)) / 2) * // time-evolving envelope
        Math.sin((time / 27 + index) * Math.PI / numSeries / 2) + // series values
        slope * index - intercept
}
