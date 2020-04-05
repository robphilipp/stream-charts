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
}

