import {Datum, Series} from "./datumSeries";

/**
 * The spike-chart data produced by the rxjs observable that is pushed to the `RasterChart`
 */
export interface ChartData {
    /**
     * The max (latest) time for the data in the newPoints map
     */
    maxTime: number

    /**
     * Holds the association of the series name to the current max time for that series
     */
    maxTimes: Map<string, number>

    /**
     * Map holding the name of the series (the time-series identifier) and the associated
     * data points for that time-series (`map(series_name -> array(datum))`)
     */
    newPoints: Map<string, Array<Datum>>
    currentTime?: number
}

/**
 * Creates an empty chart data object with all the values set to 0
 * @param {Array<string>} series The list of series names (identifiers) to update
 * @return {ChartData} An empty chart data object
 */
export function emptyChartData(series: Array<string>): ChartData {
    return {
        maxTime: 0,
        maxTimes: new Map(series.map(name => [name, 0])),
        newPoints: new Map<string, Array<Datum>>(series.map(name => [name, [{time: 0, value: 0}]]))
    }
}

/**
 * Creates an empty chart data object with all the values set to 0
 * @param seriesList The list of series names (identifiers) to update
 * @return An empty chart data object
 */
export function initialChartData(seriesList: Array<Series>): ChartData {
    const maxTime = seriesList.reduce(
        (tMax, series) => Math.max(tMax, series.last().map(p => p.time).getOrElse(-Infinity)),
        -Infinity
    )
    return {
        maxTime,
        maxTimes: new Map(seriesList.map(series => [series.name, series.last().map(p => p.time).getOrElse(0)])),
        newPoints: new Map<string, Array<Datum>>(seriesList.map(series => [
            series.name,
            [{
                time: series.last().map(p => p.time).getOrElse(0),
                value: series.last().map(p => p.value).getOrElse(0)
            }]
        ]))
    }
}
