/**
 * Converts an observable of {@link TimeSeriesChartData} into an observable of {@link OrdinalChartData} for
 * plotting categorical data.
 * 1. Convert series to chart data observable in the usual way
 * 2. Accepts that chart-data observable and converts that observable to an ordinal-chart-data observable
 */
import {Observable} from "rxjs";
import type {TimeSeriesChartData} from "../series/timeSeriesChartData";
import {map, scan} from "rxjs/operators";
import type {Datum} from "../series/timeSeries";
import {copyOrdinalDatum, nonEmptyOrdinalDatum, type OrdinalDatum, ordinalDatumOf} from "../series/ordinalSeries";
import {type ChartData, copyChartData, defaultChartData} from "./ChartData";
import {FastShiftArray} from "fast-shift-array";
import {DEFAULT_COMPACTING_SIZE} from "../series/baseSeries";

export interface OrdinalChartData extends ChartData {
    /**
     * Statistics for the chart. Holds the overall minimum and maximum (across all
     * the series), and statistics for each series.
     */
    stats: OrdinalStats

    /**
     * Map holding the name of the series (the time-series identifier) and the associated
     * data points for that time-series (`map(series_name -> array(datum))`)
     */
    // newPoints: Map<string, Array<OrdinalDatum>>
    newPoints: Map<string, FastShiftArray<OrdinalDatum>>
}

/**
 * Statistics for the chart. Holds the overall minimum and maximum (across all
 * the series), and statistics for each individual series.
 */
export interface OrdinalStats {
    /**
     * The data with the min time, and with the min value, over all the data so far
     */
    minDatum: OrdinalDatumExtremum

    /**
     * The data with the max time, and with the max value, over all the data so far
     */
    maxDatum: OrdinalDatumExtremum

    /**
     * A map associating each series to stats about that series (e.g. map(series_name -> stats))
     */
    valueStatsForSeries: Map<string, OrdinalValueStats>
}

/**
 * Statistics about the values of a series: the data with the min and max values, the number of
 * values, their sum, the sum of their squares, and their mean
 */
export type OrdinalValueStats = {
    min: OrdinalDatum
    max: OrdinalDatum
    count: number
    sum: number
    sumSquared: number
    mean: number
}

/**
 * The data with the extreme (min or max) time, and with the extreme value
 */
export type OrdinalDatumExtremum = {
    // holds the ordinal datum with the minimum or maximum time
    time: OrdinalDatum
    // holds the ordinal datum with the minimum or maximum value
    value: OrdinalDatum
}

/**
 * @return The datum to start a search for the min value from: its value (`Infinity`) is larger
 * than any other
 */
export const initialMinValueDatum = (): OrdinalDatum => ordinalDatumOf(NaN, "", Infinity)
/**
 * @return The datum to start a search for the max value from: its value (`-Infinity`) is smaller
 * than any other
 */
export const initialMaxValueDatum = (): OrdinalDatum => ordinalDatumOf(NaN, "", -Infinity)

/**
 * @return The datum to start a search for the min time from: its time (`Infinity`) is later than
 * any other
 */
export const initialMinTimeDatum = (): OrdinalDatum => ordinalDatumOf(Infinity, "", NaN)
/**
 * @return The datum to start a search for the max time from: its time (`-Infinity`) is earlier
 * than any other
 */
export const initialMaxTimeDatum = (): OrdinalDatum => ordinalDatumOf(-Infinity, "", NaN)

/**
 * @return The extremum to start a search for the min time and value from
 */
const initialMinOrdinalDatum = (): OrdinalDatumExtremum => ({
    time: ordinalDatumOf(Infinity, "", NaN),
    value: initialMinValueDatum()
})

/**
 * @return The extremum to start a search for the max time and value from
 */
const initialMaxOrdinalDatum = (): OrdinalDatumExtremum => ({
    time: ordinalDatumOf(-Infinity, "", NaN),
    value: initialMaxValueDatum()
})

/**
 * Copies an extremum (and its data)
 * @param datum The extremum to copy
 * @return The copy
 */
