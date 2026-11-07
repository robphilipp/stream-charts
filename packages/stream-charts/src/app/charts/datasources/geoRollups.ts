import type {GeoDatum} from "../series/geoSeries"

/*
    Roll-ups: aggregates of sensor events, by place (see GeoDataSource's `rollups` option). Each
    roll-up puts every event into a cell -- by its (rounded) location, by its sensor, by a cell of a
    latitude-longitude grid, or by a function of the application's -- and keeps, for each cell, the
    count of its events, the values of its measures (e.g. the peak magnitude), and the same again for
    each group of its events (e.g. by sensor, or by a payload field). The aggregates are kept up to
    date incrementally: an event is added as it arrives, and taken back out when it's dropped.
 */

/**
 * The bounds (degrees) of a cell of a latitude-longitude grid
 */
export interface GeoCellBounds {
    west: number
    south: number
    east: number
    north: number
}

/**
 * How a roll-up puts events into cells (see {@link byLocation}, {@link bySensor}, and
 * {@link byGridCell})
 * @template P The type of the events' payload
 */
export interface GeoBinning<P> {
    /**
     * @param datum An event
     * @return The ID of the event's cell
     */
    readonly cellIdOf: (datum: GeoDatum<P>) => string
    /**
     * Where a cell is drawn: at its own, fixed position (`cell`, see `cellPositionOf`), at the
     * position of its latest event (`latest`), or at the mean position of its events (`mean`)
     */
    readonly position: 'cell' | 'latest' | 'mean'
    /**
     * @param datum An event
     * @return The `[latitude, longitude]` of the event's cell (for the `cell` position)
     */
    readonly cellPositionOf?: (datum: GeoDatum<P>) => [latitude: number, longitude: number]
    /**
     * @param datum An event
     * @return The bounds of the event's cell, when cells are areas (e.g. a grid's cells)
     */
    readonly cellBoundsOf?: (datum: GeoDatum<P>) => GeoCellBounds
}

/**
 * @param longitude A longitude (degrees)
 * @return The same longitude, from -180 (inclusive) to 180 (exclusive)
 */
const normalizedLongitude = (longitude: number): number => ((longitude + 180) % 360 + 360) % 360 - 180

/**
 * @param value A value
 * @return The value, without the floating-point noise of a multiplication (e.g. 0.30000000000000004)
 */
const tidy = (value: number): number => Number(value.toFixed(10))

/**
 * Puts events at the same place into the same cell, whichever sensor reported them: their latitude
 * and longitude are rounded to the precision, and the cell is drawn at the rounded position
 * @param precision The precision (degrees) of a place (e.g. 0.01, about a kilometer). Defaults to 0.01.
 * @return The binning
 * @template P The type of the events' payload
 */
export function byLocation<P>(precision: number = 0.01): GeoBinning<P> {
    const rounded = (degrees: number): number => Math.round(degrees / precision)
    return {
        cellIdOf: datum => `${rounded(datum.latitude)}:${rounded(normalizedLongitude(datum.longitude))}`,
        position: 'cell',
        cellPositionOf: datum => [
            tidy(rounded(datum.latitude) * precision),
            tidy(rounded(normalizedLongitude(datum.longitude)) * precision)
        ],
    }
}

/**
 * Puts each sensor's events into a cell of its own (by the events' `sensorId`), wherever the sensor
 * was -- e.g. for sensors that move
 * @param options Where a sensor's cell is drawn: at the sensor's latest position (`latest`, the
 * default), or at the mean position of its (retained) events (`mean`)
 * @return The binning
 * @template P The type of the events' payload
 */
export function bySensor<P>(options: {position?: 'latest' | 'mean'} = {}): GeoBinning<P> {
    return {cellIdOf: datum => datum.sensorId, position: options.position ?? 'latest'}
}

/**
 * Puts events into the cells of a latitude-longitude grid, starting from (-180°, -90°). The cells
 * are areas (drawn as such, see the `GeoPlot`'s `aggregateShape`), and wrap around at the
 * antimeridian; the top row ends at the north pole.
 * @param degrees The size (degrees) of a cell, in both latitude and longitude
 * @return The binning
 * @template P The type of the events' payload
 */
