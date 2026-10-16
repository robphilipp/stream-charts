import {type BaseSeries, seriesFrom} from "./baseSeries";

/**
 * An immutable datum object that holds an (x, y) value -- for a time series, a (time, value) pair
 * (e.g. a neuron spike, or a weight)
 */
export interface Datum {
    readonly x: number;
    readonly y: number;
}

/**
 * Creates a datum from a (time, value) pair
 * @param time The time
 * @param value The value
 * @return A {@link Datum} instance with the specified (time, value)
 */
export const datumOf = (time: number, value: number): Datum => ({x: time, y: value})

/**
 * @return An empty datum (its x and y are `NaN`)
 */
export const emptyDatum = (): Datum => ({x: NaN, y: NaN})

/**
 * A series of (time, value) data (e.g. for the scatter and raster plots)
 */
export type TimeSeries = BaseSeries<Datum>


/**
 * Creates a series from the name and the optional array of (x, y) pairs (tuples)
 * @param name The name of the series
 * @param data The optional array of (x, y) pairs (tuples)
 * @return A {@link TimeSeries} that can be used by, e.g., the `ScatterPlot` and the `RasterPlot`
 * @see seriesFrom
 * @see emptySeries
 */
export const timeSeriesFromTuples = (name: string, data: Array<[number, number]> = []): TimeSeries =>
    seriesFrom(name, data.map(([t, y]) => datumOf(t, y)))

/**
 * Extends the {@link Datum} interface with the pixel coordinates of the datum.
 */
export interface PixelDatum extends Datum {
    xPixel: number;
    yPixel: number;
}


