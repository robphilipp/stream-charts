import type {IterateChartData} from "../observables/iterates";
import type {IterateDatum, IterateSeries} from "../series/iterateSeries";
import {emptySeries} from "../series/baseSeries";
import {BaseStreamingDataSource, type DataGenerator} from "./StreamingDataSource";

/**
 * Calculates the current time for a chunk of iterate chart data: the max over the series of the
 * time of each series' last new point (or 0 when there are no new points). Shared by the data
 * source (for dropping old data) and the Poincaré plot's view driver (for reporting the current
 * time), so both agree on what "now" is.
 * @param data The iterate chart data
 * @return The current time
 */
export function iteratesCurrentTime(data: IterateChartData): number {
    return Array.from(data.newPoints.values()).reduce(
        (maxTime, points) => {
            const seriesMaxTime = points.length > 0 ? points[points.length - 1].time : 0
            return seriesMaxTime > maxTime ? seriesMaxTime : maxTime
        },
        0
    )
}

export interface IteratesDataSourceOptions {
    /**
     * The initial series, owned (and mutated in place) by the source from here on
     */
    initialData: Array<IterateSeries>
    /**
     * Creates the observable of chart data each time the source starts
     */
    generator: DataGenerator<IterateChartData, IterateSeries>
    /**
     * Data older than this (ms), relative to the current time, is dropped as new data arrives.
     * Defaults to `Infinity` (never drop).
     */
    dropDataAfter?: number
    /**
     * Called with each series' new data as it arrives
     */
    onUpdateData?: (seriesName: string, data: Array<IterateDatum>) => void
}

/**
 * A data source for iterate charts (e.g. the Poincaré plot)
 */
export class IteratesDataSource extends BaseStreamingDataSource<IterateChartData, IterateDatum, IterateSeries> {
    private dropDataAfter: number
    private readonly onUpdateData: ((seriesName: string, data: Array<IterateDatum>) => void) | undefined
    // the number of points dropped from each series so far (see `droppedCountFor`)
    private readonly droppedCounts = new Map<string, number>()

    /**
     * Creates a iterates data source (stopped: call {@link start} to start it)
     * @param options The initial data, the generator, and the data-retention settings
     */
    constructor(options: IteratesDataSourceOptions) {
        super(options.initialData, options.generator)
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
    /**
     * The number of points dropped (as too old) from the front of the specified series so far --
     * so that a point's overall sequence number in its series is this plus its index in the
     * series' data, even as old points are dropped (e.g. for colorizing the lines by point, see
     * the `PoincarePlot`'s `lineColorSteps`)
     * @param seriesName The name of the series
     * @return The number of points dropped from the series (0 for an unknown series)
     */
    droppedCountFor(seriesName: string): number {
        return this.droppedCounts.get(seriesName) ?? 0
    }

    latestTime(): number {
        return this.seriesList().reduce(
            (tMax, series) => Math.max(tMax, series.last().map(datum => datum.time).getOrElse(tMax)),
            -Infinity
        )
    }

    /**
     * Adds each series' new points to it, and drops the points that are older than
     * `dropDataAfter` relative to the chunk's current time (see `iteratesCurrentTime`),
     * counting them (see {@link droppedCountFor}). New points for a series that isn't in the
     * source are ignored. Calls `onUpdateData` with each
     * series' new points.
     * @param data The chunk of chart data emitted by the generator
     */
    protected ingest(data: IterateChartData): void {
        const currentTime = iteratesCurrentTime(data)
        data.newPoints.forEach((newData, seriesName) => {
            // note: as in the original subscription code, data for a series that isn't already in
            // the source is accepted but not kept
            const series = this.seriesMap.get(seriesName) || emptySeries<IterateDatum>(seriesName)

            if (this.onUpdateData) this.onUpdateData(seriesName, newData)

            series.data.push(...newData)

            // drop data that is older than the max time-window -- guarded on series.data.length
            let dropped = 0
            while (series.data.length > 0 && currentTime - series.data[0].time > this.dropDataAfter) {
                series.data.shift()
                dropped++
            }
            if (dropped > 0) this.droppedCounts.set(seriesName, this.droppedCountFor(seriesName) + dropped)
        })
    }
}
