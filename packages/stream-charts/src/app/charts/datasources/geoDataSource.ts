import {BaseStreamingDataSource, type DataGenerator} from "./StreamingDataSource";
import {type GeoChartData, geoChartDataLatestTime} from "../observables/geo";
import {type GeoDatum, type GeoSeries, geoSeriesFrom} from "../series/geoSeries";
import {type GeoAggregate, type GeoRollup, GeoRollupState} from "./geoRollups";

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
    /**
     * The roll-ups to keep, by name: aggregates of the (retained) events, by place -- e.g.
     * `{"by sensor": {cellOf: bySensor(), measures: {peak: maxOf(datum => datum.payload.magnitude)}}}`
     * (see {@link GeoRollup}). Kept up to date as events arrive and are dropped, and read with
     * {@link GeoDataSource.aggregates}. None by default.
     */
    rollups?: Record<string, GeoRollup<P>>
}

/**
 * A data source for geo charts (the {@link GeoPlot}): it holds a series of sensor events for each
 * group of sensors, drops events once they're older than `dropDataAfter`, and keeps its roll-ups
 * (aggregates of the events, by place) up to date as events arrive and are dropped
 * @template P The type of the events' payload
 */
export class GeoDataSource<P> extends BaseStreamingDataSource<GeoChartData<P>, GeoDatum<P>, GeoSeries<P>> {
    private dropDataAfter: number
    private readonly onUpdateData: ((seriesName: string, data: Array<GeoDatum<P>>) => void) | undefined
    private rollupStates = new Map<string, GeoRollupState<P>>()

    /**
     * Creates a geo data source (stopped: call {@link start} to start it)
     * @param options The initial data, the generator, the data-retention settings, and the roll-ups
     */
    constructor(options: GeoDataSourceOptions<P>) {
        super(options.initialData, options.generator)
        this.dropDataAfter = options.dropDataAfter ?? Infinity
        this.onUpdateData = options.onUpdateData
        this.setRollups(options.rollups ?? {})
    }

    /**
     * Replaces the roll-ups, rolling up the events held now (from then on, they're kept up to date
     * as events arrive and are dropped)
     * @param rollups The roll-ups, by name
     */
    setRollups(rollups: Record<string, GeoRollup<P>>): void {
        this.rollupStates = new Map(Object.entries(rollups).map(([name, rollup]) => {
            const state = new GeoRollupState<P>(rollup)
            this.seriesMap.forEach(series => series.data.forEach(datum => state.add(datum, series.name)))
            return [name, state]
        }))
    }

    /**
     * @return The names of the roll-ups
     */
    rollupNames(): Array<string> {
        return Array.from(this.rollupStates.keys())
    }

    /**
     * @param rollupName The name of a roll-up
     * @return The roll-up's aggregates, one per cell (empty for an unknown roll-up). The same
     * array is returned until the roll-up's cells change.
     */
    aggregates(rollupName: string): Array<GeoAggregate> {
        return this.rollupStates.get(rollupName)?.aggregates() ?? []
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
            this.rollupStates.forEach(state => newData.forEach(datum => state.add(datum, name)))
        })

        const currentTime = Math.max(this.latestTime(), geoChartDataLatestTime(data))
        if (!Number.isFinite(currentTime) || !Number.isFinite(this.dropDataAfter)) return
        this.seriesMap.forEach(series => {
            while (series.data.length > 0 && currentTime - series.data[0].time > this.dropDataAfter) {
                const dropped = series.data.shift()
                if (dropped !== undefined) this.rollupStates.forEach(state => state.remove(dropped, series.name))
            }
        })
    }
}
