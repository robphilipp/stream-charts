import * as d3 from "d3"
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
    /**
     * The size (degrees, of latitude) of the cells, when they're all about the same size (e.g. a
     * grid's, or rounded places'): so that a plot can pick, by how large the cells are on the screen,
     * which of several roll-ups to show (see the `GeoPlot`'s `auto` mode)
     */
    readonly cellSize?: number
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
        cellSize: precision,
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
        cellSize: degrees,
    }
}

/**
 * An aggregation of your own that can take an event back out (see {@link reduceOf}): a state, kept
 * as events are added to and removed from a cell (or a group), and the measure's value from it.
 * The functions should leave the state they're handed as it is, and return the new state (or
 * change it in place and return it, as long as `initial` hands out a new state each time).
 * @template P The type of the events' payload
 * @template S The type of the state
 */
export interface GeoReducer<P, S> {
    /**
     * @return The state of a cell (or group) without any events
     */
    initial: () => S
    /**
     * @param state The state
     * @param datum The event that arrived
     * @return The state with the event in it
     */
    add: (state: S, datum: GeoDatum<P>) => S
    /**
     * @param state The state
     * @param datum The event that left (e.g. dropped as too old)
     * @return The state without the event
     */
    remove: (state: S, datum: GeoDatum<P>) => S
    /**
     * @param state The state
     * @return The measure's value
     */
    value: (state: S) => number
}

/**
 * A measure of the events in a cell (see {@link countOf}, {@link sumOf}, {@link meanOf},
 * {@link minOf}, {@link maxOf}, {@link latestOf}, and, for measures of your own, {@link reduceOf}
 * and {@link measureOf})
 * @template P The type of the events' payload
 */
export type GeoMeasure<P> = (
    { readonly kind: 'count' } |
    { readonly kind: 'sum' | 'mean' | 'min' | 'max' | 'latest', readonly of: (datum: GeoDatum<P>) => number } |
    { readonly kind: 'reduce', readonly reducer: GeoReducer<P, unknown> } |
    { readonly kind: 'events', readonly of: (events: ReadonlyArray<GeoDatum<P>>) => number }
) & { readonly options?: GeoMeasureOptions }

/**
 * How a measure's values are shown (in the tooltip, and in the plot's keys): its units, and how its
 * numbers are formatted. Every measure takes them, as its last argument: e.g.
 * `meanOf(datum => datum.payload.delay, {units: 'ms'})`. The library shows what you measure, in the
 * units you give it; it's up to you to measure quantities that share them.
 */
export interface GeoMeasureOptions {
    /**
     * The units of the measure's values (e.g. `'ms'`, `'µg/m³'`, or `'%'`), shown after them -- with a
     * space, except for units that start with `%` or `°`
     */
    readonly units?: string
    /**
     * How the numbers are formatted: a d3-format specifier (e.g. `',.1f'`), or a function. Defaults to
     * up to three decimals (`',.3~f'`).
     */
    readonly format?: string | ((value: number) => string)
}

const DEFAULT_FORMAT = d3.format(',.3~f')

/**
 * Formats a measure's value, with its units
 * @param value The value
 * @param options The measure's units and format
 * @param withUnits Whether to show the units (e.g. not in a key whose label already says them).
 * Defaults to `true`.
 * @return The formatted value (e.g. `12.3 ms`), or `---` when the value isn't a number
 */
export function formatMeasure(value: number, options?: GeoMeasureOptions, withUnits: boolean = true): string {
    if (!Number.isFinite(value)) return '---'
    const {units, format} = options ?? {}
    const number = format === undefined ? DEFAULT_FORMAT(value) :
        typeof format === 'string' ? d3.format(format)(value) :
            format(value)
    if (!withUnits || units === undefined || units === '') return number
    return /^[%°]/.test(units) ? `${number}${units}` : `${number} ${units}`
}

/**
 * @param options The measure's units and format (see {@link GeoMeasureOptions})
 * @return The measure that counts the events
 * @template P The type of the events' payload
 */
export const countOf = <P>(options?: GeoMeasureOptions): GeoMeasure<P> => ({kind: 'count', options})
/**
 * @param of The value of an event (e.g. `datum => datum.payload.magnitude`)
 * @param options The measure's units and format (see {@link GeoMeasureOptions})
 * @return The measure that sums the events' values (leaving out values that aren't finite numbers,
 * e.g. a missing reading's `NaN`)
 * @template P The type of the events' payload
 */
