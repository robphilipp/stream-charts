import {BaseSeries, seriesFrom} from "./baseSeries";

/**
 * An immutable datum object that holds the iterate `(f[n](x), f[n+1](x))` with an
 * informational time
 */
export interface IterateDatum {
    readonly time: number;
    readonly iterateN: number;
    readonly iterateN_1: number
}

/**
 * Creates an empty iterate datum
 */
export const emptyIterateDatum: IterateDatum = {time: NaN, iterateN: NaN, iterateN_1: NaN}

/**
 * Creates an iterate datum
 * @param time The informational time
 * @param iterateN The n-th iterate (i.e. `f[n](x)`)
 * @param iterateN_1 The (n+1)-th iterate (i.e. `f[n+1](x)`)
 * @return An iterate datum
 */
export const iterateDatumOf = (time: number, iterateN: number, iterateN_1: number): IterateDatum => ({
    time,
    iterateN,
    iterateN_1
})

/**
 * Returns whether the iterate datum is considered empty. An iterate datum is considered
 * empty when the time, `f[n](x)`, `f[n+1](x)` values are all `NaN`
 * @param datum The iterate datum to test
 * @return `true` if the iterate datum is empty; `false` otherwise
 */
export const nonEmptyIterateDatum = (datum: IterateDatum): boolean =>
    !isNaN(datum.time) && !isNaN(datum.iterateN) && !isNaN(datum.iterateN_1)

/**
 * A series of iterate (i.e. `(f[n](x), f[n+1](x))` pairs)
 */
export type IterateSeries = BaseSeries<IterateDatum>

/**
 * Creates a series from the name and the optional array of (x, y) pairs (tuples)
 * @param name The name of the series
 * @param data The optional array of (x, y) pairs (tuples)
 * @return A `Series` for object that can be used by the `PoincarePlot`
 * @see seriesFrom
 * @see emptySeries
 */
export const iterateSeriesFromTuples = (name: string, data: Array<[number, number, number]> = []): IterateSeries =>
    seriesFrom(name, data.map(([t, fn, fn_1]) => iterateDatumOf(t, fn, fn_1)))