export function byGridCell<P>(degrees: number): GeoBinning<P> {
    const rows = Math.ceil(180 / degrees)
    const columns = Math.ceil(360 / degrees)
    const cellOf = (datum: GeoDatum<P>): [row: number, column: number] => [
        Math.max(0, Math.min(rows - 1, Math.floor((datum.latitude + 90) / degrees))),
        Math.floor((normalizedLongitude(datum.longitude) + 180) / degrees) % columns,
    ]
    const boundsOf = (datum: GeoDatum<P>): GeoCellBounds => {
        const [row, column] = cellOf(datum)
        const south = tidy(-90 + row * degrees)
        const west = tidy(-180 + column * degrees)
        return {west, south, east: Math.min(180, tidy(west + degrees)), north: Math.min(90, tidy(south + degrees))}
    }
    return {
        cellIdOf: datum => cellOf(datum).join(':'),
        position: 'cell',
        cellPositionOf: (datum): [number, number] => {
            const {west, south, east, north} = boundsOf(datum)
            return [(south + north) / 2, (west + east) / 2]
        },
        cellBoundsOf: boundsOf,
    }
}

/**
 * A measure of the events in a cell (see {@link countOf}, {@link sumOf}, {@link meanOf},
 * {@link minOf}, {@link maxOf}, {@link latestOf})
 * @template P The type of the events' payload
 */
export type GeoMeasure<P> =
    { readonly kind: 'count' } |
    { readonly kind: 'sum' | 'mean' | 'min' | 'max' | 'latest', readonly of: (datum: GeoDatum<P>) => number }

/**
 * @return The measure that counts the events
 * @template P The type of the events' payload
 */
export const countOf = <P>(): GeoMeasure<P> => ({kind: 'count'})
/**
 * @param of The value of an event (e.g. `datum => datum.payload.magnitude`)
 * @return The measure that sums the events' values
 * @template P The type of the events' payload
 */
export const sumOf = <P>(of: (datum: GeoDatum<P>) => number): GeoMeasure<P> => ({kind: 'sum', of})
/**
 * @param of The value of an event
 * @return The measure that averages the events' values (`NaN` for no events)
 * @template P The type of the events' payload
 */
export const meanOf = <P>(of: (datum: GeoDatum<P>) => number): GeoMeasure<P> => ({kind: 'mean', of})
/**
 * @param of The value of an event
 * @return The measure that gives the smallest of the events' values
 * @template P The type of the events' payload
 */
export const minOf = <P>(of: (datum: GeoDatum<P>) => number): GeoMeasure<P> => ({kind: 'min', of})
/**
 * @param of The value of an event
 * @return The measure that gives the largest of the events' values (e.g. the peak magnitude)
 * @template P The type of the events' payload
 */
export const maxOf = <P>(of: (datum: GeoDatum<P>) => number): GeoMeasure<P> => ({kind: 'max', of})
/**
 * @param of The value of an event
 * @return The measure that gives the latest event's value
 * @template P The type of the events' payload
 */
export const latestOf = <P>(of: (datum: GeoDatum<P>) => number): GeoMeasure<P> => ({kind: 'latest', of})

/**
 * A roll-up: how a {@link GeoDataSource} aggregates its events, by place
 * @template P The type of the events' payload
 */
export interface GeoRollup<P> {
    /**
     * How events are put into cells: {@link byLocation}, {@link bySensor}, {@link byGridCell}, or a
     * function giving an event's cell ID and the cell's position
     */
    cellOf: GeoBinning<P> | ((datum: GeoDatum<P>) => {id: string, latitude: number, longitude: number})
    /**
     * Which events are rolled up (e.g. only the alarms); all of them when not set
     * @param datum The event
     * @param seriesName The name of the event's series
     * @return `true` when the event is rolled up
     */
    filter?: (datum: GeoDatum<P>, seriesName: string) => boolean
    /**
     * The group of an event within its cell (e.g. its sensor, its series, or a payload field), for a
     * cell's breakdown by group (see {@link GeoAggregate.groups}); no breakdown when not set
     * @param datum The event
     * @param seriesName The name of the event's series
     * @return The event's group
     */
    groupBy?: (datum: GeoDatum<P>, seriesName: string) => string
    /**
     * The measures of each cell (and of each of its groups), by name: e.g.
     * `{peak: maxOf(datum => datum.payload.magnitude)}`. A cell's count is always there (see
     * {@link GeoAggregate.count}).
     */
    measures?: Record<string, GeoMeasure<P>>
}

/**
 * A group of a cell's events (see {@link GeoRollup.groupBy})
 */
