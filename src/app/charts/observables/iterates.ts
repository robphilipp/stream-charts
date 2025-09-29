/**
 * Utilities for plotting function iterates. For example suppose that f[1](x) = f(x), f[2](x) = f(f(x)),
 * f[3](x) = f(f(f(x))), and f[m](x) = f(f(f....(x))), where the function is applied m times. Given this,
 * then an iterate (Poincare) plot shows points (f[m](x), f[m+1](x)), which is a 1-iterate. Plots of
 * points (f[m](x), f[m+n](x)) are n-iterates.
 *
 * 1. Convert series to chart data observable in the usual way
 * 2. Accepts that chart-data observable and converts that observable to an iterate-chart-data observable
 */
import {Observable} from "rxjs";
import {TimeSeriesChartData} from "../series/timeSeriesChartData";
import {filter, map, scan} from "rxjs/operators";
import {Datum, emptyDatum} from "../series/timeSeries";
import {emptyIterateDatum, IterateDatum, iterateDatumOf, nonEmptyIterateDatum} from "../series/iterateSeries";
import {ChartData, copyChartData, defaultChartData} from "./ChartData";


export interface IterateChartData extends ChartData {
    /**
     * The min values for (time, iterate n, and iterate n+1) for the data in the newPoints map
     */
    minIterate: IterateDatum

    /**
     * The max values for (time, iterate n, and iterate n+1) for the data in the newPoints map
     */
    maxIterate: IterateDatum

    /**
     * Holds the association of the series name to the current min time for that series
     */
    minIterates: Map<string, IterateDatum>

    /**
     * Holds the association of the series name to the current max time for that series
     */
    maxIterates: Map<string, IterateDatum>

    /**
     * Map holding the name of the series (the time-series identifier) and the associated
     * data points for that time-series (`map(series_name -> array(datum))`)
     */
    newPoints: Map<string, Array<IterateDatum>>
}

const emptyIterateData = (): IterateChartData => ({
    ...defaultChartData(),
    minIterate: emptyIterateDatum,
    maxIterate: emptyIterateDatum,
    minIterates: new Map<string, IterateDatum>(),
    maxIterates: new Map<string, IterateDatum>(),
    newPoints: new Map<string, Array<IterateDatum>>()
})

/**
 * Makes a deep copy of the iterate chart data
 * @param data The iterate chart data to copy
 */
export const copyIterateDataFrom = (data: IterateChartData): IterateChartData => ({
    ...copyChartData(data),
    minIterate: data.minIterate,
    maxIterate: data.maxIterate,
    minIterates: new Map<string, IterateDatum>(data.minIterates),
    maxIterates: new Map<string, IterateDatum>(data.maxIterates),
    newPoints: new Map<string, Array<IterateDatum>>(Array.from(data.newPoints.entries()).map(([name, points]) => [name, points.slice()])),
})

type Accumulator = {
    n: number
    previous: Map<string, Array<Datum>>
    accumulated: IterateChartData
}

const initialAccumulate = (n: number): Accumulator => ({n, previous: new Map(), accumulated: emptyIterateData()})

/**
 * Accepts a {@link TimeSeriesChartData} observable and converts it to an observable of {@link IterateChartData}
 * for the specified n-iterate. suppose that `f[0](x) = x`, `f[1](x) = f(x)`, `f[2](x) = f(f(x))`,
 * `f[3](x) = f(f(f(x)))`, and `f[m](x) = f(f(f....(x)))`, where the function is applied `m` times. Given this,
 * then an iterate (Poincare) plot shows points `(f[m](x), f[m+1](x))`, which is a 1-iterate. Plots of
 * points `(f[m](x), f[m+n](x))` are n-iterates.
 * @param dataObservable The observable over {@link TimeSeriesChartData}
 * @param [n=1] The iterate distance
 * @return An over {@link IterateChartData} holding the n-iterate for the incoming chart data
 */
