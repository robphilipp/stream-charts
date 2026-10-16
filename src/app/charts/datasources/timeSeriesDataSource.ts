import type {Datum, TimeSeries} from "../series/timeSeries";
import type {TimeSeriesChartData} from "../series/timeSeriesChartData";
import {emptySeries} from "../series/baseSeries";
import {BaseStreamingDataSource, type DataGenerator} from "./StreamingDataSource";

/**
 * Maps a series name to the "time group" whose clock governs it. Series in the same group share
 * one current time (the max time over all of them), which is what `dropDataAfter` is measured
 * against. Plots group series by their x-axis, so this is typically
 * `name => axisAssignments.get(name)?.xAxis ?? defaultXAxisId`.
 */
export type TimeGroupFor = (seriesName: string) => string

/**
 * The default time grouping: one group, holding all the series
 */
const SINGLE_TIME_GROUP: TimeGroupFor = () => ""

/**
 * Calculates the current time for each time group present in the chart data: the max over the
 * group's series of each series' own max time (falling back to the chart-wide max time). Shared
 * by the data source (for dropping old data) and the plots' view drivers (for advancing each
 * x-axis), so both agree on what "now" is for each axis.
 * @param data The chart data
 * @param timeGroupFor Maps each series to its time group
 * @return A map(group -> current_time)
 */
export function currentTimesByGroup(data: TimeSeriesChartData, timeGroupFor: TimeGroupFor): Map<string, number> {
    const times = new Map<string, number>()
    data.seriesNames.forEach(name => {
        const group = timeGroupFor(name)
        const seriesTime = data.maxTimes.get(name) || data.maxTime
        times.set(group, Math.max(times.get(group) ?? -Infinity, seriesTime))
    })
    return times
}

export interface TimeSeriesDataSourceOptions {
    /**
     * The initial series, owned (and mutated in place) by the source from here on
     */
    initialData: Array<TimeSeries>
    /**
     * Creates the observable of chart data each time the source starts
     */
    generator: DataGenerator<TimeSeriesChartData, TimeSeries>
    /**
     * Data older than this (ms), relative to its time group's current time, is dropped as new
     * data arrives. Defaults to `Infinity` (never drop).
     */
    dropDataAfter?: number
    /**
     * Assigns each series to a time group (see {@link TimeGroupFor}). Defaults to one group for
     * all series.
     */
    timeGroupFor?: TimeGroupFor
    /**
     * Called with each series' new data as it arrives
     */
    onUpdateData?: (seriesName: string, data: Array<Datum>) => void
}

/**
 * A data source for time-series charts (e.g. the scatter and raster plots)
 */
export class TimeSeriesDataSource extends BaseStreamingDataSource<TimeSeriesChartData, Datum, TimeSeries> {
    private dropDataAfter: number
    private readonly timeGroupFor: TimeGroupFor
    private readonly onUpdateData: ((seriesName: string, data: Array<Datum>) => void) | undefined

    /**
     * Creates a time-series data source (stopped: call {@link start} to start it)
     * @param options The initial data, the generator, and the data-retention settings
     */
    constructor(options: TimeSeriesDataSourceOptions) {
        super(options.initialData, options.generator)
        this.dropDataAfter = options.dropDataAfter ?? Infinity
        this.timeGroupFor = options.timeGroupFor ?? SINGLE_TIME_GROUP
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
     * @return The latest time (the `x` of the last datum) over all the series, or
     * `-Infinity` when there is no data
     */
    latestTime(): number {
        return this.seriesList().reduce(
            (tMax, series) => Math.max(tMax, series.last().map(datum => datum.x).getOrElse(tMax)),
            -Infinity
        )
    }

    /**
     * Adds each series' new points to it, and drops the points that are older than
     * `dropDataAfter` relative to the current time of the series' time group (see
     * {@link currentTimesByGroup}). New points for a series that isn't in the source are ignored
     * (time-series charts have a fixed set of series). Calls `onUpdateData` with each series' new
     * points.
     * @param data The chunk of chart data emitted by the generator
     */
    protected ingest(data: TimeSeriesChartData): void {
        const groupTimes = currentTimesByGroup(data, this.timeGroupFor)

        // add each new point to its corresponding series, the new points is a
        // map(series_name -> new_point[])
        data.newPoints.forEach((newData, name) => {
            // note: as in the original subscription code, data for a series that isn't already in
            // the source is accepted but not kept (time-series charts have a fixed set of series)
            const series = this.seriesMap.get(name) || emptySeries<Datum>(name)

            if (this.onUpdateData) this.onUpdateData(name, newData)

            series.data.push(...newData)

            // drop data that is older than the max time-window -- guarded on series.data.length so
            // a sibling series in the same time group advancing the group's time past every point
            // this series holds (e.g. this series stalls/updates slower) can't shift it down to
            // empty and then throw on series.data[0].x
            const currentTime = groupTimes.get(this.timeGroupFor(name)) || data.maxTime
            while (series.data.length > 0 && currentTime - series.data[0].x > this.dropDataAfter) {
                series.data.shift()
            }
        })
    }
}