export interface GeoAggregateGroup {
    /**
     * The group's name
     */
    readonly group: string
    /**
     * The number of the cell's events in the group
     */
    readonly count: number
    /**
     * The group's measures, by name (see {@link GeoRollup.measures})
     */
    readonly values: Readonly<Record<string, number>>
}

/**
 * The aggregate of a cell's events
 */
export interface GeoAggregate {
    /**
     * The cell's ID (e.g. the sensor ID, for {@link bySensor})
     */
    readonly id: string
    /**
     * The latitude (degrees) where the cell is drawn
     */
    readonly latitude: number
    /**
     * The longitude (degrees) where the cell is drawn
     */
    readonly longitude: number
    /**
     * The cell's bounds, when cells are areas (e.g. {@link byGridCell})
     */
    readonly bounds?: GeoCellBounds
    /**
     * The number of the cell's events
     */
    readonly count: number
    /**
     * The number of distinct sensors that reported the cell's events
     */
    readonly sensorCount: number
    /**
     * The cell's measures, by name (see {@link GeoRollup.measures})
     */
    readonly values: Readonly<Record<string, number>>
    /**
     * The cell's events by group, the largest group first (empty without a `groupBy`)
     */
    readonly groups: ReadonlyArray<GeoAggregateGroup>
    /**
     * The time of the cell's earliest event
     */
    readonly firstTime: number
    /**
     * The time of the cell's latest event
     */
    readonly lastTime: number
}

/**
 * The events of a cell (or of a group of a cell), and their measures, kept as events are added
 * and removed: sums (and so means) are running sums; a smallest or largest value is kept as events
 * are added, and re-found only when the event holding it is removed
 */
class Tally<P> {
    // the events, oldest first (from `head` on: removing the oldest just moves the head)
    private events: Array<GeoDatum<P>> = []
    private head = 0
    private readonly sums = new Map<string, number>()
    private readonly extremes = new Map<string, number | undefined>()
    private readonly measures: ReadonlyArray<[string, GeoMeasure<P>]>

    /**
     * @param measures The measures to keep, by name
     */
    constructor(measures: ReadonlyArray<[string, GeoMeasure<P>]>) {
        this.measures = measures
    }

    /**
     * @return The number of events
     */
    get count(): number {
        return this.events.length - this.head
    }

    /**
     * @return The oldest event
     */
    get first(): GeoDatum<P> | undefined {
        return this.events[this.head]
    }

    /**
     * @return The latest event
     */
    get last(): GeoDatum<P> | undefined {
        return this.count > 0 ? this.events[this.events.length - 1] : undefined
    }

    /**
     * Adds an event (the latest)
     * @param datum The event
     */
    add(datum: GeoDatum<P>): void {
        this.events.push(datum)
        this.measures.forEach(([name, measure]) => {
            if (measure.kind === 'count' || measure.kind === 'latest') return
            const value = measure.of(datum)
            if (measure.kind === 'sum' || measure.kind === 'mean') {
                this.sums.set(name, (this.sums.get(name) ?? 0) + value)
            } else if (this.extremes.has(name)) {
                // (a known extreme only moves when the new value is beyond it; an unknown one is
                // re-found when it's next read)
                const extreme = this.extremes.get(name)
                if (extreme !== undefined && (measure.kind === 'min' ? value < extreme : value > extreme)) {
                    this.extremes.set(name, value)
                }
            }
        })
    }

    /**
     * Removes an event (usually the oldest)
     * @param datum The event
     * @return `true` when the event was found (and removed)
     */
    remove(datum: GeoDatum<P>): boolean {
        if (this.events[this.head] === datum) {
            this.head++
        } else {
            const index = this.events.indexOf(datum, this.head)
            if (index < 0) return false
            this.events.splice(index, 1)
        }
        // compact the events once most of the array is behind the head
        if (this.head > 1024 && this.head * 2 > this.events.length) {
            this.events = this.events.slice(this.head)
            this.head = 0
        }
        this.measures.forEach(([name, measure]) => {
            if (measure.kind === 'count' || measure.kind === 'latest') return
            const value = measure.of(datum)
            if (measure.kind === 'sum' || measure.kind === 'mean') {
                this.sums.set(name, this.count > 0 ? (this.sums.get(name) ?? 0) - value : 0)
            } else if (this.extremes.get(name) === value) {
                // the extreme left: re-found when it's next read
                this.extremes.set(name, undefined)
            }
        })
        return true
    }

