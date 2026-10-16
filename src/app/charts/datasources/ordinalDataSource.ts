import type {BaseSeries} from "../series/baseSeries";
import {emptySeries} from "../series/baseSeries";
import {calculateOrdinalStats, type OrdinalDatum} from "../series/ordinalSeries";
import {
    copyOrdinalDatumExtremum,
    copyOrdinalValueStats,
    copyValueStatsForSeries,
    defaultOrdinalValueStats,
    initialMaxValueDatum,
    initialMinValueDatum,
    type OrdinalChartData,
    type OrdinalStats,
    type OrdinalValueStats
} from "../observables/ordinals";
import {BaseStreamingDataSource, type DataGenerator} from "./StreamingDataSource";

export interface WindowedOrdinalStats extends OrdinalStats {
    /**
     * A map associating each series to stats about that series (e.g. map(series_name -> stats))
     */
    windowedValueStatsForSeries: Map<string, OrdinalValueStats>
}

/**
 * Calculates the ordinal stats for each of the ordinal series (generally, initial data) and
 * returns a {@link WindowedOrdinalStats} object
 * @param series The array of ordinal series
 * @return A {@link WindowedOrdinalStats} object with the stats for each of the series
 */
export function initialOrdinalStats(series: Array<BaseSeries<OrdinalDatum>>): WindowedOrdinalStats {
    const ordinalStats = calculateOrdinalStats(series)
    return {
        ...ordinalStats,
        windowedValueStatsForSeries: copyValueStatsForSeries(ordinalStats.valueStatsForSeries)
    }
}

/**
 * First of two functions to calculate the current ordinal stats for the current time window. This
 * function updates the windowed stats for the new data.
 * @param newData The new data for that series
 * @param windowedStats The current windowed ordinal value stats
 * @return The windowed ordinal value stats updated for the new data
 */
function updatedWindowedValueStatsForNewData(newData: Array<OrdinalDatum>, windowedStats: OrdinalValueStats): OrdinalValueStats {
    const updatedStats = copyOrdinalValueStats(windowedStats)
    updatedStats.count += newData.length
    const newSum = newData.reduce((total, datum) => total + datum.value, 0)
    updatedStats.sum += newSum
    updatedStats.sumSquared += newSum * newSum
    updatedStats.mean = (updatedStats.count > 0) ? updatedStats.sum / updatedStats.count : NaN
    updatedStats.min = newData.reduce((min, datum) => datum.value < min.value ? datum : min, updatedStats.min)
    updatedStats.max = newData.reduce((max, datum) => datum.value > max.value ? datum : max, updatedStats.max)
    return updatedStats
}

/**
 * Second of two functions to calculate the current ordinal stats for the current time window. This
 * function updates the windowed stats for the dropped data (the min and max are recalculated from
 * the data that's left)
 * @param droppedData An array of datum that was dropped from the time window
 * @param windowedStats The current windowed ordinal value stats
 * @param series An array of series holding all the current data in the time-window
 * @return The windowed ordinal value stats updated for the dropped data
 */
function updateWindowedValueStatsForDroppedData(
    droppedData: Array<OrdinalDatum>,
    windowedStats: OrdinalValueStats,
    series: BaseSeries<OrdinalDatum>
): OrdinalValueStats {
    const updatedStats = copyOrdinalValueStats(windowedStats)
    updatedStats.count -= droppedData.length
    const droppedSum = droppedData.reduce((total, datum) => total + datum.value, 0)
    updatedStats.sum -= droppedSum
    updatedStats.sumSquared -= droppedSum * droppedSum
    updatedStats.mean = (updatedStats.count > 0) ? updatedStats.sum / updatedStats.count : NaN
    updatedStats.min = series.data.reduce((min, datum) => datum.value < min.value ? datum : min, initialMinValueDatum())
    updatedStats.max = series.data.reduce((max, datum) => datum.value > max.value ? datum : max, initialMaxValueDatum())
    return updatedStats
}

export interface OrdinalDataSourceOptions {
    /**
     * The initial series, owned (and mutated in place) by the source from here on
     */
    initialData: Array<BaseSeries<OrdinalDatum>>
    /**
     * Creates the observable of chart data each time the source starts
     */
    generator: DataGenerator<OrdinalChartData, BaseSeries<OrdinalDatum>>
    /**
     * Data older than this (ms), relative to the chart-wide current time, is dropped (and removed
     * from the windowed stats) as new data arrives. Defaults to `Infinity` (never drop).
     */
    dropDataAfter?: number
    /**
     * Called with each series' new data as it arrives
     */
    onUpdateData?: (seriesName: string, data: Array<OrdinalDatum>) => void
}

