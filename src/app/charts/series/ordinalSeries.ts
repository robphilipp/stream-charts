import {BaseSeries, seriesFrom} from "./baseSeries";
import {
    initialMaxTimeDatum,
    initialMaxValueDatum, initialMinTimeDatum,
    initialMinValueDatum,
    OrdinalChartData,
    OrdinalStats,
    OrdinalValueStats
} from "../observables/ordinals";

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
 * Creates an empty ordinal datum
 */
export const emptyOrdinalDatum: OrdinalDatum = {
    time: NaN,
    ordinal: "",
    value: NaN,
}

export const copyOrdinalDatum = (datum: OrdinalDatum): OrdinalDatum => ({
    time: datum.time,
    ordinal: datum.ordinal,
    value: datum.value,
})

/**
 * Creates an iterate datum
 * @param time The datum time, which is mostly informational
 * @param ordinal The category name or identifier
 * @param value The value
 * @return An iterate datum
 */
export const ordinalDatumOf = (time: number, ordinal: string, value: number): OrdinalDatum => ({
    time,
    ordinal,
    value,
})


/**
 * Returns whether the ordinal datum is empty. An ordinal datum is considered empty
 * when the time is NaN, the ordinal is blank (empty or only whitespace), and the value
 * is NaN.
 * @param datum The iterate datum to test
 * @return `true` if the iterate datum is empty; `false` otherwise
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
 * Creates an empty chart data object with all the values set to 0
 * @param seriesList The list of series names (identifiers) to update
 * @return An empty chart data object
 */
export function initialOrdinalChartData(seriesList: Array<OrdinalSeries>): OrdinalChartData {
    return {
        seriesNames: new Set(seriesList.map(series => series.name)),
        stats: calculateOrdinalStats(seriesList),
        newPoints: new Map<string, Array<OrdinalDatum>>(seriesList.map(series => [
            series.name,
            series.data.map(datum => ({
                time: datum.time,
                ordinal: datum.ordinal,
                value: datum.value,
            }))
        ]))
    }
}

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
                (min, datum) =>  datum.value < min.value ? datum : min,
                globalMin
            )
            return seriesMin.value < globalMin.value ? seriesMin : globalMin
        },
        initialMinTimeDatum()
    )
    const maxTimeDatum: OrdinalDatum = seriesList.reduce(
        (globalMax: OrdinalDatum, series: OrdinalSeries) => {
            const seriesMax = series.data.reduce(
                (max, datum) =>  datum.value > max.value ? datum : max,
                globalMax
            )
            return seriesMax.value > globalMax.value ? seriesMax : globalMax
        },
        initialMaxTimeDatum()
    )
    return {
        maxDatum: {time: maxTimeDatum, value: maxValueDatum},
        minDatum: {time: minTimeDatum, value: minValueDatum},
        valueStatsForSeries: ordinalValueStats
    }
}

