import {failureResult, type Result, successResult} from "result-fn";
import {FastShiftArray} from "fast-shift-array";

/**
 * A named series of data, the basis of every chart's series. Its data is held in a
 * `FastShiftArray`, so that the oldest data can be dropped from its head cheaply as new data
 * streams in.
 * @template D The type of the series' datum
 */
export interface BaseSeries<D> {
    /**
     * The name of the series (unique within a chart)
     */
    readonly name: string;
    /**
     * The series' data, ordered by time
     */
    data: FastShiftArray<D>;
    /**
     * @return The last datum, or a failure when the series is empty
     */
    readonly last: () => Result<D, string>;
    /**
     * @return The number of data in the series
     */
    readonly length: () => number;
    /**
     * @return `true` when the series has no data; `false` otherwise
     */
    readonly isEmpty: () => boolean;
}

/**
 * Default number of shifts a series' backing `FastShiftArray` accumulates before it's compacted,
 * used whenever a caller doesn't specify one explicitly. This is deliberately much lower than
 * `FastShiftArray`'s own default of 100,000: compaction is a single, blocking O(n) operation (it
 * splices out all the accumulated dead slots in one call), so with the default threshold, a
 * long-running streaming chart hits one large, very perceptible stutter once cumulative shifts
 * cross 100,000 -- visible as a sudden jump/lag rather than a gradual slowdown. Compacting more
 * often, on a much smaller batch each time, trades that one large pause for many much smaller
 * (and much less noticeable) ones spread across the session.
 *
 * If a particular use case genuinely prefers fewer, larger pauses (e.g. a non-interactive/batch
 * context where per-call overhead matters more than pause smoothness), pass a larger
 * `compactingSize` explicitly to `seriesFrom`/`emptySeries`/`emptySeriesFor`.
 */
export const DEFAULT_COMPACTING_SIZE = 10_000

/**
 * Creates a series from the name and the optional array of `Datum`.
 *
 * **Ownership warning:** when `data` is a plain array (or already a {@link FastShiftArray}), it is
 * wrapped **by reference**, not copied -- the returned series' backing storage *is* that same
 * array/`FastShiftArray`. As the chart streams in new data and ages old data out, the library calls
 * `shift()` on it (clearing the head slot, and periodically `splice`-ing it during compaction),
 * mutating it in place. If you keep your own reference to the array you pass in (to reuse,
 * snapshot, or compare later), you will see it change out from under you. If you need an
 * independent copy, pass `data.slice()` instead -- see e.g. `StreamingBarChart.tsx`,
 * `StreamingRasterChart.tsx`, and `StreamingPoincareChart.tsx`, which all do this when re-deriving
 * initial series from data they still hold a reference to elsewhere.
 * @param name The name of the series (i.e. neuron)
 * @param data The array of datum, which could be `(t, f(t))`, or `(f[n](x), f[n+1](x))`
 * @param compactingSize The number of shifts the series' backing array accumulates before it's
 * compacted (see {@link DEFAULT_COMPACTING_SIZE}). Only applies when `data` is a plain array (and
 * so a new `FastShiftArray` is created for it) -- ignored when `data` is already a `FastShiftArray`,
 * since compaction size is fixed at that instance's own construction time.
 * @return A {@link BaseSeries} that can be used in {@link Chart}s
 * @see seriesFromTuples
 * @see emptySeries
 */
export function seriesFrom<D>(
    name: string,
    data: Array<D> | FastShiftArray<D> = [],
    compactingSize: number = DEFAULT_COMPACTING_SIZE
): BaseSeries<D> {
    // `backing` is the single source of truth stored in `.data` below -- `last`/`length`/`isEmpty`
    // must close over this (not the original `data` param) so they go through FastShiftArray's own
    // headIndex-aware accessors. When `data` is a plain array, `FastShiftArray.fromArray` wraps it
    // by reference rather than copying, so reading `data.length` directly (the old behavior) read
    // the raw backing array's physical length, which `shift()` never shrinks -- it only advances
    // an internal headIndex.
    const backing: FastShiftArray<D> = data instanceof Array ?
        FastShiftArray.fromArray<D>(data, true, compactingSize) :
        data
    return {
        name: name,
        data: backing,
        last: () => backing.length > 0 ?
            successResult<D, string>(backing[backing.length - 1]) :
            failureResult<D, string>("Data is empty"),
        length: () => backing.length,
        isEmpty: () => backing.length === 0
    }
}

/**
 * Returns an empty series with the specified name
 * @param name The name of the series
 * @param compactingSize The number of shifts the series' backing array accumulates before it's
 * compacted (see {@link DEFAULT_COMPACTING_SIZE})
 * @return The empty series
 * @see seriesFrom
 * @see seriesFromTuples
 */
export const emptySeries = <D>(name: string, compactingSize: number = DEFAULT_COMPACTING_SIZE): BaseSeries<D> =>
    seriesFrom(name, [], compactingSize);

/**
 * Creates an array of empty series, one for each specified name
 * @param names The names for each of the empty series
 * @param compactingSize The number of shifts each series' backing array accumulates before it's
 * compacted (see {@link DEFAULT_COMPACTING_SIZE})
 * @return An array of empty series with the specified names
 * @see emptySeries
 * @see seriesFrom
 * @see seriesFromTuples
 */
export const emptySeriesFor = <D>(names: Array<string>, compactingSize: number = DEFAULT_COMPACTING_SIZE): Array<BaseSeries<D>> =>
    names.map(name => seriesFrom(name, [], compactingSize))