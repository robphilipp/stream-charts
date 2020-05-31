import {Option} from "prelude-ts";

/**
 * An immutable datum object that holds the spike (time, value) representing a neuron spike
 */
export interface Datum {
    readonly time: number;
    readonly value: number;
}

/**
 * A spike series holding an array of spike (time, value) datum, the name and supplemental information
 * needed by the `RasterChart`
 */
export interface Series {
    readonly name: string;
    data: Datum[];
    readonly last: () => Option<Datum>;
    readonly length: () => number;
    readonly isEmpty: () => boolean;
}

/**
 * Creates a series from the name and the optional array of `Datum`.
 * @param {string} name The name of the series (i.e. neuron)
 * @param {Array<Datum>} data The array of (time, value) pairs, where the value is the spike value (in mV)
 * @return {Series} A `Series` for object that can be used by the `RasterChart`
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
 * Returns an empty series with the specified name
 * @param {string} name The name of the series
 * @return {Series} The empty series
 */
export function emptySeries(name: string): Series {
    return seriesFrom(name);
}

export interface PixelDatum extends Datum {
    x: number;
    y: number;
}


