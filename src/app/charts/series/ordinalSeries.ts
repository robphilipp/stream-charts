import {type BaseSeries, seriesFrom} from "./baseSeries";
import {
    initialMaxTimeDatum,
    initialMaxValueDatum, initialMinTimeDatum,
    initialMinValueDatum,
    type OrdinalChartData,
    type OrdinalStats,
    type OrdinalValueStats
} from "../observables/ordinals";
import type {FastShiftArray} from "fast-shift-array";

/**
 * An immutable datum object for series with a category and value.
 * This could be a series of (ordinal, value) where the category runs
 * along the x-axis. Or, it could be a series of (value, ordinal) where
 * the categories run along the y-axis.
 */
export interface OrdinalDatum {
    readonly time: number
    readonly ordinal: string
    readonly value: number
}


/**
 * An empty ordinal datum (`NaN` time and value, and an empty ordinal)
 */
export const emptyOrdinalDatum: OrdinalDatum = {
    time: NaN,
    ordinal: "",
    value: NaN,
}

/**
 * Copies an ordinal datum
 * @param datum The datum to copy
 * @return The copy
 */
export const copyOrdinalDatum = (datum: OrdinalDatum): OrdinalDatum => ({
    time: datum.time,
    ordinal: datum.ordinal,
    value: datum.value,
})

/**
 * Creates an ordinal datum
 * @param time The datum time, which is mostly informational
 * @param ordinal The category name or identifier
 * @param value The value
 * @return An ordinal datum
 */
export const ordinalDatumOf = (time: number, ordinal: string, value: number): OrdinalDatum => ({
    time,
    ordinal,
    value,
})


/**
 * Returns whether the ordinal datum is non-empty. An ordinal datum is considered empty when its
 * time is NaN, its ordinal is blank (empty or only whitespace), or its value is NaN.
 * @param datum The ordinal datum to test
 * @return `true` if the ordinal datum is non-empty; `false` otherwise
 */
export const nonEmptyOrdinalDatum = (datum: OrdinalDatum): boolean =>
    !isNaN(datum.time) && datum.ordinal.replace(/\s/g, "").length > 0 && !isNaN(datum.value)

/**
 * A series of ordinal datum
 */
export type OrdinalSeries = BaseSeries<OrdinalDatum>

/**
 * Creates a series from the name and the optional array of (time, ordinal, value) tuples
 * @param name The name of the series
 * @param data The optional array of (time, ordinal, value) tuples
 * @return An {@link OrdinalSeries} for charts where one axis is the category, and the other a value
 * @see seriesFrom
 * @see emptySeries
 */
export function ordinateSeriesFromTuples(
    name: string,
    data: Array<[time: number, ordinal: string, value: number]> = []
): OrdinalSeries {
    return seriesFrom(
        name,
        data.map(([t, ordinal, value]) => ordinalDatumOf(t, ordinal, value))
    )
}

/**
 * Creates the ordinal chart data for the specified series: their names, the stats calculated over
 * their data (see {@link calculateOrdinalStats}), and copies of all their data as the new points
 * @param seriesList The series
 * @return The ordinal chart data for the series
 */
export function initialOrdinalChartData(seriesList: Array<OrdinalSeries>): OrdinalChartData {
    return {
        seriesNames: new Set(seriesList.map(series => series.name)),
        stats: calculateOrdinalStats(seriesList),
        // newPoints: new Map<string, Array<OrdinalDatum>>(seriesList.map(series => [
        newPoints: new Map<string, FastShiftArray<OrdinalDatum>>(seriesList.map(series => [
            series.name,
            series.data.map(datum => ({
                time: datum.time,
                ordinal: datum.ordinal,
                value: datum.value,
            }))
        ]))
    }
}

/**
 * Calculates the stats of the specified series: the data with the min and max time, and with the
 * min and max value, over all the series, and each series' value stats (its min, max, count, sum,
 * sum of squares, and mean)
 * @param seriesList The series
 * @return The stats (when there's no data, the extremes are the initial ones that searches start
 * from -- see e.g. {@link initialMinTimeDatum})
 */
export function calculateOrdinalStats(seriesList: Array<OrdinalSeries>): OrdinalStats {
    const ordinalValueStats = new Map<string, OrdinalValueStats>(seriesList.map(
        (series: OrdinalSeries) => {
            const seriesMin = series.data.reduce(
                (min, datum) => datum.value < min.value ? datum : min,
                initialMinValueDatum()
            )
            const seriesMax = series.data.reduce(
                (max, datum) => datum.value > max.value ? datum : max,
                initialMaxValueDatum()
            )
            const seriesSum = series.data.reduce((sum, datum) => sum + datum.value, 0)
            const seriesSumSquared = series.data.reduce((sumSquared, datum) => sumSquared + datum.value * datum.value, 0)
            const seriesMean = series.data.length > 0 ? seriesSum / series.data.length : NaN
            return [series.name, {
                max: seriesMax,
                min: seriesMin,
                count: series.data.length,
                sum: seriesSum,
                sumSquared: seriesSumSquared,
                mean: seriesMean,
            }]
        }
    ))
    const minValueDatum: OrdinalDatum = Array.from(ordinalValueStats.values()).reduce(
        (min: OrdinalDatum, value: OrdinalValueStats) => value.min.value < min.value ? value.min : min,
        initialMinValueDatum()
    )
    const maxValueDatum: OrdinalDatum = Array.from(ordinalValueStats.values()).reduce(
        (max: OrdinalDatum, value: OrdinalValueStats) => value.max.value > max.value ? value.max : max,
        initialMaxValueDatum()
    )
    const minTimeDatum: OrdinalDatum = seriesList.reduce(
        (globalMin: OrdinalDatum, series: OrdinalSeries) => {
            const seriesMin = series.data.reduce(
                (min, datum) =>  datum.time < min.time ? datum : min,
                globalMin
            )
            return seriesMin.time < globalMin.time ? seriesMin : globalMin
        },
        initialMinTimeDatum()
    )
    const maxTimeDatum: OrdinalDatum = seriesList.reduce(
        (globalMax: OrdinalDatum, series: OrdinalSeries) => {
            const seriesMax = series.data.reduce(
                (max, datum) =>  datum.time > max.time ? datum : max,
                globalMax
            )
            return seriesMax.time > globalMax.time ? seriesMax : globalMax
        },
        initialMaxTimeDatum()
    )
    return {
        maxDatum: {time: maxTimeDatum, value: maxValueDatum},
        minDatum: {time: minTimeDatum, value: minValueDatum},
        valueStatsForSeries: ordinalValueStats
    }
}

