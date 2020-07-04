import {Datum} from "./datumSeries";

/**
 * The spike-chart data produced by the rxjs observable that is pushed to the `RasterChart`
 */
export interface ChartData {
    /**
     * The max (latest) time for the data in the newPoints map
     */
    maxTime: number;

    /**
     * Map holding the name of the series (the time-series identifier) and the associated
     * data points for that time-series (`map(series_name -> array(datum))`)
     */
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