    /**
     * @return The measures' values, by name
     */
    values(): Record<string, number> {
        const values: Record<string, number> = {}
        this.measures.forEach(([name, measure]) => {
            switch (measure.kind) {
                case 'count':
                    values[name] = this.count
                    break
                case 'sum':
                    values[name] = this.sums.get(name) ?? 0
                    break
                case 'mean':
                    values[name] = this.count > 0 ? (this.sums.get(name) ?? 0) / this.count : NaN
                    break
                case 'latest':
                    values[name] = this.last !== undefined ? measure.of(this.last) : NaN
                    break
                default:
                    values[name] = this.extremeOf(name, measure)
            }
        })
        return values
    }

    /**
     * @param name The measure's name
     * @param measure The (min or max) measure
     * @return The smallest or largest value of the events (`NaN` for no events), re-found when unknown
     */
    private extremeOf(name: string, measure: GeoMeasure<P>): number {
        if (this.count === 0 || measure.kind === 'count') return NaN
        let extreme = this.extremes.get(name)
        if (extreme === undefined) {
            extreme = measure.kind === 'min' ? Infinity : -Infinity
            for (let i = this.head; i < this.events.length; i++) {
                const value = measure.of(this.events[i])
                extreme = measure.kind === 'min' ? Math.min(extreme, value) : Math.max(extreme, value)
            }
            this.extremes.set(name, extreme)
        }
        return extreme
    }
}

const RADIANS = Math.PI / 180

/**
 * A cell: its events (all of them, and by group), its sensors, and its position (for the `mean`
 * position, the running sum of its events' positions as unit vectors)
 */
class Cell<P> {
    readonly all: Tally<P>
    readonly groups = new Map<string, Tally<P>>()
    private readonly sensors = new Map<string, number>()
    private readonly sum: [x: number, y: number, z: number] = [0, 0, 0]
    readonly id: string
    readonly bounds: GeoCellBounds | undefined
    private readonly measures: ReadonlyArray<[string, GeoMeasure<P>]>
    private readonly position: [number, number] | undefined

    /**
     * @param id The cell's ID
     * @param measures The measures to keep, by name
     * @param position The cell's fixed `[latitude, longitude]`, when it has one
     * @param bounds The cell's bounds, when it's an area
     */
    constructor(
        id: string,
        measures: ReadonlyArray<[string, GeoMeasure<P>]>,
        position: [number, number] | undefined,
        bounds: GeoCellBounds | undefined,
    ) {
        this.id = id
        this.measures = measures
        this.position = position
        this.bounds = bounds
        this.all = new Tally<P>(measures)
    }

    /**
     * Adds an event to the cell (and to its group)
     * @param datum The event
     * @param group The event's group, when the roll-up has groups
     */
    add(datum: GeoDatum<P>, group: string | undefined): void {
        this.all.add(datum)
        if (group !== undefined) {
            let tally = this.groups.get(group)
            if (tally === undefined) {
                tally = new Tally<P>(this.measures)
                this.groups.set(group, tally)
            }
            tally.add(datum)
        }
        this.sensors.set(datum.sensorId, (this.sensors.get(datum.sensorId) ?? 0) + 1)
        this.addPosition(datum, 1)
    }

    /**
     * Removes an event from the cell (and from its group)
     * @param datum The event
     * @param group The event's group, when the roll-up has groups
     */
    remove(datum: GeoDatum<P>, group: string | undefined): void {
        if (!this.all.remove(datum)) return
        if (group !== undefined) {
            const tally = this.groups.get(group)
            tally?.remove(datum)
            if (tally !== undefined && tally.count === 0) this.groups.delete(group)
        }
        const sensorCount = (this.sensors.get(datum.sensorId) ?? 1) - 1
        if (sensorCount > 0) this.sensors.set(datum.sensorId, sensorCount)
        else this.sensors.delete(datum.sensorId)
        this.addPosition(datum, -1)
    }

    /**
     * Adds (or takes away) an event's position, as a unit vector, to the running sum
     * @param datum The event
     * @param sign 1 to add, -1 to take away
     */
    private addPosition(datum: GeoDatum<P>, sign: 1 | -1): void {
        const latitude = datum.latitude * RADIANS
        const longitude = datum.longitude * RADIANS
        this.sum[0] += sign * Math.cos(latitude) * Math.cos(longitude)
        this.sum[1] += sign * Math.cos(latitude) * Math.sin(longitude)
        this.sum[2] += sign * Math.sin(latitude)
    }

