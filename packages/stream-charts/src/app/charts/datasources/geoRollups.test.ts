import {Subject} from "rxjs";
import {
    byGridCell,
    byLocation,
    bySensor,
    countOf,
    formatMeasure,
    type GeoAggregate,
    type GeoRollup,
    GeoRollupState,
    latestOf,
    maxOf,
    meanOf,
    measureOf,
    minOf,
    reduceOf,
    sumOf,
} from "./geoRollups";
import {type GeoDatum, geoDatumOf, geoSeriesFrom} from "../series/geoSeries";
import {GeoDataSource} from "./geoDataSource";
import {type GeoChartData, geoChartDataOf} from "../observables/geo";

type Reading = { magnitude: number, kind: string }

const reading = (sensorId: string, latitude: number, longitude: number, time: number, magnitude: number = 1, kind: string = 'a'): GeoDatum<Reading> =>
    geoDatumOf(sensorId, latitude, longitude, time, {magnitude, kind})

const magnitude = (datum: GeoDatum<Reading>): number => datum.payload.magnitude

// a measure of our own that can be undone: the (population) standard deviation of the magnitudes
type Moments = {n: number, sum: number, squares: number}
const standardDeviation = reduceOf<Reading, Moments>({
    initial: () => ({n: 0, sum: 0, squares: 0}),
    add: ({n, sum, squares}, datum) => ({n: n + 1, sum: sum + magnitude(datum), squares: squares + magnitude(datum) ** 2}),
    remove: ({n, sum, squares}, datum) => ({n: n - 1, sum: sum - magnitude(datum), squares: squares - magnitude(datum) ** 2}),
    value: ({n, sum, squares}) => n > 0 ? Math.sqrt(Math.max(0, squares / n - (sum / n) ** 2)) : NaN,
})