export const sumOf = <P>(of: (datum: GeoDatum<P>) => number, options?: GeoMeasureOptions): GeoMeasure<P> =>
    ({kind: 'sum', of, options})
/**
 * @param of The value of an event
 * @param options The measure's units and format (see {@link GeoMeasureOptions})
 * @return The measure that averages the events' values (`NaN` for no events), leaving out values that
 * aren't finite numbers (e.g. a missing reading's `NaN`)
 * @template P The type of the events' payload
 */
export const meanOf = <P>(of: (datum: GeoDatum<P>) => number, options?: GeoMeasureOptions): GeoMeasure<P> =>
    ({kind: 'mean', of, options})
/**
 * @param of The value of an event
 * @param options The measure's units and format (see {@link GeoMeasureOptions})
 * @return The measure that gives the smallest of the events' values (leaving out values that aren't
 * finite numbers, e.g. a missing reading's `NaN`)
 * @template P The type of the events' payload
 */
export const minOf = <P>(of: (datum: GeoDatum<P>) => number, options?: GeoMeasureOptions): GeoMeasure<P> =>
    ({kind: 'min', of, options})
/**
 * @param of The value of an event
 * @param options The measure's units and format (see {@link GeoMeasureOptions})
 * @return The measure that gives the largest of the events' values (e.g. the peak magnitude), leaving
 * out values that aren't finite numbers (e.g. a missing reading's `NaN`)
 * @template P The type of the events' payload
 */
export const maxOf = <P>(of: (datum: GeoDatum<P>) => number, options?: GeoMeasureOptions): GeoMeasure<P> =>
    ({kind: 'max', of, options})
/**
 * @param of The value of an event
 * @param options The measure's units and format (see {@link GeoMeasureOptions})
 * @return The measure that gives the latest event's value
 * @template P The type of the events' payload
 */
export const latestOf = <P>(of: (datum: GeoDatum<P>) => number, options?: GeoMeasureOptions): GeoMeasure<P> =>
    ({kind: 'latest', of, options})
/**
 * A measure of your own that can take an event back out, kept incrementally: its state is updated
 * as each event arrives and as each one leaves, so it costs the same however many events a cell
 * holds. Use it for anything you can undo: e.g. a standard deviation (from the count, the sum, and
 * the sum of the squares), a weighted mean, or a count of the events with some payload value.
 * @param reducer The reducer: the initial state, how an event is added and removed, and the value
 * @param options The measure's units and format (see {@link GeoMeasureOptions})
 * @return The measure
 * @template P The type of the events' payload
 * @template S The type of the reducer's state
 * @example
 * ```ts
 * // the standard deviation of the events' magnitudes
 * reduceOf<Reading, {n: number, sum: number, squares: number}>({
 *     initial: () => ({n: 0, sum: 0, squares: 0}),
 *     add: ({n, sum, squares}, datum) => ({n: n + 1, sum: sum + datum.payload.magnitude, squares: squares + datum.payload.magnitude ** 2}),
 *     remove: ({n, sum, squares}, datum) => ({n: n - 1, sum: sum - datum.payload.magnitude, squares: squares - datum.payload.magnitude ** 2}),
 *     value: ({n, sum, squares}) => n > 0 ? Math.sqrt(Math.max(0, squares / n - (sum / n) ** 2)) : NaN,
 * })
 * ```
 */
export const reduceOf = <P, S>(reducer: GeoReducer<P, S>, options?: GeoMeasureOptions): GeoMeasure<P> =>
    ({kind: 'reduce', reducer: reducer as unknown as GeoReducer<P, unknown>, options})
/**
 * A measure of your own, from all of a cell's (or group's) events at once: for anything that can't
 * take an event back out, e.g. a median, a percentile, or a count of distinct values. It's
 * recalculated only for a cell that changed, and only when the cell's aggregate is next read (at
 * most once per redraw), but then over all of the cell's events -- so for large, busy cells, prefer
 * {@link reduceOf} where you can.
 * @param of The measure's value, from the events (oldest first; don't keep the array)
 * @param options The measure's units and format (see {@link GeoMeasureOptions})
 * @return The measure
 * @template P The type of the events' payload
 * @example
 * ```ts
 * // the median magnitude
 * measureOf<Reading>(events => d3.median(events, datum => datum.payload.magnitude) ?? NaN)
 * ```
 */
