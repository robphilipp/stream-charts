import {Datum} from "./datumSeries";

/**
 * The spike-chart data produced by the rxjs observable that is pushed to the `RasterChart`
 */
export interface ChartData {
    maxTime: number;
    // map(series_name -> array(datum))
    newPoints: Map<string, Array<Datum>>;
}

/**
 * Creates an empty chart data object with all the values set to 0
 * @param {Array<string>} series The list of series names (identifiers) to update
 * @return {ChartData} An empty chart data object
 */
export function emptyChartData(series: Array<string>): ChartData {
    return {
        maxTime: 0,
        newPoints: new Map<string, Array<Datum>>(series.map(name => [name, [{time: 0, value: 0}]]))
    }
}
