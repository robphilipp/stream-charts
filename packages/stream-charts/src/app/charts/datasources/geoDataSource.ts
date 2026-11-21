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

// the most filtered copies of a roll-up kept (see `stateOf`), and how many batches of events a copy
// is kept up to date for without being asked for
const MAX_FILTERED_COPIES = 4
const STALE_FILTERED_COPY_BATCHES = 100

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
    // the roll-ups of only some of the series (see `aggregates`): by roll-up, and by the filter each
    // is for (its source and flags), the most recently asked for last, each with the batch of events
    // it was last asked for in -- kept up to date like the roll-ups themselves, while they're asked for
    private readonly filteredStates = new Map<string, Map<string, {state: GeoRollupState<P>, askedAt: number}>>()
    // the number of batches of events taken in so far (for how long ago a filtered copy was asked for)
    private batches = 0
    // each sensor's events, by series and sensor (see `sensorKeyOf`), oldest first: e.g. for a
    // tooltip's sparkline of a sensor's readings, without searching its series. (Its events are those
    // from `head` on: dropping the oldest, as the data source does, just moves the head.)
    private readonly sensorEvents = new Map<string, {events: Array<GeoDatum<P>>, head: number}>()

    /**
     * Creates a geo data source (stopped: call {@link start} to start it)
     * @param options The initial data, the generator, the data-retention settings, and the roll-ups
     */
    constructor(options: GeoDataSourceOptions<P>) {
        super(options.initialData, options.generator)
        this.dropDataAfter = options.dropDataAfter ?? Infinity
        this.onUpdateData = options.onUpdateData
        this.seriesMap.forEach(series => series.data.forEach(datum => this.addSensorEvent(series.name, datum)))
        this.setRollups(options.rollups ?? {})
    }

    /**
     * @param seriesName The name of a series
     * @param sensorId The ID of one of its sensors
     * @return The key of the sensor's events (see `sensorEvents`)
     */
    private static sensorKeyOf(seriesName: string, sensorId: string): string {
        return `${seriesName}\u0000${sensorId}`
    }

    /**
     * Adds an event to its sensor's events (the latest)
     * @param seriesName The name of the event's series
     * @param datum The event
     */
    private addSensorEvent(seriesName: string, datum: GeoDatum<P>): void {
        const key = GeoDataSource.sensorKeyOf(seriesName, datum.sensorId)
        const kept = this.sensorEvents.get(key)
        if (kept === undefined) this.sensorEvents.set(key, {events: [datum], head: 0})
        else kept.events.push(datum)
    }

    /**
     * Takes a dropped event out of its sensor's events (usually the oldest)
     * @param seriesName The name of the event's series
     * @param datum The event
     */
    private removeSensorEvent(seriesName: string, datum: GeoDatum<P>): void {
        const key = GeoDataSource.sensorKeyOf(seriesName, datum.sensorId)
        const kept = this.sensorEvents.get(key)
        if (kept === undefined) return
        if (kept.events[kept.head] === datum) {
            kept.head++
        } else {
            const index = kept.events.indexOf(datum, kept.head)
            if (index >= 0) kept.events.splice(index, 1)
        }
        if (kept.head >= kept.events.length) {
            this.sensorEvents.delete(key)
        } else if (kept.head > 1024 && kept.head * 2 > kept.events.length) {
            // (compacted once most of the array is behind the head)
            kept.events = kept.events.slice(kept.head)
            kept.head = 0
        }
    }

    /**
     * The events of one of a series' sensors -- e.g. for a sparkline of the sensor's readings in a
     * tooltip -- kept as events arrive and are dropped, so that they're found without searching the
     * series
     * @param seriesName The name of the series
     * @param sensorId The sensor's ID
     * @return The sensor's events in the series, oldest first (a copy; empty for an unknown series or
     * sensor)
     */
    sensorEventsOf(seriesName: string, sensorId: string): Array<GeoDatum<P>> {
        const kept = this.sensorEvents.get(GeoDataSource.sensorKeyOf(seriesName, sensorId))
        return kept !== undefined ? kept.events.slice(kept.head) : []
    }

    /**
     * @param seriesName The name of a series
     * @param sensorId The ID of one of its sensors
     * @return The sensor's latest event in the series (`undefined` for an unknown series or sensor)
     */
    latestSensorEventOf(seriesName: string, sensorId: string): GeoDatum<P> | undefined {
        // (a sensor without events is forgotten, so a kept one's last event is its latest)
        const kept = this.sensorEvents.get(GeoDataSource.sensorKeyOf(seriesName, sensorId))
        return kept?.events[kept.events.length - 1]
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
     * up to date, so that callers with different filters -- e.g. two plots of one data source -- each
     * keep theirs: up to MAX_FILTERED_COPIES for each roll-up, the least recently asked for dropped
     * first, and any not asked for in STALE_FILTERED_COPY_BATCHES batches of events, so that a copy
     * no longer asked for isn't kept up to date for long); `undefined` for an unknown roll-up
     */
    private stateOf(rollupName: string, seriesFilter: RegExp | undefined): GeoRollupState<P> | undefined {
        const all = this.rollupStates.get(rollupName)
        const rollup = this.rollups[rollupName]
        if (all === undefined || rollup === undefined) return all
        if (seriesFilter === undefined || this.seriesList().every(series => series.name.match(seriesFilter))) return all
        const filter = `${seriesFilter.source}/${seriesFilter.flags}`
        let copies = this.filteredStates.get(rollupName)
        if (copies === undefined) {
            copies = new Map()
            this.filteredStates.set(rollupName, copies)
        }
        const kept = copies.get(filter)
        // (the most recently asked for last)
        copies.delete(filter)
        const state = kept?.state ?? this.rolledUp({
            ...rollup,
            filter: (datum, seriesName) =>
                seriesName.match(seriesFilter) !== null && (rollup.filter?.(datum, seriesName) ?? true),
        })
        copies.set(filter, {state, askedAt: this.batches})
        // (the least recently asked for go, past the most kept)
        while (copies.size > MAX_FILTERED_COPIES) {
            const oldest = copies.keys().next().value
            if (oldest === undefined) break
            copies.delete(oldest)
        }
        return state
    }

    /**
     * @return The states kept up to date as events arrive and are dropped: the roll-ups', and their
     * filtered copies'
     */
    private allStates(): Array<GeoRollupState<P>> {
        return [
            ...this.rollupStates.values(),
            ...Array.from(this.filteredStates.values()).flatMap(copies => Array.from(copies.values(), ({state}) => state)),
        ]
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
     * filter, or none, is asked for (one is kept for each roll-up) -- so asking again with the same
     * filter is as quick as asking for all the series.
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
        // (the filtered copies no longer asked for are dropped, rather than kept up to date)
        this.batches += 1
        this.filteredStates.forEach(copies => copies.forEach(({askedAt}, filter) => {
            if (this.batches - askedAt > STALE_FILTERED_COPY_BATCHES) copies.delete(filter)
        }))
        data.newPoints.forEach((newData, name) => {
            const series = this.seriesMap.get(name) ?? geoSeriesFrom<P>(name)
            if (!this.seriesMap.has(name)) this.seriesMap.set(name, series)

            if (this.onUpdateData) this.onUpdateData(name, newData)

            series.data.push(...newData)
            newData.forEach(datum => this.addSensorEvent(name, datum))
            this.allStates().forEach(state => newData.forEach(datum => state.add(datum, name)))
        })

        const currentTime = Math.max(this.latestTime(), geoChartDataLatestTime(data))
        if (!Number.isFinite(currentTime) || !Number.isFinite(this.dropDataAfter)) return
        const states = this.allStates()
        this.seriesMap.forEach(series => {
            while (series.data.length > 0 && currentTime - series.data[0].time > this.dropDataAfter) {
                const dropped = series.data.shift()
                if (dropped === undefined) continue
                this.removeSensorEvent(series.name, dropped)
                states.forEach(state => state.remove(dropped))
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
    return ['aggregates', 'eventsOf', 'rollupNames', 'rollupCellSize', 'sensorEventsOf', 'latestSensorEventOf']
        .every(name => typeof methods[name] === 'function')
}