export const measureOf = <P>(of: (events: ReadonlyArray<GeoDatum<P>>) => number, options?: GeoMeasureOptions): GeoMeasure<P> =>
    ({kind: 'events', of, options})

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
     * Which events are rolled up (e.g. only the alarms); all of them when not set. Like `cellOf` and
     * `groupBy`, it's called once for each event, as it arrives: when the event is dropped, it's taken
     * out of the cell and group it was put in then.
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
    /**
     * The roll-up's measures' units and formats, by name (see {@link GeoMeasureOptions} and
     * {@link formatMeasure}) -- the same for every aggregate of the roll-up
     */
    readonly measures: Readonly<Record<string, GeoMeasureOptions>>
}

/**
 * The events of a cell (or of a group of a cell), and their measures, kept as events are added
 * and removed: sums (and so means) are running sums; a smallest or largest value is kept as events
 * are added, and re-found only when the event holding it is removed; a reducer's state is updated
 * with each event; and a measure of all the events is recalculated, when it's read, only after the
 * events changed
 */
class Tally<P> {
    // the events, oldest first (from `head` on: removing the oldest just moves the head)
    private events: Array<GeoDatum<P>> = []
    private head = 0
    private readonly sums = new Map<string, number>()
    // the number of finite values in each sum (a value that isn't finite, e.g. a missing reading's
    // NaN, is left out, rather than spoiling the sum until the tally empties)
    private readonly finiteCounts = new Map<string, number>()
    private readonly extremes = new Map<string, number | undefined>()
    // the reducers' states, and the measures of all the events (undefined until recalculated)
    private readonly states = new Map<string, unknown>()
    private readonly calculated = new Map<string, number | undefined>()
    private readonly measures: ReadonlyArray<[string, GeoMeasure<P>]>