// a measure of our own from all the events: the median magnitude
const medianOf = (values: Array<number>): number => {
    const sorted = [...values].sort((a, b) => a - b)
    const middle = sorted.length >> 1
    return sorted.length === 0 ? NaN : sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
const median = measureOf<Reading>(events => medianOf(events.map(magnitude)))

/**
 * @param rollup A roll-up
 * @param events The events to add, all in the series "s"
 * @return The roll-up's state, with the events added
 */
function rolledUp(rollup: GeoRollup<Reading>, events: Array<GeoDatum<Reading>>): GeoRollupState<Reading> {
    const state = new GeoRollupState<Reading>(rollup)
    events.forEach(event => state.add(event, 's'))
    return state
}

const byId = (aggregates: Array<GeoAggregate>): Map<string, GeoAggregate> => new Map(aggregates.map(a => [a.id, a]))

describe('binning', () => {
    it('puts the events at the same place in one cell, whichever sensor reported them', () => {
        const aggregates = byId(rolledUp({cellOf: byLocation(0.01)}, [
            reading('TKY-1', 35.68, 139.69, 1),
            reading('TKY-2', 35.68, 139.69, 2),
            reading('TKY-2', 35.684, 139.693, 3),   // rounds to the same place
            reading('SND-1', 38.27, 140.87, 4),
        ]).aggregates())

        expect(aggregates.size).toBe(2)
        const tokyo = Array.from(aggregates.values()).find(a => a.latitude === 35.68)!
        expect(tokyo.count).toBe(3)
        expect(tokyo.sensorCount).toBe(2)
        expect(tokyo.longitude).toBe(139.69)
    })

    it('treats longitudes 180 and -180 as the same place', () => {
        const aggregates = rolledUp({cellOf: byLocation(0.1)}, [
            reading('a', 10, 180, 1),
            reading('b', 10, -180, 2),
        ]).aggregates()
        expect(aggregates.length).toBe(1)
        expect(aggregates[0].count).toBe(2)
    })

    it('puts each sensor\'s events in a cell of their own, at the sensor\'s latest position', () => {
        const aggregates = byId(rolledUp({cellOf: bySensor()}, [
            reading('V-1', 10, 20, 1),
            reading('V-2', 10, 20, 2),
            reading('V-1', 12, 24, 3),
        ]).aggregates())

        expect(aggregates.get('V-1')).toMatchObject({count: 2, latitude: 12, longitude: 24, sensorCount: 1})
        expect(aggregates.get('V-2')).toMatchObject({count: 1, latitude: 10, longitude: 20})
    })

    it('puts a sensor\'s cell at its events\' mean position, on the sphere (across the antimeridian)', () => {
        const [aggregate] = rolledUp({cellOf: bySensor({position: 'mean'})}, [
            reading('V-1', 0, 179, 1),
            reading('V-1', 0, -179, 2),
        ]).aggregates()

        expect(aggregate.latitude).toBeCloseTo(0, 9)
        expect(Math.abs(aggregate.longitude)).toBeCloseTo(180, 9)
    })

    it('puts events into the cells of a grid, with the cells\' bounds and centers', () => {
        const [aggregate] = rolledUp({cellOf: byGridCell(10)}, [reading('a', 35.68, 139.69, 1)]).aggregates()
        expect(aggregate.bounds).toEqual({west: 130, south: 30, east: 140, north: 40})
        expect(aggregate.latitude).toBe(35)
        expect(aggregate.longitude).toBe(135)
    })

    it('wraps the grid around at the antimeridian, and ends its top row at the north pole', () => {
        const aggregates = rolledUp({cellOf: byGridCell(10)}, [
            reading('a', 0, 180, 1),
            reading('b', 0, -180, 2),
            reading('c', 90, 0, 3),
        ]).aggregates()

        const bounds = aggregates.map(a => a.bounds)
        expect(bounds).toContainEqual({west: -180, south: 0, east: -170, north: 10})
        expect(bounds).toContainEqual({west: 0, south: 80, east: 10, north: 90})
        expect(aggregates.find(a => a.bounds!.west === -180)!.count).toBe(2)
    })

    it('uses an application\'s own function for the cells', () => {
        const aggregates = rolledUp(
            {cellOf: datum => ({id: datum.payload.kind, latitude: 1, longitude: 2})},
            [reading('a', 10, 20, 1, 1, 'x'), reading('b', 30, 40, 2, 1, 'x'), reading('c', 50, 60, 3, 1, 'y')]
        ).aggregates()
        expect(byId(aggregates).get('x')).toMatchObject({count: 2, latitude: 1, longitude: 2})
    })
})

describe('measures and groups', () => {
    const events = [
        reading('S-1', 10, 20, 1, 2.0, 'quake'),
        reading('S-2', 10, 20, 2, 5.0, 'quake'),
        reading('S-1', 10, 20, 3, 3.5, 'tremor'),
    ]
    const rollup: GeoRollup<Reading> = {
        cellOf: byLocation(),
        groupBy: datum => datum.sensorId,
        measures: {
            events: countOf(),
            total: sumOf(magnitude),
            mean: meanOf(magnitude),
            smallest: minOf(magnitude),
            peak: maxOf(magnitude),
            latest: latestOf(magnitude),
        },
    }

    it('measures the cell\'s events', () => {
        const [aggregate] = rolledUp(rollup, events).aggregates()
        expect(aggregate.count).toBe(3)
        expect(aggregate.values).toEqual({events: 3, total: 10.5, mean: 3.5, smallest: 2, peak: 5, latest: 3.5})
        expect(aggregate.firstTime).toBe(1)
        expect(aggregate.lastTime).toBe(3)
    })

    it('breaks the cell down by group, the largest group first', () => {
        const [aggregate] = rolledUp(rollup, events).aggregates()
        expect(aggregate.groups.map(group => [group.group, group.count, group.values.peak])).toEqual([
            ['S-1', 2, 3.5],
            ['S-2', 1, 5],
        ])
    })

    it('re-finds the peak when the event holding it is removed, and drops an emptied group', () => {
        const state = rolledUp(rollup, events)
        state.remove(events[1])
        const [aggregate] = state.aggregates()
        expect(aggregate.values.peak).toBe(3.5)
        expect(aggregate.groups.map(group => group.group)).toEqual(['S-1'])
    })

    it('drops a cell once its last event is removed', () => {
        const state = rolledUp(rollup, events)
        events.forEach(event => state.remove(event))
        expect(state.aggregates()).toEqual([])
    })

    it('only rolls up the events the filter takes', () => {
        const [aggregate] = rolledUp({...rollup, filter: datum => datum.payload.kind === 'quake'}, events).aggregates()
        expect(aggregate.count).toBe(2)
        expect(aggregate.values.peak).toBe(5)
    })

    it('leaves out values that aren\'t finite, so that a missing reading doesn\'t spoil the measures', () => {
        const missing = reading('S-1', 10, 20, 0, NaN, 'quake')
        const state = rolledUp(rollup, [missing, ...events])
        expect(state.aggregates()[0].values).toEqual({events: 4, total: 10.5, mean: 3.5, smallest: 2, peak: 5, latest: 3.5})

        // the measures still follow the events that have values, once the missing one leaves
        state.remove(missing)
        state.remove(events[1])
        expect(state.aggregates()[0].values).toEqual({events: 2, total: 5.5, mean: 2.75, smallest: 2, peak: 3.5, latest: 3.5})
    })

    it('has no value for a measure while none of the cell\'s events have one', () => {
        const [aggregate] = rolledUp(rollup, [reading('S-1', 10, 20, 1, NaN)]).aggregates()
        expect(aggregate.values).toEqual({events: 1, total: 0, mean: NaN, smallest: NaN, peak: NaN, latest: NaN})
    })

    it('takes an event out of the cell and group it was put in, even when the roll-up\'s functions have changed their minds', () => {
        // a filter, and a grouping, that read a setting the user changes while the events are held
        let quakesOnly = true
        let groupOf = (datum: GeoDatum<Reading>): string => datum.sensorId
        const state = rolledUp({...rollup, filter: datum => !quakesOnly || datum.payload.kind === 'quake', groupBy: datum => groupOf(datum)}, events)
        quakesOnly = false
        groupOf = () => 'other'
        events.forEach(event => state.remove(event))
        expect(state.aggregates()).toEqual([])
    })

    it('hands back the same aggregates until the cells change', () => {
        const state = rolledUp(rollup, events)
        const first = state.aggregates()
        expect(state.aggregates()).toBe(first)
        state.add(reading('S-3', 10, 20, 4), 's')
        expect(state.aggregates()).not.toBe(first)
    })
})

describe('measures of your own', () => {
    const events = [
        reading('S-1', 10, 20, 1, 2, 'quake'),
        reading('S-2', 10, 20, 2, 4, 'quake'),
        reading('S-1', 10, 20, 3, 4, 'tremor'),
        reading('S-2', 10, 20, 4, 4, 'quake'),
        reading('S-1', 10, 20, 5, 5, 'tremor'),
        reading('S-1', 10, 20, 6, 5, 'quake'),
        reading('S-2', 10, 20, 7, 7, 'tremor'),
        reading('S-1', 10, 20, 8, 9, 'quake'),
    ]
    const rollup: GeoRollup<Reading> = {cellOf: byLocation(), groupBy: datum => datum.payload.kind, measures: {spread: standardDeviation, median}}

    it('keeps a reducer\'s value as events are added and removed', () => {
        const state = rolledUp(rollup, events)
        // the magnitudes 2, 4, 4, 4, 5, 5, 7, 9: a mean of 5, and a standard deviation of 2
        expect(state.aggregates()[0].values.spread).toBeCloseTo(2, 9)
        state.remove(events[0])
        state.remove(events[7])
        // 4, 4, 4, 5, 5, 7
        expect(state.aggregates()[0].values.spread).toBeCloseTo(Math.sqrt(147 / 6 - (29 / 6) ** 2), 9)
    })

    it('measures all the events at once', () => {
        const state = rolledUp(rollup, events)
        expect(state.aggregates()[0].values.median).toBe(4.5)
        state.remove(events[7])
        expect(state.aggregates()[0].values.median).toBe(4)
    })

    it('measures each group with them, too', () => {
        const [aggregate] = rolledUp(rollup, events).aggregates()
        const tremors = aggregate.groups.find(group => group.group === 'tremor')!
        // the tremors' magnitudes: 4, 5, 7
        expect(tremors.values.median).toBe(5)
        expect(tremors.values.spread).toBeCloseTo(Math.sqrt(14 / 9), 9)
    })

    it('recalculates a measure of all the events only for the cells that changed, and only when read', () => {
        let calls = 0
        const counted = measureOf<Reading>(events => {
            calls++
            return events.length
        })
        const state = new GeoRollupState<Reading>({cellOf: bySensor(), measures: {counted}})
        state.add(reading('A', 0, 0, 1), 's')
        state.add(reading('B', 0, 0, 2), 's')
        state.add(reading('A', 0, 0, 3), 's')
        expect(calls).toBe(0)
        state.aggregates()
        expect(calls).toBe(2)

        // only cell B changed
        state.add(reading('B', 0, 0, 4), 's')
        const aggregates = state.aggregates()
        expect(calls).toBe(3)
        expect(aggregates.map(aggregate => [aggregate.id, aggregate.values.counted])).toEqual([['A', 2], ['B', 2]])
    })
})

describe('units and formats', () => {
    it('formats a value with its units: a space before most, none before % or °', () => {
        expect(formatMeasure(12.345, {units: 'ms'})).toBe('12.345 ms')
        expect(formatMeasure(1234.5678)).toBe('1,234.568')
        expect(formatMeasure(42, {units: '%'})).toBe('42%')
        expect(formatMeasure(21.5, {units: '°C'})).toBe('21.5°C')
        expect(formatMeasure(NaN, {units: 'ms'})).toBe('---')
    })

    it('formats a value with a d3-format specifier, or a function, and can leave out the units', () => {
        expect(formatMeasure(12.345, {units: 'ms', format: ',.1f'})).toBe('12.3 ms')
        expect(formatMeasure(0.256, {units: '%', format: value => (value * 100).toFixed(0)})).toBe('26%')
        expect(formatMeasure(12.345, {units: 'ms', format: ',.1f'}, false)).toBe('12.3')
    })

    it('hands each aggregate its roll-up\'s measures\' units and formats', () => {
        const [aggregate] = rolledUp({
            cellOf: byLocation(),
            measures: {
                events: countOf(),
                delay: meanOf(magnitude, {units: 'ms', format: ',.1f'}),
                share: reduceOf<Reading, number>({initial: () => 0, add: n => n + 1, remove: n => n - 1, value: n => n}, {units: '%'}),
                median: measureOf<Reading>(events => events.length, {units: 'µg/m³'}),
            },
        }, [reading('a', 10, 20, 1, 3)]).aggregates()
        expect(aggregate.measures).toEqual({
            events: {},
            delay: {units: 'ms', format: ',.1f'},
            share: {units: '%'},
            median: {units: 'µg/m³'},
        })
        expect(aggregate.values.delay).toBe(3)
    })
})

describe('incremental roll-ups', () => {
    // a small deterministic random-number generator (mulberry32), so failures can be reproduced
    function random(seed: number): () => number {
        return () => {
            seed |= 0
            seed = seed + 0x6D2B79F5 | 0
            let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
            return ((t ^ t >>> 14) >>> 0) / 4294967296
        }
    }

    const rollups: Array<[string, GeoRollup<Reading>]> = [
        ['byLocation', {cellOf: byLocation(1)}],
        ['bySensor (latest)', {cellOf: bySensor()}],
        ['bySensor (mean)', {cellOf: bySensor({position: 'mean'})}],
        ['byGridCell', {cellOf: byGridCell(30)}],
    ]

    it.each(rollups)('match a recount of the remaining events, through adds and removes (%s)', (_name, base) => {
        const rollup: GeoRollup<Reading> = {
            ...base,
            groupBy: datum => datum.payload.kind,
            measures: {
                total: sumOf(magnitude), mean: meanOf(magnitude), low: minOf(magnitude), peak: maxOf(magnitude),
                last: latestOf(magnitude), spread: standardDeviation, median,
            },
        }
        for (let seed = 1; seed <= 20; seed++) {
            const next = random(seed)
            const state = new GeoRollupState<Reading>(rollup)
            const kept: Array<GeoDatum<Reading>> = []
            for (let step = 0; step < 300; step++) {
                if (kept.length > 0 && next() < 0.4) {
                    // mostly the oldest event goes (as the data source drops them), sometimes another
                    const index = next() < 0.8 ? 0 : Math.floor(next() * kept.length)
                    state.remove(kept[index])
                    kept.splice(index, 1)
                } else {
                    const event = reading(
                        `S-${Math.floor(next() * 6)}`,
                        Math.round((next() * 160 - 80) * 2) / 2, Math.round((next() * 358 - 179) * 2) / 2,
                        step, Math.round(next() * 90) / 10, next() < 0.5 ? 'a' : 'b',
                    )
                    state.add(event, 's')
                    kept.push(event)
                }
            }

            const incremental = byId(state.aggregates())
            const recount = byId(rolledUp(rollup, kept).aggregates())
            expect(Array.from(incremental.keys()).sort()).toEqual(Array.from(recount.keys()).sort())
            recount.forEach((expected, id) => {
                const actual = incremental.get(id)!
                expect(actual.count).toBe(expected.count)
                expect(actual.sensorCount).toBe(expected.sensorCount)
                expect(actual.firstTime).toBe(expected.firstTime)
                expect(actual.lastTime).toBe(expected.lastTime)
                expect(actual.latitude).toBeCloseTo(expected.latitude, 6)
                expect(actual.longitude).toBeCloseTo(expected.longitude, 6)
                Object.entries(expected.values).forEach(([name, value]) => expect(actual.values[name]).toBeCloseTo(value, 6))
                expect(actual.groups.map(group => [group.group, group.count])).toEqual(expected.groups.map(group => [group.group, group.count]))
                expected.groups.forEach((group, index) => {
                    expect(actual.groups[index].values.peak).toBeCloseTo(group.values.peak, 9)
                    expect(actual.groups[index].values.median).toBeCloseTo(group.values.median, 9)
                    expect(actual.groups[index].values.spread).toBeCloseTo(group.values.spread, 6)
                })
            })
        }
    })
})

describe('GeoDataSource roll-ups', () => {
    function startedSource(dropDataAfter?: number): {dataSource: GeoDataSource<Reading>, emit: (data: GeoChartData<Reading>) => void} {
        const subject = new Subject<GeoChartData<Reading>>()
        const dataSource = new GeoDataSource<Reading>({
            initialData: [geoSeriesFrom<Reading>('seismic', [reading('TKY-1', 35.68, 139.69, 0, 2)])],
            generator: () => subject.asObservable(),
            dropDataAfter,
            rollups: {
                'by location': {cellOf: byLocation(), measures: {peak: maxOf(magnitude)}},
                'by sensor': {cellOf: bySensor()},
            },
        })
        dataSource.start()
        return {dataSource, emit: data => subject.next(data)}
    }

    it('rolls up its initial events, and lists its roll-ups', () => {
        const {dataSource} = startedSource()
        expect(dataSource.rollupNames()).toEqual(['by location', 'by sensor'])
        expect(dataSource.aggregates('by location').map(a => a.count)).toEqual([1])
        expect(dataSource.aggregates('unknown')).toEqual([])
    })

    it('rolls up new events, and takes dropped ones back out', () => {
        const {dataSource, emit} = startedSource(100)
        emit(geoChartDataOf(new Map([['seismic', [reading('TKY-2', 35.68, 139.69, 50, 4)]]])))
        expect(dataSource.aggregates('by location')[0]).toMatchObject({count: 2, sensorCount: 2, values: {peak: 4}})

        // the events at time 0 and 50 age out
        emit(geoChartDataOf(new Map([['weather', [reading('LON-1', 51.51, -0.13, 200, 1)]]])))
        const byLocationAggregates = dataSource.aggregates('by location')
        expect(byLocationAggregates.map(a => [a.latitude, a.count])).toEqual([[51.51, 1]])
        expect(dataSource.aggregates('by sensor').map(a => a.id)).toEqual(['LON-1'])
    })

    it('hands back a cell\'s events, or one of its groups\', oldest first', () => {
        const subject = new Subject<GeoChartData<Reading>>()
        const dataSource = new GeoDataSource<Reading>({
            initialData: [geoSeriesFrom<Reading>('seismic', [])],
            generator: () => subject.asObservable(),
            rollups: {'by location': {cellOf: byLocation(), groupBy: datum => datum.sensorId}},
        })
        dataSource.start()
        const events = [reading('TKY-1', 35.68, 139.69, 1), reading('TKY-2', 35.68, 139.69, 2), reading('TKY-1', 35.68, 139.69, 3)]
        subject.next(geoChartDataOf(new Map([['seismic', events]])))
        const [cell] = dataSource.aggregates('by location')

        expect(dataSource.eventsOf('by location', cell.id).map(event => event.time)).toEqual([1, 2, 3])
        expect(dataSource.eventsOf('by location', cell.id, 'TKY-1').map(event => event.time)).toEqual([1, 3])
        expect(dataSource.eventsOf('by location', cell.id, 'nobody')).toEqual([])
        expect(dataSource.eventsOf('unknown', cell.id)).toEqual([])
    })

    it('rolls up the events held now when its roll-ups are replaced', () => {
        const {dataSource, emit} = startedSource()
        emit(geoChartDataOf(new Map([['seismic', [reading('TKY-2', 35.68, 139.69, 50, 4)]]])))
        dataSource.setRollups({'grid': {cellOf: byGridCell(10)}})
        expect(dataSource.rollupNames()).toEqual(['grid'])
        expect(dataSource.aggregates('grid').map(a => a.count)).toEqual([2])
    })
})