export function iteratesObservable(dataObservable: Observable<TimeSeriesChartData>, n: number = 1): Observable<IterateChartData> {
    return dataObservable
        .pipe(
            // calculate the iterates for each series in the chart data
            scan(({n, previous, accumulated}: Accumulator, current: TimeSeriesChartData) => {
                // make a deep copy of the accumulated data (because the accumulated data object
                // holds references to maps)
                const accum = copyIterateDataFrom(accumulated)

                // for each series, add the new points to the accumulated data
                Array
                    .from(current.newPoints.entries())
                    .forEach(([name, series]) => {
                        // grab the points from the previous incoming data and add the new
                        // data to its end (when the updated data didn't yet exist, add it
                        // to the map holding the previous series)
                        const updated = (previous.get(name) || [])
                        if (updated.length === 0) {
                            previous.set(name, updated)
                        }
                        updated.push(...series)

                        // we may have multiple new data points for this series, so we may need to
                        // calculate multiple iterates
                        while (updated.length > n) {
                            // grab the start and end of the n-iterate interval
                            const last = updated[n]
                            const first = updated.shift() || emptyDatum()

                            // set the updated new points for the series for the next
                            // iteration of the while-loop
                            previous.set(name, updated)

                            // create the new iterate
                            const iterate: IterateDatum = iterateDatumOf(first.time, first.value, last.value);

                            // update the min, max values for all the series
                            accum.minIterate = minIterateFor(iterate, accum.minIterate)
                            accum.maxIterate = maxIterateFor(iterate, accum.maxIterate)

                            // update the min, max values for the current series
                            accum.minIterates.set(name, minIterateFor(iterate, accum.minIterates.get(name)))
                            accum.maxIterates.set(name, maxIterateFor(iterate, accum.maxIterates.get(name)))

                            // add the newly calculated iterate, and then trim from the
                            // head of the array to a size n. For the iterates, we only need
                            // to keep enough to create points (x(j), x(j+n))
                            const updatedPoints = accum.newPoints.get(name) || []
                            if (updatedPoints.length === 0) {
                                accum.newPoints.set(name, updatedPoints)
                            }
                            updatedPoints.push(iterate)
                            if (updatedPoints.length > series.length) {
                                updatedPoints.shift()
                            }
                        }
                    })
                return {n, previous, accumulated: accum}
            }, initialAccumulate(n)),

            // remove new points from the map that are empty
            filter(accum => !isNaN(accum.accumulated.minIterate.iterateN) && !isNaN(accum.accumulated.minIterate.iterateN_1)),
            map(accum => removeEmptyNewPoints(accum)),
            map(accum => accum.accumulated === undefined ? emptyIterateData() : accum.accumulated)
        )
}

/**
 * Calculates and returns the minimum values for the specified iterate and the current minimum
 * @param iterate The iterate to compare against the minimum
 * @param minIterate The minimum values for the iterate. Generally, this will be the accumulated
 * values
 * @return the minimum values for the specified iterate and the current minimum
 */
function minIterateFor(iterate: IterateDatum, minIterate: IterateDatum = emptyIterateDatum): IterateDatum {
    const minN = isNaN(minIterate.iterateN) ? iterate.iterateN : Math.min(iterate.iterateN, minIterate.iterateN)
    const minN_1 = isNaN(minIterate.iterateN_1) ? iterate.iterateN_1 : Math.min(iterate.iterateN_1, minIterate.iterateN_1)
    const minTime = (iterate.iterateN <= minN || iterate.iterateN_1 <= minN_1) ? iterate.time : minIterate.time
    return {
        time: minTime,
        iterateN: minN,
        iterateN_1: minN_1
    }
}

/**
 * Calculates and returns the maximum values for the specified iterate and the current maximum
 * @param iterate The iterate to compare against the maximum
 * @param maxIterate The maximum values for the iterate. Generally, this will be the accumulated
 * values
 * @return the maximum values for the specified iterate and the current maximum
 */
function maxIterateFor(iterate: IterateDatum, maxIterate: IterateDatum = emptyIterateDatum): IterateDatum {
    const maxN = isNaN(maxIterate.iterateN) ? iterate.iterateN : Math.max(iterate.iterateN, maxIterate.iterateN)
    const maxN_1 = isNaN(maxIterate.iterateN_1) ? iterate.iterateN_1 : Math.max(iterate.iterateN_1, maxIterate.iterateN_1)
    const maxTime = (iterate.iterateN >= maxN || iterate.iterateN_1 >= maxN_1) ? iterate.time : maxIterate.time
    return {
        time: maxTime,
        iterateN: maxN,
        iterateN_1: maxN_1
    }
}

function removeEmptyNewPoints(accum: Accumulator): Accumulator {
    const newPoints = new Map(
        Array
            .from(accum.accumulated.newPoints.entries())
            .map(([name, points]) => [name, points.filter(point => nonEmptyIterateDatum(point))])
    )
    return {
        n: accum.n,
        previous: accum.previous,
        accumulated: {
            ...accum.accumulated,
            newPoints
        }
    }
}