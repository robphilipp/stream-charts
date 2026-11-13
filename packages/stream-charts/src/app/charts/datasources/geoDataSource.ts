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
    private rollups: Record<string, GeoRollup<P>> = {}
    private rollupStates = new Map<string, GeoRollupState<P>>()
    // each roll-up of only some of the series (see `aggregates`): the latest asked for, by roll-up,
    // with the filter it's for (its source and flags), kept up to date like the roll-ups themselves
    private filteredStates = new Map<string, {filter: string, state: GeoRollupState<P>}>()

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
        this.rollups = rollups
        this.rollupStates = new Map(Object.entries(rollups).map(([name, rollup]) => [name, this.rolledUp(rollup)]))
        this.filteredStates.clear()
    }

    /**
     * @param rollup A roll-up
     * @return Its state, rolling up the events held now
     */
    private rolledUp(rollup: GeoRollup<P>): GeoRollupState<P> {
        const state = new GeoRollupState<P>(rollup)
        this.seriesMap.forEach(series => series.data.forEach(datum => state.add(datum, series.name)))
        return state
    }

    /**
     * @param rollupName The name of a roll-up
     * @param seriesFilter The series whose events count (all of them when not given)
     * @return The roll-up's state: of all the series' events, when the filter takes every series; and
     * otherwise of the events of the series it takes (rolled up when first asked for, and then kept
     * up to date, until another filter is asked for); `undefined` for an unknown roll-up
     */
    private stateOf(rollupName: string, seriesFilter: RegExp | undefined): GeoRollupState<P> | undefined {
        const all = this.rollupStates.get(rollupName)
        const rollup = this.rollups[rollupName]
        if (all === undefined || rollup === undefined || seriesFilter === undefined) return all
        if (this.seriesList().every(series => series.name.match(seriesFilter))) return all
        const filter = `${seriesFilter.source}/${seriesFilter.flags}`
        const kept = this.filteredStates.get(rollupName)
        if (kept !== undefined && kept.filter === filter) return kept.state
        const state = this.rolledUp({
            ...rollup,
            filter: (datum, seriesName) =>
                seriesName.match(seriesFilter) !== null && (rollup.filter?.(datum, seriesName) ?? true),
        })
        this.filteredStates.set(rollupName, {filter, state})
        return state
    }

    /**
     * @return The states kept up to date as events arrive and are dropped: the roll-ups', and their
     * filtered copies'
     */
    private allStates(): Array<GeoRollupState<P>> {
        return [...this.rollupStates.values(), ...Array.from(this.filteredStates.values(), ({state}) => state)]
    }

    /**
     * The events of one of a roll-up's cells (or of one of the cell's groups) -- e.g. for a sparkline
     * of a sensor's readings in a tooltip
     * @param rollupName The name of the roll-up
     * @param cellId The cell's ID (see {@link GeoAggregate.id})
     * @param group One of the cell's groups (see {@link GeoAggregate.groups}); all its events when
     * not given
     * @param seriesFilter The series whose events count (see {@link aggregates}); all of them when
     * not given
     * @return The events, oldest first (a copy; empty for an unknown roll-up, cell, or group)
     */
    eventsOf(rollupName: string, cellId: string, group?: string, seriesFilter?: RegExp): Array<GeoDatum<P>> {
        return this.stateOf(rollupName, seriesFilter)?.eventsOf(cellId, group) ?? []
    }

    /**
     * @param rollupName The name of a roll-up
     * @return The size (degrees) of the roll-up's cells, when its binning says (e.g. `byGridCell`'s,
     * and `byLocation`'s); `undefined` for an unknown roll-up, or one whose cells vary
     */
    rollupCellSize(rollupName: string): number | undefined {
        return this.rollupStates.get(rollupName)?.cellSize
    }

    /**
     * @return The names of the roll-ups
     */
    rollupNames(): Array<string> {
        return Array.from(this.rollupStates.keys())
    }

    /**
     * @param rollupName The name of a roll-up
     * @param seriesFilter The series whose events count (e.g. the chart's series filter); all of them
     * when not given. The roll-up of only some of the series is rolled up from the events held when
     * it's first asked for, and then kept up to date as events arrive and are dropped, until another
     * filter is asked for (one is kept for each roll-up) -- so asking again with the same filter is
     * as quick as asking for all the series.
     * @return The roll-up's aggregates, one per cell (empty for an unknown roll-up). The same
     * array is returned until the roll-up's cells change.
     */
    aggregates(rollupName: string, seriesFilter?: RegExp): Array<GeoAggregate> {
        return this.stateOf(rollupName, seriesFilter)?.aggregates() ?? []
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
            this.allStates().forEach(state => newData.forEach(datum => state.add(datum, name)))
        })

        const currentTime = Math.max(this.latestTime(), geoChartDataLatestTime(data))
        if (!Number.isFinite(currentTime) || !Number.isFinite(this.dropDataAfter)) return
        const states = this.allStates()
        this.seriesMap.forEach(series => {
            while (series.data.length > 0 && currentTime - series.data[0].time > this.dropDataAfter) {
                const dropped = series.data.shift()
                if (dropped !== undefined) states.forEach(state => state.remove(dropped))
            }
        })
    }
}

/**
 * @param dataSource A data source
 * @return Whether it's a {@link GeoDataSource}: an instance of the class, or, should the application
 * hold more than one copy of this library (whose classes differ), an object with its roll-ups'
 * methods
 * @template P The type of the events' payload
 */
export function isGeoDataSource<P>(dataSource: unknown): dataSource is GeoDataSource<P> {
    if (dataSource instanceof GeoDataSource) return true
    if (dataSource === null || typeof dataSource !== 'object') return false
    const methods = dataSource as Record<string, unknown>
    return ['aggregates', 'eventsOf', 'rollupNames', 'rollupCellSize'].every(name => typeof methods[name] === 'function')
}