    /**
     * @param where Where the cell is drawn (see {@link GeoBinning.position})
     * @return The cell's aggregate
     */
    aggregate(where: GeoBinning<P>['position']): GeoAggregate {
        const [latitude, longitude] = this.positionFor(where)
        return {
            id: this.id,
            latitude,
            longitude,
            bounds: this.bounds,
            count: this.all.count,
            sensorCount: this.sensors.size,
            values: this.all.values(),
            groups: Array.from(this.groups.entries())
                .map(([group, tally]) => ({group, count: tally.count, values: tally.values()}))
                .sort((a, b) => b.count - a.count || a.group.localeCompare(b.group)),
            firstTime: this.all.first?.time ?? NaN,
            lastTime: this.all.last?.time ?? NaN,
        }
    }

    /**
     * @param where Where the cell is drawn
     * @return The cell's `[latitude, longitude]`
     */
    private positionFor(where: GeoBinning<P>['position']): [number, number] {
        if (where === 'cell' && this.position !== undefined) return this.position
        if (where === 'mean') {
            const [x, y, z] = this.sum
            return [Math.atan2(z, Math.hypot(x, y)) / RADIANS, Math.atan2(y, x) / RADIANS]
        }
        const last = this.all.last
        return last !== undefined ? [last.latitude, last.longitude] : [NaN, NaN]
    }
}

/**
 * @param cellOf A roll-up's `cellOf`: a binning, or a function of an event
 * @return The binning
 * @template P The type of the events' payload
 */
function binningFrom<P>(cellOf: GeoRollup<P>['cellOf']): GeoBinning<P> {
    if (typeof cellOf !== 'function') return cellOf
    return {
        cellIdOf: datum => cellOf(datum).id,
        position: 'cell',
        cellPositionOf: (datum): [number, number] => {
            const {latitude, longitude} = cellOf(datum)
            return [latitude, longitude]
        },
    }
}

/**
 * A roll-up's cells, kept up to date as events are added and removed
 * @template P The type of the events' payload
 */
export class GeoRollupState<P> {
    private readonly binning: GeoBinning<P>
    private readonly measures: ReadonlyArray<[string, GeoMeasure<P>]>
    private readonly cells = new Map<string, Cell<P>>()
    // the aggregates, as last read, until the cells change
    private cached: Array<GeoAggregate> | undefined = undefined
    private readonly rollup: GeoRollup<P>

    /**
     * @param rollup The roll-up
     */
    constructor(rollup: GeoRollup<P>) {
        this.rollup = rollup
        this.binning = binningFrom(rollup.cellOf)
        this.measures = Object.entries(rollup.measures ?? {})
    }

    /**
     * Adds an event (when the roll-up's filter takes it)
     * @param datum The event
     * @param seriesName The name of the event's series
     */
    add(datum: GeoDatum<P>, seriesName: string): void {
        if (this.rollup.filter !== undefined && !this.rollup.filter(datum, seriesName)) return
        const id = this.binning.cellIdOf(datum)
        let cell = this.cells.get(id)
        if (cell === undefined) {
            cell = new Cell<P>(id, this.measures, this.binning.cellPositionOf?.(datum), this.binning.cellBoundsOf?.(datum))
            this.cells.set(id, cell)
        }
        cell.add(datum, this.rollup.groupBy?.(datum, seriesName))
        this.cached = undefined
    }

    /**
     * Removes an event (e.g. one that's been dropped as too old)
     * @param datum The event
     * @param seriesName The name of the event's series
     */
    remove(datum: GeoDatum<P>, seriesName: string): void {
        if (this.rollup.filter !== undefined && !this.rollup.filter(datum, seriesName)) return
        const id = this.binning.cellIdOf(datum)
        const cell = this.cells.get(id)
        if (cell === undefined) return
        cell.remove(datum, this.rollup.groupBy?.(datum, seriesName))
        if (cell.all.count === 0) this.cells.delete(id)
        this.cached = undefined
    }

    /**
     * @return The aggregates of the cells (the same array until the cells change)
     */
    aggregates(): Array<GeoAggregate> {
        if (this.cached === undefined) {
            this.cached = Array.from(this.cells.values()).map(cell => cell.aggregate(this.binning.position))
        }
        return this.cached
    }
}
