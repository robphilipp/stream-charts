import {interval, Observable} from "rxjs";
import {map, scan} from "rxjs/operators";
import {
    initialTimeSeriesChartData,
    seriesFrom,
    type BaseSeries,
    type Datum,
    type TimeSeries,
    type TimeSeriesChartData,
} from "stream-charts";
// import {ChartData, Datum, initialChartData, Series, seriesFrom} from "stream-charts";

/**
 * Creates random weight data
 * @param sequenceTime The current time
 * @param series The list of series names (identifiers) to update
 * @param seriesMaxTimes The maximum time for each series
 * @param updatePeriod The update period (ms)
 * @param delta The largest change in weight
 * @return The random chart data
 */
function randomWeightData(
    sequenceTime: number,
    series: Array<string>,
    seriesMaxTimes: Map<string, number>,
    updatePeriod: number,
    delta: number,
): TimeSeriesChartData {
    const maxTimes = new Map(Array.from(
        seriesMaxTimes.entries()).map(([name, maxTime]) => [name, maxTime + sequenceTime])
    )
    return {
        seriesNames: new Set(series),
        maxTime: sequenceTime,
        maxTimes,
        newPoints: new Map(series.map(name => {
            const maxTime = seriesMaxTimes.get(name) || 0
            return [
                name,
                [{
                    x: sequenceTime + maxTime - Math.ceil(Math.random() * updatePeriod),
                    y: (Math.random() - 0.5) * 2 * delta
                }]
            ]
        }))
    };
}

/**
 * Adds the accumulated chart data to the current random one
 * @param accum The accumulated chart data
 * @param currentData The random chart data
 * @param min The minimum allowed value
 * @param max The maximum allowed value
 * @return The accumulated chart data
 */
function accumulateChartData(accum: TimeSeriesChartData, currentData: TimeSeriesChartData, min: number, max: number): TimeSeriesChartData {
    return {
        seriesNames: new Set(accum.seriesNames),
        maxTime: currentData.maxTime,
        maxTimes: currentData.maxTimes,
        newPoints: mergeSeries(accum.newPoints, currentData.newPoints, min, max)
    }
}

/**
 * Calculates the successive differences in the values to create a random walk for simulating neuron weights:
 * each series' first new value is its last accumulated value plus the change (limited to the min and max).
 * Returns a new map (rather than updating `accum`).
 * @param accum The "position" in the random walk
 * @param incoming The changes in position
 * @param min The minimum allowed value
 * @param max The maximum allowed value
 * @return The merged map holding the new random walk segments
 */
function mergeSeries(
    accum: Map<string, Array<Datum>>,
    incoming: Map<string, Array<Datum>>,
    min: number,
    max: number
): Map<string, Array<Datum>> {
    // builds a brand-new map (rather than mutating and returning `accum`) so that each emitted
    // `newPoints` is an independent snapshot. `accum` becomes the previous tick's returned map, so
    // reusing/mutating that same object here would mean every emission -- including ones already
    // sitting in an RxJS `bufferTime` buffer, waiting to be read -- aliases the same object, and
    // would retroactively appear to hold only the latest tick's value once the buffer flushes
    const merged = new Map<string, Array<Datum>>()
    incoming.forEach((data, name) => {
        const accData = accum.get(name) || [];
        const lastAccum = accData.length > 0 ? accData[accData.length - 1].y : 0;
        const newData = data.map((datum, index) => ({
            x: datum.x,
            y: index === 0 ? Math.max(min, Math.min(max, lastAccum + datum.y)) : data[index - 1].y + datum.y
        }))
        merged.set(name, newData);
    })
    return merged;
}


/**
 * Creates random set of time-series data, essentially creating a random walk for each series
 * @param series The series for which to generate data (i.e. one for each neuron) -- the walks
 * continue from each series' last value, and the times from each series' last time
 * @param delta The max change in weight
 * @param [updatePeriod=25] The time-interval between the generation of subsequent data points
 * @param [min=-1] The minimum allowed value
 * @param [max=1] The maximum allowed value
 * @return An observable that produces data.
 */
export function randomWeightDataObservable(
    series: Array<TimeSeries>,
    delta: number,
    updatePeriod: number = 25,
    min: number = -1,
    max: number = 1
): Observable<TimeSeriesChartData> {
    const seriesNames = series.map(series => series.name)
    const initialData = initialTimeSeriesChartData(series)
    // wall-clock elapsed time since subscribing, rather than `(sequence + 1) * updatePeriod` (i.e.
    // counting ticks). The two track each other closely under normal conditions, but a tick-counted
    // time permanently falls behind true elapsed time by however many ticks were missed whenever
    // the underlying `setInterval` is throttled (e.g. the tab/window being hidden) -- it never
    // catches up on its own, since the count just keeps incrementing by 1 per tick going forward,
    // not by however many ticks *should* have fired. That matters here because the chart's cadence
    // (see `timeSeriesWithCadenceViewDriverFor`) is deliberately wall-clock-based for the same
    // reason: if the data source stayed tick-counted while cadence corrects itself immediately on
    // becoming visible again, cadence would race ahead of where the (still-behind) data actually
    // is, scrolling the axis past all the visible data instead of merely lagging behind it.
    const startTime = performance.now()
    return interval(updatePeriod).pipe(
        // convert the tick to an elapsed wall-clock time
        map(() => performance.now() - startTime),

        // create a new (time, value) for each series
        map(time => randomWeightData(time, seriesNames, initialData.maxTimes, updatePeriod, delta)),

        // add the random value to the previous random value in succession to create a random walk for each series
        scan((acc, value) => accumulateChartData(acc, value, min, max), initialData),
    )
}

/**
 * Creates initial (static) random-walk data for the specified series (the scatter example's
 * initial data): for each series, a walk that starts within `delta` of the initial value, with one
 * point at a random time within each of `numTimes` successive update periods, each point's value
 * within `delta` of the previous point's
 * @param seriesNames The names of the series
 * @param initialTime The time at which the first update period starts
 * @param initialValue The value around which the walks start
 * @param updatePeriod The length of each update period (ms)
 * @param delta The largest change in value from one point to the next
 * @param numTimes The number of points (and update periods) for each series
 * @return The initial data, one series for each name
 */
export function initialRandomWeightData(
    seriesNames: Array<string>,
    initialTime: number,
    initialValue: number,
    updatePeriod: number,
    delta: number,
    numTimes: number
): Array<BaseSeries<Datum>> {
    return seriesNames.map(name => {
        const data: Array<Datum> = []
        let prevValue = initialValue + (Math.random() - 0.5) * 2 * delta
        for (let i = 0; i < numTimes; ++i) {
            const time = initialTime + i * updatePeriod + Math.ceil(Math.random() * updatePeriod)
            const value = prevValue + (Math.random() - 0.5) * 2 * delta
            data.push({x: time, y: value})
            prevValue = value
        }
        return seriesFrom<Datum>(name, data)
    })
}