export function copyOrdinalDatumExtremum(datum: OrdinalDatumExtremum): OrdinalDatumExtremum {
    return {
        time: copyOrdinalDatum(datum.time),
        value: copyOrdinalDatum(datum.value)
    }
}

/**
 * @return Stats for no data: extremes to start the searches from, and no series' stats
 */
export const defaultOrdinalStats = (): OrdinalStats => ({
    minDatum: initialMinOrdinalDatum(),
    maxDatum: initialMaxOrdinalDatum(),
    valueStatsForSeries: new Map<string, OrdinalValueStats>()
})

/**
 * @return Value stats for no data: a count, sum, and sum of squares of 0, a `NaN` mean, and min
 * and max data to start the searches from
 */
export const defaultOrdinalValueStats = (): OrdinalValueStats => ({
    min: initialMinValueDatum(),
    max: initialMaxValueDatum(),
    count: 0,
    sum: 0,
    mean: NaN,
    sumSquared: 0,
})

/**
 * Copies a series' value stats (and their min and max data)
 * @param data The value stats to copy
 * @return The copy
 */
export function copyOrdinalValueStats(data: OrdinalValueStats): OrdinalValueStats {
    return {
        ...data,
        min: copyOrdinalDatum(data.min),
        max: copyOrdinalDatum(data.max),
    }
}

/**
 * Copies the map of each series' value stats (and the stats)
 * @param valueStats The value stats, by series name
 * @return The copy
 */
export function copyValueStatsForSeries(valueStats: Map<string, OrdinalValueStats>): Map<string, OrdinalValueStats> {
    return new Map<string, OrdinalValueStats>(Array.from(valueStats.entries())
        .map(([seriesName, valueStats]) => [seriesName, copyOrdinalValueStats(valueStats)])
    )
}

/**
 * Copies the stats (the extremes, and each series' value stats)
 * @param data The stats to copy
 * @return The copy
 */
export const copyOrdinalStats = (data: OrdinalStats): OrdinalStats => ({
    minDatum: copyOrdinalDatumExtremum(data.minDatum),
    maxDatum: copyOrdinalDatumExtremum(data.maxDatum),
    valueStatsForSeries: copyValueStatsForSeries(data.valueStatsForSeries),
})

/**
 * @return Ordinal chart data without any series or points, and with the default stats
 */
const emptyOrdinalData = (): OrdinalChartData => ({
    ...defaultChartData(),
    stats: defaultOrdinalStats(),
    newPoints: new Map<string, FastShiftArray<OrdinalDatum>>()
    // newPoints: new Map<string, Array<OrdinalDatum>>()
})

/**
 * Makes a copy of the ordinal chart data: a new set of series names, copies of the stats, and new
 * arrays of points (the points themselves are shared)
 * @param data The ordinal chart data to copy
 * @return The copy
 */
export const copyOrdinalDataFrom = (data: OrdinalChartData): OrdinalChartData => ({
    ...copyChartData(data),
    stats: copyOrdinalStats(data.stats),
    newPoints: new Map<string, FastShiftArray<OrdinalDatum>>(Array.from(data.newPoints.entries()).map(([name, points]) => [name, points.slice()])),
    // newPoints: new Map<string, Array<OrdinalDatum>>(Array.from(data.newPoints.entries()).map(([name, points]) => [name, points.slice()])),
})

/**
 * @param initialStats Optional stats to start the accumulation from (see {@link ordinalsObservable})
 * @return The initial accumulated chart data
 */
const initialAccumulate = (initialStats?: OrdinalStats): OrdinalChartData =>
    initialStats === undefined ?
        emptyOrdinalData() :
        {
            ...emptyOrdinalData(),
            seriesNames: new Set(initialStats.valueStatsForSeries.keys()),
            stats: copyOrdinalStats(initialStats)
        }