    /**
     * @param measures The measures to keep, by name
     */
    constructor(measures: ReadonlyArray<[string, GeoMeasure<P>]>) {
        this.measures = measures
        measures.forEach(([name, measure]) => {
            if (measure.kind === 'reduce') this.states.set(name, measure.reducer.initial())
        })
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
     * @return The events, oldest first (a copy)
     */
    list(): Array<GeoDatum<P>> {
        return this.events.slice(this.head)
    }

    /**
     * Adds an event (the latest)
     * @param datum The event
     */
    add(datum: GeoDatum<P>): void {
        this.events.push(datum)
        this.measures.forEach(([name, measure]) => {
            if (measure.kind === 'count' || measure.kind === 'latest') return
            if (measure.kind === 'reduce') {
                this.states.set(name, measure.reducer.add(this.states.get(name), datum))
                return
            }
            if (measure.kind === 'events') {
                this.calculated.set(name, undefined)
                return
            }
            const value = measure.of(datum)
            if (!Number.isFinite(value)) return
            if (measure.kind === 'sum' || measure.kind === 'mean') {
                this.sums.set(name, (this.sums.get(name) ?? 0) + value)
                this.finiteCounts.set(name, (this.finiteCounts.get(name) ?? 0) + 1)
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
            if (measure.kind === 'reduce') {
                // (back to the initial state once the last event leaves, so that the reducer's
                // rounding errors don't pile up over a long stream)
                this.states.set(name, this.count > 0 ?
                    measure.reducer.remove(this.states.get(name), datum) :
                    measure.reducer.initial())
                return
            }
            if (measure.kind === 'events') {
                this.calculated.set(name, undefined)
                return
            }
            const value = measure.of(datum)
            if (!Number.isFinite(value)) return
            if (measure.kind === 'sum' || measure.kind === 'mean') {
                // (back to 0 once the last value leaves, so that rounding errors don't pile up)
                const finiteCount = (this.finiteCounts.get(name) ?? 1) - 1
                this.finiteCounts.set(name, finiteCount)
                this.sums.set(name, finiteCount > 0 ? (this.sums.get(name) ?? 0) - value : 0)
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
                    values[name] = (this.finiteCounts.get(name) ?? 0) > 0 ?
                        (this.sums.get(name) ?? 0) / (this.finiteCounts.get(name) ?? 1) :
                        NaN
                    break
                case 'latest':
                    values[name] = this.last !== undefined ? measure.of(this.last) : NaN
                    break
                case 'reduce':
                    values[name] = measure.reducer.value(this.states.get(name))
                    break
                case 'events': {
                    let value = this.calculated.get(name)
                    if (value === undefined) {
                        value = this.count > 0 ? measure.of(this.events.slice(this.head)) : NaN
                        this.calculated.set(name, value)
                    }
                    values[name] = value
                    break
                }
                default:
                    values[name] = this.extremeOf(name, measure)
            }
        })
        return values
    }

    /**
     * @param name The measure's name
     * @param measure The (min or max) measure
     * @return The smallest or largest (finite) value of the events (`NaN` when there's none), re-found
     * when unknown
     */
    private extremeOf(name: string, measure: GeoMeasure<P>): number {
        if (this.count === 0 || (measure.kind !== 'min' && measure.kind !== 'max')) return NaN
        let extreme = this.extremes.get(name)
        if (extreme === undefined) {
            extreme = measure.kind === 'min' ? Infinity : -Infinity
            for (let i = this.head; i < this.events.length; i++) {
                const value = measure.of(this.events[i])
                if (!Number.isFinite(value)) continue
                extreme = measure.kind === 'min' ? Math.min(extreme, value) : Math.max(extreme, value)
            }
            this.extremes.set(name, extreme)
        }
        return Number.isFinite(extreme) ? extreme : NaN
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
     * @param measures The roll-up's measures' units and formats, by name
     * @return The cell's aggregate
     */
    aggregate(where: GeoBinning<P>['position'], measures: Readonly<Record<string, GeoMeasureOptions>>): GeoAggregate {
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
            measures,
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
    // the measures' units and formats, by name (handed to every aggregate)
    private readonly measureOptions: Readonly<Record<string, GeoMeasureOptions>>
    private readonly cells = new Map<string, Cell<P>>()
    // where each rolled-up event was put (its cell, and its group), so that removing it takes it out
    // of the same cell and group, even when the roll-up's functions would now answer differently
    // (e.g. a filter that reads a setting the user has since changed)
    private readonly placements = new Map<GeoDatum<P>, {cellId: string, group: string | undefined}>()
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
        this.measureOptions = Object.fromEntries(this.measures.map(([name, measure]) => [name, measure.options ?? {}]))
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
        const group = this.rollup.groupBy?.(datum, seriesName)
        cell.add(datum, group)
        this.placements.set(datum, {cellId: id, group})
        this.cached = undefined
    }

    /**
     * Removes an event (e.g. one that's been dropped as too old) from the cell and group it was put
     * in when it was added (a no-op for an event that wasn't rolled up)
     * @param datum The event
     */
    remove(datum: GeoDatum<P>): void {
        const placement = this.placements.get(datum)
        if (placement === undefined) return
        this.placements.delete(datum)
        const cell = this.cells.get(placement.cellId)
        if (cell === undefined) return
        cell.remove(datum, placement.group)
        if (cell.all.count === 0) this.cells.delete(placement.cellId)
        this.cached = undefined
    }

    /**
     * @param cellId The ID of a cell
     * @param group A group of the cell's events; all of them when not given
     * @return The cell's (or the group's) events, oldest first (empty for an unknown cell or group)
     */
    eventsOf(cellId: string, group?: string): Array<GeoDatum<P>> {
        const cell = this.cells.get(cellId)
        if (cell === undefined) return []
        if (group === undefined) return cell.all.list()
        return cell.groups.get(group)?.list() ?? []
    }

    /**
     * @return The size (degrees) of the roll-up's cells, when its binning says (see
     * {@link GeoBinning.cellSize})
     */
    get cellSize(): number | undefined {
        return this.binning.cellSize
    }

    /**
     * @return The aggregates of the cells (the same array until the cells change)
     */
    aggregates(): Array<GeoAggregate> {
        if (this.cached === undefined) {
            this.cached = Array.from(this.cells.values()).map(cell => cell.aggregate(this.binning.position, this.measureOptions))
        }
        return this.cached
    }
}
