import {interval, type Observable} from "rxjs";
import {
    datumOf,
    outlierBoundsFor,
    outlierDatumFor,
    outlierSeriesFrom,
    type OutlierBounds,
    type OutlierChartData,
    type OutlierDatum,
    type OutlierSeries,
} from "stream-charts";
import {map} from "rxjs/operators";

/**
 * Creates the observable of outlier data for a single series: every update period, emits one datum,
 * calculated by the base function at the current time (the start time plus the wall-clock time
 * elapsed since subscribing)
 * @param seriesName The name of the series
 * @param baseFunction Calculates the datum (its value, and its bounds for each measure) at a time
 * @param measures The measures (e.g. the probabilities) of the bounds
 * @param [sigmaNoise=1] The amount of noise, handed to the base function
 * @param [updatePeriod=25] The time (ms) between data
 * @param [startTime=0] The time from which the data's times continue (e.g. the latest existing time)
 * @return The observable of outlier chart data
 * @template M The type of the measures (a tuple of numbers)
 */
export function randomOutlierDataObservable<M extends readonly number[]>(
    seriesName: string,
    baseFunction: (x: number, sigma: number, measures: M) => OutlierDatum<M>,
    measures: M,
    sigmaNoise: number = 1,
    updatePeriod: number = 25,
    startTime: number = 0,
): Observable<OutlierChartData<M>> {
    const seriesNames = new Set<string>([seriesName])
    // wall-clock elapsed time since subscribing, rather than `(sequence + 1) * updatePeriod` (i.e.
    // counting ticks) -- see randomWeightDataObservable for why this matters: a tick-counted time
    // permanently falls behind true elapsed time by however many ticks were missed whenever the
    // underlying `setInterval` is throttled (e.g. the tab/window being hidden), which would leave
    // this generator's own timestamps lagging behind the chart's (wall-clock-based) cadence.
    const subscribeTime = performance.now()
    return interval(updatePeriod).pipe(
        map(() => startTime + (performance.now() - subscribeTime)),
        map(time => ({
            seriesNames,
            newPoints: new Map([[seriesName, [baseFunction(time, sigmaNoise, measures)]]])
        } as OutlierChartData<M>))
    )
}

/**
 * Generates a static initial outlier series by evaluating {@link baseFunction} at successive
 * time-steps. Useful for pre-populating a chart so users see data before any streaming starts.
 * The generated points line up with what {@link randomOutlierDataObservable} would emit, so a
 * streaming run starting at `numPoints * updatePeriod` continues the series seamlessly.
 * @param seriesName The name of the series
 * @param baseFunction Calculates the datum (its value, and its bounds for each measure) at a time
 * @param measures The measures (e.g. the probabilities) of the bounds
 * @param sigmaNoise The amount of noise, handed to the base function
 * @param updatePeriod The time (ms) between data (the first is at one update period)
 * @param numPoints The number of data
 * @param [measureDescriptions] The descriptions of the measures
 * @return The initial data: a single outlier series
 * @template M The type of the measures (a tuple of numbers)
 */
export function initialOutlierData<M extends readonly number[]>(
    seriesName: string,
    baseFunction: (x: number, sigma: number, measures: M) => OutlierDatum<M>,
    measures: M,
    sigmaNoise: number,
    updatePeriod: number,
    numPoints: number,
    measureDescriptions?: {readonly [K in keyof M]: string}
): Array<OutlierSeries<M>> {
    const data: Array<OutlierDatum<M>> = []
    for (let i = 0; i < numPoints; ++i) {
        const time = (i + 1) * updatePeriod
        data.push(baseFunction(time, sigmaNoise, measures))
    }
    return [outlierSeriesFrom(seriesName, data, measures, measureDescriptions)]
}

/**
 * Higher-order function that returns the outlier example's base function: a model value that's
 * the sum of several cosines (each with an amplitude of `magnitude`, about 32), plus random noise
 * (occasionally, much larger noise -- the outliers), with a band around the model value for each
 * measure, each wider than the one before
 * @param periods The (period, phase offset) of each cosine
 * @param magnitude The amplitude of each cosine (which also scales the noise and the bands)
 * @return The base function: given a time, the amount of noise, and the measures, returns the
 * datum at that time
 * @template M The type of the measures (a tuple of numbers)
 */
export function periodicWithSeveralBandsFn<M extends readonly number[]>(
    periods: Array<[period: number, offset: number]>,
    magnitude: number
): (time: number, sigma: number, measures: M) => OutlierDatum<M> {
    return (time: number, sigma: number, measures: M) => {
        // calculate the values for the "model" without noise. from these we add noise
        // to get the value. We also used these values to calculate the bounds for each
        // point
        const periodValues = periods.map(
            ([period, offset]) => magnitude * Math.cos(time / period + offset) + 32
        )

        // add noise to simulate the data
        const baseValue = periodValues.reduce(
            (acc, value) => acc + value,
            0
        )

        // add noise to simulate the data
        const value = baseValue + magnitude * sigma * (2 * Math.random() - 1) * (Math.random() > 0.99 ? 3 * (1 + Math.random()) : 0.7)

        // calculate the bounds based on the measures and the base value (without noise)
        const bounds = measures
            .map((measure, index) => {
                const bandWidth = magnitude * sigma * measure * (index+1)
                return outlierBoundsFor(baseValue - bandWidth, baseValue + bandWidth)
            })

        // this should never fail for this function, so we'll just throw an error if it does.. :)
        return outlierDatumFor<M>(datumOf(time, value), measures, toTuple(...bounds))
            .getOrThrow(failure => new Error(failure))
    }
}

/**
 * Casts an array of bounds to the tuple type that holds one bound per measure
 * @param args The bounds
 * @return The bounds, as a tuple
 */
function toTuple<T extends readonly OutlierBounds[], M extends readonly number[]>(...args: T): { readonly [K in keyof M]: OutlierBounds} {
    return args as { readonly [K in keyof M]: OutlierBounds}
}