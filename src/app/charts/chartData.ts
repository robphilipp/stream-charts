import {Datum} from "./datumSeries";

/**
 * The spike-chart data produced by the rxjs observable that is pushed to the `RasterChart`
 */
export interface ChartData {
    maxTime: number;
    newPoints: Array<IndexedDatum>
}

export interface IndexedDatum {
    index: number;
    datum: Datum;
}

/**
 * Creates an empty chart data object with all the values set to 0
 * @param {number} numSeries The number of series in the chart data
 * @return {ChartData} An empty chart data object
 */
export function emptyChartData(numSeries: number): ChartData {
    return {
        maxTime: 0,
        newPoints: new Array<Datum>(numSeries)
            .fill({} as Datum)
            .map((_: Datum, i: number) => ({
                index: i,
                datum: {
                    time: 0,
                    value: 0
                }
            }))
    }
}

