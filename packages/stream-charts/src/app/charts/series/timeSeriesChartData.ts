import type {Datum, TimeSeries} from "./timeSeries";
import {type ChartData, defaultChartData} from "../observables/ChartData";
import {FastShiftArray} from "fast-shift-array";
import {DEFAULT_COMPACTING_SIZE} from "./baseSeries";

/**
 * The time-series chart data produced by the rxjs observable that is pushed to a streaming chart
 * (e.g. the scatter and raster charts): each chunk's new points, and the latest times
 */
export interface TimeSeriesChartData extends ChartData {
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

    /**
     * The current time (for example, when used with cadence)
     */
    currentTime?: number
}

/**
 * Creates a chart data object for the specified series whose times are all 0, and whose new
 * points are a single (0, 0) point for each series
 * @param series The list of series names (identifiers) to update
 * @return The chart data object
 */
export function emptyTimeSeriesChartData(series: Array<string>): TimeSeriesChartData {
    return {
        ...defaultChartData(),
        seriesNames: new Set(series),
        maxTime: 0,
        maxTimes: new Map(series.map(name => [name, 0])),
        newPoints: new Map<string, Array<Datum>>(series.map(name => [name, [{x: 0, y: 0}]]))
    }
}

/**
 * Creates the chart data object to start a stream from, for the specified series: its new points
 * are each series' last datum (or (0, 0), for an empty series), each series' max time is the
 * time of its last datum (or 0), and the max time is the latest of those (or `-Infinity`, when
 * there are no series)
 * @param seriesList The series
 * @param [currentTime=0] The current time
 * @param [compactingSize=DEFAULT_COMPACTING_SIZE] The number of shifts each new-points array
 * accumulates before it's compacted
 * @return The chart data object
 */
export function initialTimeSeriesChartData(
    seriesList: Array<TimeSeries>,
    currentTime: number = 0,
    compactingSize: number = DEFAULT_COMPACTING_SIZE
): TimeSeriesChartData {
    const maxTime = seriesList.reduce(
        (tMax, series) => Math.max(tMax, series.last().map(datum => datum.x).getOrElse(-Infinity)),
        -Infinity
    )
    return {
        seriesNames: new Set(seriesList.map(series => series.name)),
        maxTime,
        maxTimes: new Map(seriesList.map(series => [series.name, series.last().map(datum => datum.x).getOrElse(0)])),
        newPoints: new Map<string, Array<Datum>>(seriesList.map(series => [
            series.name,
            FastShiftArray.fromArray([{
                x: series.last().map(datum => datum.x).getOrElse(0),
                y: series.last().map(datum => datum.y).getOrElse(0)
            }], true, compactingSize)
        ])),
        currentTime: currentTime
    }
}
