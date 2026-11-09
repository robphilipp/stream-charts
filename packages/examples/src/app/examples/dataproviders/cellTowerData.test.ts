import {
    CARRIERS,
    type CellEvent,
    cellEventsAt,
    CITY_CENTERS,
    initialCellTowerData,
    PHONES,
    SERIES_NAMES,
    TOWERS,
    TOWERS_BY_ID,
    trilaterate,
} from "./cellTowerData.ts";
import type {GeoDatum} from "stream-charts";

// the kilometers per degree of latitude (as the data provider takes it)
const KM_PER_DEGREE = 111.2

/**
 * @param from A [longitude, latitude]
 * @param to Another, nearby
 * @return The distance (km) between them, on the plane (as the data provider measures it)
 */
const kmBetween = ([fromLongitude, fromLatitude]: [number, number], [toLongitude, toLatitude]: [number, number]): number =>
    Math.hypot(
        (toLongitude - fromLongitude) * KM_PER_DEGREE * Math.cos((fromLatitude + toLatitude) / 2 * Math.PI / 180),
        (toLatitude - fromLatitude) * KM_PER_DEGREE
    )

describe('trilateration', () => {
    const towers: Array<[number, number]> = [[2.30, 48.88], [2.40, 48.87], [2.34, 48.82]]
    const phone: [number, number] = [2.35, 48.86]

    it('finds the place whose distances from the towers are the ones given', () => {
        const fix = trilaterate(towers.map(location => ({location, distance: kmBetween(phone, location)})))!
        expect(kmBetween(fix.location, phone)).toBeLessThan(0.01)
        expect(fix.residual).toBeLessThan(0.01)
    })

    it('finds a place near enough when the distances are a little off, and says how far off they are', () => {
        const fix = trilaterate(towers.map((location, index) => ({location, distance: kmBetween(phone, location) + [0.05, -0.04, 0.03][index]})))!
        expect(kmBetween(fix.location, phone)).toBeLessThan(0.2)
        expect(fix.residual).toBeGreaterThan(0)
    })

    it('says how much the towers\' geometry dilutes the precision: more, when they\'re all to one side', () => {
        const surrounding = trilaterate(towers.map(location => ({location, distance: kmBetween(phone, location)})))!
        const oneSide: Array<[number, number]> = [[2.40, 48.866], [2.405, 48.86], [2.40, 48.854]]
        const lopsided = trilaterate(oneSide.map(location => ({location, distance: kmBetween(phone, location)})))!
        expect(kmBetween(lopsided.location, phone)).toBeLessThan(0.01)
        expect(surrounding.dilution).toBeLessThan(2)
        expect(lopsided.dilution).toBeGreaterThan(3 * surrounding.dilution)
    })

    it('can\'t fix a place from fewer than three towers, or from towers in a line', () => {
        expect(trilaterate(towers.slice(0, 2).map(location => ({location, distance: 1})))).toBeUndefined()
        const inLine: Array<[number, number]> = [[2.30, 48.86], [2.35, 48.86], [2.40, 48.86]]
        expect(trilaterate(inLine.map(location => ({location, distance: kmBetween(phone, location)})))).toBeUndefined()
    })
})

