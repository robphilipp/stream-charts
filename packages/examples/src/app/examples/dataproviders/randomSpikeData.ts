import {
    DEFAULT_COMPACTING_SIZE,
    initialTimeSeriesChartData,
    seriesFrom,
    type Datum,
    type TimeSeries,
    type TimeSeriesChartData,
} from "stream-charts";
import {interval, Observable} from "rxjs";
import {map} from "rxjs/operators";
import {FastShiftArray} from "fast-shift-array";

const UPDATE_PERIOD_MS = 25;

// by default, a spike's value is uniformly random between 0 and 1 (i.e. 0.5 ± 0.5)
const DEFAULT_MEAN_VALUE = 0.5
const DEFAULT_VALUE_SPREAD = 0.5

/**
 * A random spike value: uniformly random within the spread around the mean
 * @param meanValue The mean of the spikes' values
 * @param valueSpread How far (at most) a spike's value is from the mean
 * @return The value
 */
function spikeValue(meanValue: number, valueSpread: number): number {
    return meanValue + (Math.random() - 0.5) * 2 * valueSpread
}

/**
 * Creates initial (static) spike data for the specified series: for each series, one spike at a
 * random time within each of `numSpikes` successive update periods, starting at the initial time,
 * with a value that's uniformly random within the spread around the mean -- the same values the
 * {@link randomSpikeDataObservable} generates, so the initial data and the streamed data match.
 * @param seriesNames The names of the series
 * @param initialTime The time at which the first update period starts
 * @param updatePeriod The length of each update period (ms)
 * @param numSpikes The number of spikes (and update periods) for each series
 * @param [meanValue=0.5] The mean of the spikes' values
 * @param [valueSpread=0.5] How far (at most) a spike's value is from the mean
 * @return The initial spike data, one series for each name
 */
export function initialRandomSpikeData(
    seriesNames: Array<string>,
    initialTime: number,
    updatePeriod: number,
    numSpikes: number,
    meanValue: number = DEFAULT_MEAN_VALUE,
    valueSpread: number = DEFAULT_VALUE_SPREAD,
): Array<TimeSeries> {
    return seriesNames.map(name => {
        const data: Array<Datum> = []
        for (let i = 0; i < numSpikes; ++i) {
            const time = initialTime + i * updatePeriod + Math.ceil(Math.random() * updatePeriod)
            data.push({x: time, y: spikeValue(meanValue, valueSpread)})
        }
        return seriesFrom<Datum>(name, data)
    })
}

/**
 * Creates a random spike, with the specified probability, for each series: at the current time
 * (the elapsed time plus the latest of the series' initial max times), with a value uniformly
 * random within the spread around the mean
 * @param sequenceTime The time elapsed since the stream started
 * @param series The list of series (identifiers) to update
 * @param seriesMaxTimes A map holding the series name and its associated max time (when the stream started)
 * @param spikeProbability The probability that a series spikes in this time step
 * @param meanValue The mean of the spikes' values
 * @param valueSpread How far (at most) a spike's value is from the mean
 * @param compactingSize The number of shifts each new-points array accumulates before it's compacted
 * @return A random chart data
 */
function randomSpikeData(
    sequenceTime: number,
    series: Array<string>,
    seriesMaxTimes: Map<string, number>,
    spikeProbability: number = 0.5,
    meanValue: number = DEFAULT_MEAN_VALUE,
    valueSpread: number = DEFAULT_VALUE_SPREAD,
    compactingSize: number = DEFAULT_COMPACTING_SIZE
): TimeSeriesChartData {
    const maxTime = Math.max(...Array.from(seriesMaxTimes.values()))
    const maxTimes = new Map(
        Array.from(seriesMaxTimes.entries()).map(([name, maxTime]) => [name, maxTime + sequenceTime])
    )
    return {
        seriesNames: new Set(series),
        maxTime: sequenceTime,
        maxTimes,
        newPoints: new Map(series
            .filter(() => Math.random() < spikeProbability)
            .map(name => {
                return [
                    name,
                    FastShiftArray.fromArray([{
                        x: sequenceTime + maxTime,
                        y: spikeValue(meanValue, valueSpread)
                    }], true, compactingSize)
                ]
            }))
    };
}

/**
 * Creates random set of time-series data
 * @param series The list of series names (identifiers) to update
 * @param [updatePeriod=25] The time-interval between the generation of subsequent data points
 * @param spikeProbability The probability that a spike occurs in a given time step.
 * @param [meanValue=0.5] The mean of the spikes' values
 * @param [valueSpread=0.5] How far (at most) a spike's value is from the mean (by default, the
 * values are uniformly random between 0 and 1)
 * @return An observable that produces data.
 */
export function randomSpikeDataObservable(
    series: Array<TimeSeries>,
    updatePeriod: number = UPDATE_PERIOD_MS,
    spikeProbability: number = 0.1,
    meanValue: number = DEFAULT_MEAN_VALUE,
    valueSpread: number = DEFAULT_VALUE_SPREAD,
): Observable<TimeSeriesChartData> {
    const seriesNames = series.map(series => series.name)
    const initialData = initialTimeSeriesChartData(series)
    // wall-clock elapsed time since subscribing, rather than `(sequence + 1) * updatePeriod` (i.e.
    // counting ticks) -- see randomWeightDataObservable for why this matters: a tick-counted time
    // permanently falls behind true elapsed time by however many ticks were missed whenever the
    // underlying `setInterval` is throttled (e.g. the tab/window being hidden), which would leave
    // this generator's own timestamps lagging behind the chart's (wall-clock-based) cadence.
    const subscribeTime = performance.now()
    return interval(updatePeriod).pipe(
        // convert the tick to an elapsed wall-clock time
        map(() => performance.now() - subscribeTime),
        // create a random spike for each series
        map((time) => randomSpikeData(time, seriesNames, initialData.maxTimes, spikeProbability, meanValue, valueSpread))
    );
}