/**
 * A data source for ordinal charts (e.g. the bar plot). Besides the series, it keeps the lifetime
 * stats (from the chart data) and the windowed stats (over the data currently held) for each
 * series, so they keep accumulating while no plot is mounted.
 */
export class OrdinalDataSource extends BaseStreamingDataSource<OrdinalChartData, OrdinalDatum, BaseSeries<OrdinalDatum>> {
    /**
     * The lifetime and windowed stats, updated in place as data arrives
     */
    readonly stats: WindowedOrdinalStats

    private dropDataAfter: number
    private readonly onUpdateData: ((seriesName: string, data: Array<OrdinalDatum>) => void) | undefined

    /**
     * Creates a ordinal data source (stopped: call {@link start} to start it)
     * @param options The initial data, the generator, and the data-retention settings
     */
    constructor(options: OrdinalDataSourceOptions) {
        super(options.initialData, options.generator)
        this.stats = initialOrdinalStats(options.initialData)
        this.dropDataAfter = options.dropDataAfter ?? Infinity
        this.onUpdateData = options.onUpdateData
    }

    /**
     * Changes how long data is kept; takes effect as the next data arrives
     * @param dropDataAfter Data older than this (ms) is dropped
     */
    setDropDataAfter(dropDataAfter: number): void {
        this.dropDataAfter = dropDataAfter
    }

    /**
     * @return The latest time (the `time` of the last datum) over all the series, or
     * `-Infinity` when there is no data
     */
    latestTime(): number {
        return this.seriesList().reduce(
            (tMax, series) => Math.max(tMax, series.last().map(datum => datum.time).getOrElse(tMax)),
            -Infinity
        )
    }

    /**
     * Adds each series' new points to it, copies the chunk's lifetime stats, updates the series'
     * windowed stats for the new points, and then drops the points that are older than
     * `dropDataAfter` relative to the chart-wide current time (the time of the latest datum over
     * all series), removing them from the windowed stats too. New points for a series that isn't
     * in the source are ignored (bar charts have a fixed set of categories). Calls `onUpdateData`
     * with each series' new points.
     * @param data The chunk of chart data emitted by the generator
     */
    protected ingest(data: OrdinalChartData): void {
        // the chart-wide current time (the time of the latest datum over all series). When it
        // isn't a number, the drop comparison below is simply false, so nothing is dropped.
        const currentTime = data.stats.maxDatum.time.time

        data.newPoints.forEach((newData, name) => {
            // note: as in the original subscription code, data for a series that isn't already in
            // the source is accepted but not kept (bar charts have a fixed set of categories)
            const series = this.seriesMap.get(name) || emptySeries<OrdinalDatum>(name)

            if (this.onUpdateData) this.onUpdateData(name, newData)

            series.data.push(...newData)

            // grab the (lifetime) stats
            this.stats.minDatum = copyOrdinalDatumExtremum(data.stats.minDatum)
            this.stats.maxDatum = copyOrdinalDatumExtremum(data.stats.maxDatum)
            this.stats.valueStatsForSeries = copyValueStatsForSeries(data.stats.valueStatsForSeries)

            // set up for the windowed-stats
            const lifetimeValueStats = data.stats.valueStatsForSeries.get(name) || defaultOrdinalValueStats()
            if (!this.stats.windowedValueStatsForSeries.has(name)) {
                this.stats.windowedValueStatsForSeries.set(name, copyOrdinalValueStats(lifetimeValueStats))
            }

            // update the windowed-stats for the new points (the dropped points are dealt with below)
            const windowedValueStats = updatedWindowedValueStatsForNewData(
                newData,
                this.stats.windowedValueStatsForSeries.get(name)!
            )
            this.stats.windowedValueStatsForSeries.set(name, windowedValueStats)

            // drop data older than the max time-window, holding on to the dropped ones -- guarded
            // on series.data.length, since the current time is the max across ALL series, so a
            // single lagging series could otherwise be shifted down to empty
            const droppedData: Array<OrdinalDatum> = []
            while (series.data.length > 0 && currentTime - series.data[0].time > this.dropDataAfter) {
                const dropped = series.data.shift()
                if (dropped !== undefined) droppedData.push(dropped)
            }

            // remove the dropped data from the windowed stats
            if (droppedData.length > 0) {
                this.stats.windowedValueStatsForSeries.set(
                    name,
                    updateWindowedValueStatsForDroppedData(droppedData, windowedValueStats, series)
                )
            }
        })
    }
}