/**
 * Accepts a {@link TimeSeriesChartData} observable and converts it to an observable of {@link OrdinalChartData}:
 * each emission holds the incoming chunk's points (as ordinal data), and the stats accumulated over
 * all the data so far.
 * @param dataObservable The observable over {@link TimeSeriesChartData}
 * @param [compactingSize=DEFAULT_COMPACTING_SIZE] The number of shifts a series' backing array accumulates before it's compacted
 * @param initialStats Optional stats of the data that already exists (e.g. a chart's accumulated
 * series, see `calculateOrdinalStats`), from which the stats accumulate -- so that the stats cover
 * that data without the data having to be re-emitted through `dataObservable`
 * @return An observable of {@link OrdinalChartData} holding the series for the incoming chart data
 */
export function ordinalsObservable(
    dataObservable: Observable<TimeSeriesChartData>,
    compactingSize: number = DEFAULT_COMPACTING_SIZE,
    initialStats?: OrdinalStats,
): Observable<OrdinalChartData> {
    return dataObservable
        .pipe(
            // calculate the stats for each series in the chart data
            //
            // note: only the stats and the latest new points are accumulated -- the incoming points
            // themselves aren't kept (the data source holds the series). A previous version also
            // appended every incoming point to a map that nothing ever read, which grew without bound
            // for as long as the stream ran (one point per series per tick).
            scan((accumulated: OrdinalChartData, current: TimeSeriesChartData) => {
                // make a deep copy of the accumulated data (because the accumulated data object
                // holds references to maps)
                const accum = copyOrdinalDataFrom(accumulated)

                // for each series, add the new points to the accumulated data
                Array
                    .from(current.newPoints.entries())
                    .forEach(([name, series]) => {
                        // add the series name to the list of all
                        accum.seriesNames.add(name)

                        // calculate the max-time, min-time, max-value, and min-value for
                        // all the data series
                        series.forEach(({x, y}: Datum, ) => {
                            // calculate the min and max times over all series
                            if (x < accum.stats.minDatum.time.time) {
                                accum.stats.minDatum.time = ordinalDatumOf(x, name, y)
                            }
                            if (x > accum.stats.maxDatum.time.time) {
                                accum.stats.maxDatum.time = ordinalDatumOf(x, name, y)
                            }
                            // calculate the min and max values over all series
                            if (y < accum.stats.minDatum.value.value) {
                                accum.stats.minDatum.value = ordinalDatumOf(x, name, y)
                            }
                            if (y > accum.stats.maxDatum.value.value) {
                                accum.stats.maxDatum.value = ordinalDatumOf(x, name, y)
                            }

                            // calculate the min, max of the time and value for each series
                            let valueStats: OrdinalValueStats = accum.stats.valueStatsForSeries.get(name) || defaultOrdinalValueStats()

                            const minValue = (y < valueStats.min.value) ?
                                ordinalDatumOf(x, name, y) :
                                copyOrdinalDatum(valueStats.min)
                            const maxValue = (y > valueStats.max.value) ?
                                ordinalDatumOf(x, name, y) :
                                copyOrdinalDatum(valueStats.max)
                            const count = valueStats.count + 1
                            const sum = valueStats.sum + y
                            valueStats = {
                                min: minValue,
                                max: maxValue,
                                count,
                                sum,
                                sumSquared: isNaN(valueStats.sumSquared) ? y * y : valueStats.sumSquared + y * y,
                                mean: sum / count
                            }

                            accum.stats.valueStatsForSeries.set(name, valueStats)
                        })

                        // convert the new points to ordinal datum
                        accum.newPoints.set(name, FastShiftArray.fromArray(
                            series.map(({x, y}: Datum) => ordinalDatumOf(x, name, y)),
                            true,
                            compactingSize
                        ))
                        // accum.newPoints.set(name, series.map(({x, y}: Datum) => ordinalDatumOf(x, name, y)))
                    })
                return accum
            }, initialAccumulate(initialStats)),

            // remove new points from the map that are empty
            map(accumulated => removeEmptyNewPoints(accumulated))
        )
}

/**
 * @param data The ordinal chart data
 * @return A copy of the chart data, without any empty new points
 */
function removeEmptyNewPoints(data: OrdinalChartData): OrdinalChartData {
    const newPoints = new Map(
        Array
            .from(data.newPoints.entries())
            .map(([name, points]) => [name, points.filter(point => nonEmptyOrdinalDatum(point))])
    )
    return {...data, newPoints}
}