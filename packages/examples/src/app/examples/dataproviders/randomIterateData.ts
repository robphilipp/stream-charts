import {type Datum, datumOf, type TimeSeries} from "../../charts/series/timeSeries.ts";
import {seriesFrom} from "../../charts/series/baseSeries.ts";
import {interval, Observable} from "rxjs";
import {initialTimeSeriesChartData, type TimeSeriesChartData} from "../../charts/series/timeSeriesChartData.ts";
import {scan} from "rxjs/operators";

/**
 * Calculates the next iterate of a function: handed a time (which is just carried along) and the
 * current iterate `x[n]`, returns the datum (time, `x[n+1]`)
 */
export type IterateFunction = (time: number, xn: number) => Datum

/**
 * Higher-order function that forms a closure on the tent map's mu and returns
 * a function that calculates the tent map iterates. The tent map is defined as
 * <p>`x[n+1] = f[mu, n](x[n]) = mu * min(x[n], 1 - x[n])`</p>
 * where the `x[n]` must be on the unit interval `[0, 1]`.
 * @param mu The slope of the tent map must be in the interval `[0, 2]`. When
 * the specified {@link mu} is not in this interval, it will be clamped to be
 * in the interval.
 * @return A function that accepts a data collection time and the previous iterate.
 * The `time` does not factor into the evaluation of the next tent-map iterate,
 * but rather is just cargo used for displaying time, if needed. This function returns
 * a {@link Datum} whose y-values are the iterates of the tent-map, and whose
 * x-values are the collection/calculation time.
 */
export function tentMapFn(mu: number): IterateFunction {
    const cleanMu = Math.max(0, Math.min(mu, 2))

    // the time is just the data collection time and does not factor int
    // the tent map calculation.
    return (time: number, xn: number): Datum => {
        const xn1 = cleanMu * Math.min(xn, 1 - xn)
        return datumOf(time, xn1)
    }
}

/**
 * Creates the initial data for the iterate (Poincaré) example: one series per entry, each with a
 * single point at a random time within the update period after the series' initial time, whose
 * value (the starting `x[0]`) is random, in `[0, 1)`
 * @param updatePeriod The update period (ms)
 * @param series The series' initial times, by series name
 * @return The initial data
 */
export function initialTentMapData(updatePeriod: number, series: Map<string, number>): Array<TimeSeries> {
    return Array.from(series.entries())
        .map(([name, initialTime]) => seriesFrom(name, [datumOf(initialTime + Math.ceil(Math.random() * updatePeriod), Math.random())])
        )
}

/**
 * Higher-order function that forms a closure on the logistic map's r and returns a function that
 * calculates the logistic map iterates. The logistic map is defined as
 * <p>`x[n+1] = r * x[n] * (1 - x[n])`</p>
 * @param r The growth rate, in the interval `[0, 4]` (clamped into it, when it isn't)
 * @return A function that accepts a time (just cargo, see {@link tentMapFn}) and the previous
 * iterate, and returns the next one
 */
export function logisticMapFn(r: number): IterateFunction {
    const clearR = Math.max(0, Math.min(r, 4))
    return (time: number, xn: number): Datum => datumOf(time, clearR * xn * (1 - xn))
}

/**
 * Higher-order function that forms a closure on the Gauss (mouse) map's alpha and beta and returns
 * a function that calculates the Gauss map iterates. The Gauss map is defined as
 * <p>`x[n+1] = exp(-alpha * x[n]^2) + beta`</p>
 * @param alpha The width parameter
 * @param beta The offset
 * @return A function that accepts a time (just cargo, see {@link tentMapFn}) and the previous
 * iterate, and returns the next one
 */
export function gaussMapFn(alpha: number, beta: number): IterateFunction {
    return (time: number, xn: number): Datum => datumOf(time, Math.exp(-alpha * xn * xn) + beta)
}

/**
 * Creates the observable of iterates of the specified function: every update period, emits the
 * next iterate of each series (from its last point), one update period after it
 * @param iterateFunction The function to iterate
 * @param initialSeries The series to continue from (their last points are the starting iterates)
 * @param [updatePeriod=25] The time (ms) between iterates
 * @return The observable of chart data, each holding the next iterate of each series
 */
export function iterateFunctionObservable(
    iterateFunction: IterateFunction,
    initialSeries: Array<TimeSeries>,
    updatePeriod: number = 25
): Observable<TimeSeriesChartData> {
    // convert the initial time-series to chart data needed by the observable
    const initialData = initialTimeSeriesChartData(initialSeries)
    // create the function that accumulates the time-series into an iterate series
    const accumulateFn = accumulateIterateDataAt(updatePeriod)
    // observable that converts the time-series into iterates
    return interval(updatePeriod).pipe(
        scan((prev, sequence) => accumulateFn(prev, sequence + 1, iterateFunction), initialData)
    )
}

/**
 * Calculates the next iterate of each series, from the previous chart data's last point
 * @param previous The previous chart data
 * @param iterateNum The number of the iterate (from 1)
 * @param updatePeriod The time (ms) between iterates
 * @param iterateFunction The function to iterate
 * @return The chart data holding each series' next iterate, one update period after its last
 */
function accumulateIterateData(
    previous: TimeSeriesChartData,
    iterateNum: number,
    updatePeriod: number,
    iterateFunction: IterateFunction
): TimeSeriesChartData {
    // make a copy of the current max times, which we'll update with new points
    const maxTimes = new Map(previous.maxTimes.entries())
    previous.newPoints.forEach((datum, name) => {
        maxTimes.set(name, (datum[datum.length - 1].x + updatePeriod))
    })
    // deep copy of the previous data points, and calculate the next point
    const newPoints = new Map(Array.from(previous.newPoints.entries()).map(([name, data]) => [name, data.slice()]))
    newPoints.forEach((data, ) => {
        const lastDatum = data[data.length - 1]
        const newDatum = iterateFunction(lastDatum.x + updatePeriod, lastDatum.y)
        data.shift()
        data.push(newDatum)
    })

    return {
        seriesNames: previous.seriesNames,
        maxTime: previous.maxTime + updatePeriod,
        maxTimes,
        newPoints,
        currentTime: (iterateNum + 1) * updatePeriod
    };
}

/**
 * Higher-order function that forms a closure on the update period, for {@link accumulateIterateData}
 * @param updatePeriod The time (ms) between iterates
 * @return A function that calculates the next iterates from the previous chart data
 */
function accumulateIterateDataAt(updatePeriod: number):
    (previous: TimeSeriesChartData, iterateNum: number, iterateFunction: IterateFunction) => TimeSeriesChartData {
    return (previous: TimeSeriesChartData, iterateNum: number, iterateFunction: IterateFunction) =>
        accumulateIterateData(previous, iterateNum, updatePeriod, iterateFunction)
}
