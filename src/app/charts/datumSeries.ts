import {Option} from "prelude-ts";

/**
 * An immutable datum object that holds the spike (time, value) representing a neuron spike
 */
export interface Datum {
    readonly time: number;
    readonly value: number;
}

export function datumOf(time: number, value: number): Datum {
    return {time, value}
}

/**
 * A spike series holding an array of spike (time, value) datum, the name and supplemental information
 * needed by the `RasterChart`
 */
export interface Series {
    readonly name: string;
    data: Array<Datum>;
    readonly last: () => Option<Datum>;
    readonly length: () => number;
    readonly isEmpty: () => boolean;
}

/**
 * Creates a series from the name and the optional array of `Datum`.
 * @param name The name of the series (i.e. neuron)
 * @param data The array of (time, value) pairs, where the value is the spike value (in mV)
 * @return A `Series` for object that can be used by the `RasterChart`
 * @see seriesFromTuples
 * @see emptySeries
 */
export function seriesFrom(name: string, data: Array<Datum> = []): Series {
    return {
        name: name,
        data: data,
        last: () => data ? (data.length > 0 ? Option.of(data[data.length - 1]) : Option.none()) : Option.none(),
        length: () => data ? data.length : 0,
        isEmpty: () => data ? data.length === 0 : true
    }
}

/**
 * Creates a series from the name and the optional array of (x, y) pairs (tuples)
 * @param name The name of the series
 * @param data The optional array of (x, y) pairs (tuples)
 * @return A `Series` for object that can be used by the `RasterChart`
 * @see seriesFrom
 * @see emptySeries
 */
export const seriesFromTuples = (name: string, data: Array<[number, number]> = []): Series =>
    seriesFrom(name, data.map(([t, y]) => datumOf(t, y)))

/**
 * Returns an empty series with the specified name
 * @param name The name of the series
 * @return The empty series
 * @see seriesFrom
 * @see seriesFromTuples
 */
export const emptySeries = (name: string): Series => seriesFrom(name);

/**
 * Creates an array of empty series, one for each specified name
 * @param names The names for each of the empty series
 * @return An array of empty series with the specified names
 * @see emptySeries
 * @see seriesFrom
 * @see seriesFromTuples
 */
export const emptySeriesFor = (names: Array<string>): Array<Series> => names.map(name => seriesFrom(name))

export interface PixelDatum extends Datum {
    x: number;
    y: number;
}


