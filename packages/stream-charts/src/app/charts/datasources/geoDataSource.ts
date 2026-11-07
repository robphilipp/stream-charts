import {BaseStreamingDataSource, type DataGenerator} from "./StreamingDataSource";
import {type GeoChartData, geoChartDataLatestTime} from "../observables/geo";
import {type GeoDatum, type GeoSeries, geoSeriesFrom} from "../series/geoSeries";

/**
 * The options for a {@link GeoDataSource}
 * @template P The type of the events' payload
 */
export interface GeoDataSourceOptions<P> {
    /**
     * The initial series, owned (and mutated in place) by the source from here on
     */
    initialData: Array<GeoSeries<P>>
    /**
     * Creates the observable of chart data each time the source starts
     */
    generator: DataGenerator<GeoChartData<P>, GeoSeries<P>>
    /**
     * Events older than this (ms), relative to the latest event, are dropped as new events arrive.
     * Defaults to `Infinity` (never drop).
     */
    dropDataAfter?: number
    /**
     * Called with each series' new events as they arrive
     */
    onUpdateData?: (seriesName: string, data: Array<GeoDatum<P>>) => void
}

/**
 * A data source for geo charts (the {@link GeoPlot}): it holds a series of sensor events for each
 * group of sensors, and drops events once they're older than `dropDataAfter`
 * @template P The type of the events' payload
 */
export class GeoDataSource<P> extends BaseStreamingDataSource<GeoChartData<P>, GeoDatum<P>, GeoSeries<P>> {
    private dropDataAfter: number
    private readonly onUpdateData: ((seriesName: string, data: Array<GeoDatum<P>>) => void) | undefined

    /**
     * Creates a geo data source (stopped: call {@link start} to start it)
     * @param options The initial data, the generator, and the data-retention settings
     */
    constructor(options: GeoDataSourceOptions<P>) {
        super(options.initialData, options.generator)
        this.dropDataAfter = options.dropDataAfter ?? Infinity
        this.onUpdateData = options.onUpdateData
    }

    /**
     * Changes how long events are kept; takes effect as the next events arrive
     * @param dropDataAfter Events older than this (ms) are dropped
     */
    setDropDataAfter(dropDataAfter: number): void {
        this.dropDataAfter = dropDataAfter
    }

    /**
     * @return The time of the latest event over all the series, or `-Infinity` when there are none
     */
    latestTime(): number {
        return this.seriesList().reduce(
            (tMax, series) => Math.max(tMax, series.last().map(datum => datum.time).getOrElse(tMax)),
            -Infinity
        )
    }

    /**
     * Adds each series' new events to it (registering a series the first time it shows up), then
     * drops, from *every* series, the events older than `dropDataAfter` relative to the latest
     * event so far -- so a group of sensors that has gone quiet still ages out. Calls
     * `onUpdateData` with each series' new events.
     * @param data The chunk of chart data emitted by the generator
     */
    protected ingest(data: GeoChartData<P>): void {
        data.newPoints.forEach((newData, name) => {
            const series = this.seriesMap.get(name) ?? geoSeriesFrom<P>(name)
            if (!this.seriesMap.has(name)) this.seriesMap.set(name, series)

            if (this.onUpdateData) this.onUpdateData(name, newData)

            series.data.push(...newData)
        })

        const currentTime = Math.max(this.latestTime(), geoChartDataLatestTime(data))
        if (!Number.isFinite(currentTime) || !Number.isFinite(this.dropDataAfter)) return
        this.seriesMap.forEach(series => {
            while (series.data.length > 0 && currentTime - series.data[0].time > this.dropDataAfter) {
                series.data.shift()
            }
        })
    }
}
