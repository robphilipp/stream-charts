import {BaseSeries, seriesFrom} from "./baseSeries";

/**
 * An immutable datum object that holds the spike (time, value) representing a neuron spike
 */
export interface Datum {
    readonly time: number;
    readonly value: number;
}

/**
 * Creates a datum from a (time, value) pair
 * @param time The time
 * @param value The value
 * @return A {@link Datum} instance with the specified (time, value)
 */
export const datumOf = (time: number, value: number): Datum => ({time, value})

export const emptyDatum = (): Datum => ({time: NaN, value: NaN})

export type TimeSeries = BaseSeries<Datum>


/**
 * Creates a series from the name and the optional array of (x, y) pairs (tuples)
 * @param name The name of the series
 * @param data The optional array of (x, y) pairs (tuples)
 * @return A `Series` for object that can be used by the `RasterChart`
 * @see seriesFrom
 * @see emptySeries
 */
export const timeSeriesFromTuples = (name: string, data: Array<[number, number]> = []): TimeSeries =>
    seriesFrom(name, data.map(([t, y]) => datumOf(t, y)))

export interface PixelDatum extends Datum {
    x: number;
    y: number;
}


