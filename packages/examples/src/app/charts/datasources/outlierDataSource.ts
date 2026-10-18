import type {OutlierChartData} from "../observables/outliers";
import type {OutlierDatum, OutlierSeries} from "../series/outlierSeries";
import {emptySeries} from "../series/baseSeries";
import {BaseStreamingDataSource, type DataGenerator} from "./StreamingDataSource";

export interface OutlierDataSourceOptions<M extends readonly number[]> {
    /**
     * The initial series, owned (and mutated in place) by the source from here on
     */
    initialData: Array<OutlierSeries<M>>
    /**
     * Creates the observable of chart data each time the source starts
     */
    generator: DataGenerator<OutlierChartData<M>, OutlierSeries<M>>
    /**
     * Data older than this (ms), relative to the newest datum in the same chunk of new data, is
     * dropped as new data arrives. Defaults to `Infinity` (never drop).
     */
    dropDataAfter?: number
    /**
     * Called with each series' new data as it arrives
     */
    onUpdateData?: (seriesName: string, data: Array<OutlierDatum<M>>) => void
}

/**
 * A data source for outlier charts. Unlike time-series charts, series that aren't in the initial
 * data are added as they first appear in the stream.
 */
export class OutlierDataSource<M extends readonly number[]>
    extends BaseStreamingDataSource<OutlierChartData<M>, OutlierDatum<M>, OutlierSeries<M>> {

    private dropDataAfter: number
    private readonly onUpdateData: ((seriesName: string, data: Array<OutlierDatum<M>>) => void) | undefined

    /**
     * Creates a outlier data source (stopped: call {@link start} to start it)
     * @param options The initial data, the generator, and the data-retention settings
     */
    constructor(options: OutlierDataSourceOptions<M>) {
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
     * @return The latest time (the `datum.x` of the last datum) over all the series, or
     * `-Infinity` when there is no data
     */
    latestTime(): number {
        return this.seriesList().reduce(
            (tMax, series) => Math.max(tMax, series.last().map(datum => datum.datum.x).getOrElse(tMax)),
            -Infinity
        )
    }

    /**
     * Adds each series' new points to it (adding the series itself the first time it appears),
     * and drops the points that are older than `dropDataAfter` relative to the newest of the
     * series' new points. Calls `onUpdateData` with each series' new points.
     * @param data The chunk of chart data emitted by the generator
     */
    protected ingest(data: OutlierChartData<M>): void {
        data.newPoints.forEach((newData, name) => {
            // register a series the first time it shows up in the stream
            const series = this.seriesMap.get(name) || emptySeries<OutlierDatum<M>>(name) as OutlierSeries<M>
            if (!this.seriesMap.has(name)) this.seriesMap.set(name, series)

            if (this.onUpdateData) this.onUpdateData(name, newData)

            series.data.push(...newData)

            // drop data older than the max time-window, relative to this chunk's newest datum
            const currentTime = Math.max(...newData.map(datum => datum.datum.x), -Infinity)
            if (Number.isFinite(currentTime)) {
                while (series.data.length > 0 && currentTime - series.data[0].datum.x > this.dropDataAfter) {
                    series.data.shift()
                }
            }
        })
    }
}