describe('the cell-tower network', () => {
    it('has nine towers for each carrier in each major city, and 100 more in Europe, each a few kilometers from its city\'s center', () => {
        const europe = ['ROM', 'AMS', 'VIE', 'WAW', 'STO']
        CITY_CENTERS.forEach((center, city) => {
            const towers = TOWERS.filter(tower => tower.city === city)
            const carriers = new Set(towers.map(tower => tower.carrier))
            // (six carriers in each major city; four of them in each of the other European cities)
            expect(carriers.size).toBe(europe.includes(city) ? 4 : CARRIERS.length)
            carriers.forEach(carrier =>
                expect(towers.filter(tower => tower.carrier === carrier).length).toBe(europe.includes(city) ? 5 : 9)
            )
            towers.forEach(tower => {
                expect(kmBetween(center, tower.location)).toBeGreaterThan(0.9)
                expect(kmBetween(center, tower.location)).toBeLessThan(6.1)
            })
        })
        expect(TOWERS.filter(tower => europe.includes(tower.city)).length).toBe(100)
        expect(TOWERS.length).toBe(20 * CARRIERS.length * 9 + 100)
        expect(TOWERS_BY_ID.size).toBe(TOWERS.length)
    })

    // a few minutes of the network's events
    const events = Array.from({length: 4000}, (_, tick) => cellEventsAt(50 * tick))
    const of = (name: string): Array<GeoDatum<CellEvent>> => events.flatMap(chunk => chunk.get(name) ?? [])

    it('reports pings at their towers, by carrier, with the tower as the sensor', () => {
        CARRIERS.forEach(({name}) => {
            const pings = of(name)
            expect(pings.length).toBeGreaterThan(0)
            pings.forEach(ping => {
                const tower = TOWERS_BY_ID.get(ping.sensorId)!
                expect(tower.carrier).toBe(name)
                expect([ping.longitude, ping.latitude]).toEqual(tower.location)
                expect(ping.payload.kind).toBe('ping')
                if (ping.payload.kind !== 'ping') return
                expect(ping.payload.carrier).toBe(name)
                expect(ping.payload.signalStrength).toBeGreaterThanOrEqual(-140)
                expect(ping.payload.signalStrength).toBeLessThanOrEqual(-44)
            })
        })
    })

    it('reports, at each tick, ten phones\' pings to the towers serving them (their nearest), and their locations', () => {
        events.forEach(chunk => {
            const pings = CARRIERS.flatMap(({name}) => chunk.get(name) ?? [])
            const fixes = chunk.get(PHONES) ?? []
            const phones = new Set(pings.map(ping => ping.payload.deviceId))
            expect(pings.length).toBe(10)
            expect(phones.size).toBe(10)
            expect(fixes.length).toBeLessThanOrEqual(10)
            fixes.forEach(fix => expect(phones.has(fix.payload.deviceId)).toBe(true))
        })
    })

    it('locates each phone that reports, in its city, near enough to its towers\' distances', () => {
        const fixes = of(PHONES)
        expect(fixes.length).toBeGreaterThan(0)
        fixes.forEach(fix => {
            expect(fix.payload.kind).toBe('fix')
            if (fix.payload.kind !== 'fix') return
            expect(fix.sensorId).toBe(fix.payload.deviceId)
            // (each city's phones loop within a few kilometers of its center)
            const nearestCity = Math.min(...Array.from(CITY_CENTERS.values()).map(center => kmBetween(center, [fix.longitude, fix.latitude])))
            expect(nearestCity).toBeLessThan(6)
            expect(fix.payload.accuracy).toBeLessThan(500)
        })
    })

    it('estimates each phone\'s location near where it actually is', () => {
        // how far (km) each estimated location is from the phone's actual place
        const errors = of(PHONES)
            .map(fix => fix.payload.kind === 'fix' ?
                kmBetween([fix.payload.phoneLongitude, fix.payload.phoneLatitude], [fix.longitude, fix.latitude]) :
                NaN)
            .sort((a, b) => a - b)
        expect(errors.length).toBeGreaterThan(0)
        expect(errors[Math.floor(errors.length / 2)]).toBeLessThan(0.1)
        expect(errors[Math.floor(errors.length * 0.99)]).toBeLessThan(0.3)
        // (a rare location is further off than its towers' geometry suggests, but not by much)
        expect(errors[errors.length - 1]).toBeLessThan(3)
    })

    it('creates the initial series, every series even when empty, each in time order', () => {
        const initial = initialCellTowerData(50, 10_000)
        expect(initial.map(series => series.name)).toEqual(SERIES_NAMES)
        initial.forEach(series => {
            const times = Array.from(series.data, datum => datum.time)
            expect(times).toEqual([...times].sort((a, b) => a - b))
        })
    })
})
