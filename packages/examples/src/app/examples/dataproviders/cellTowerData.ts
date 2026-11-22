import {interval, type Observable} from "rxjs"
import {map} from "rxjs/operators"
import * as d3 from "d3"
import {type GeoChartData, geoChartDataOf, type GeoDatum, geoDatumOf, type GeoSeries, geoSeriesFrom} from "stream-charts"

/*
    A random network of cell towers, and the phones that ping them, for the geo example:
    - six (fictional) carriers, each with nine towers around the center of each of 20 major cities,
      and four of them with five towers in each of five more European cities (100 towers in all)
    - phones, two for each carrier in each city, moving around their city: ten times a tick, a
      phone pings the tower serving it (its carrier's nearest), with the signal's strength and
      quality, and the phone's distance from the tower (from the timing advance)
    - and, from the measurements of its carrier's four nearest towers that the phone reports with
      each ping, its location, estimated by trilateration from the towers' positions and distances
      (a "fix", at the estimated location), unless the towers surround it too poorly to locate it
 */

/**
 * A kind of phone (from the device's type allocation code)
 */
export type PhoneType = 'iPhone' | 'Galaxy' | 'Pixel' | 'Other Android' | 'Feature phone' | 'IoT module'

/**
 * The radio technology of a ping
 */
export type Technology = '5G' | 'LTE' | '3G'

/**
 * What a ping was for: a data session, a call, a text, a handover between towers, or a call that
 * was dropped
 */
export type PingEvent = 'data' | 'call' | 'sms' | 'handover' | 'call drop'

/**
 * A phone's ping to a tower (an event at the tower, whose sensor is the tower)
 */
export interface TowerPing {
    kind: 'ping'
    carrier: string
    // the phone's anonymized identifier
    deviceId: string
    phoneType: PhoneType
    technology: Technology
    // the frequency band (e.g. "n77", or "B66")
    band: string
    // the tower's sector (antenna) that received the ping, by the direction of the phone from the
    // tower: 1 (bearings from 0° to 120°), 2 (to 240°), or 3 (to 360°)
    sector: number
    event: PingEvent
    // the strength of the tower's signal at the phone (RSRP, dBm): from about -44 (excellent) to -140
    signalStrength: number
    // the quality of the tower's signal at the phone (SINR, dB): from about -10 (poor) to 30 (excellent)
    signalQuality: number
    // the phone's distance from the tower (km), from the timing advance
    distance: number
    // where the phone actually was (degrees): known only because it's simulated -- a network knows
    // its towers, and its phones' distances from them, but not where its phones are
    phoneLatitude: number
    phoneLongitude: number
}

/**
 * A phone's location, estimated by trilateration from the towers it measured (an event at the
 * estimated location, whose sensor is the phone)
 */
export interface PhoneFix {
    kind: 'fix'
    carrier: string
    deviceId: string
    phoneType: PhoneType
    // the number of towers the location was estimated from
    towers: number
    // how far (m) the estimated location is expected to be off: from how precise the distances are,
    // and how well the towers surround it (or from how badly it fits their distances, when that's
    // worse)
    accuracy: number
    // where the phone actually was (degrees): known only because it's simulated (see `TowerPing`),
    // to show how far off the estimated location is
    phoneLatitude: number
    phoneLongitude: number
}

/**
 * What an event carries (the events' payload): a ping to a tower, or a phone's estimated location
 */
export type CellEvent = TowerPing | PhoneFix

/**
 * The carriers, by name (their series), with the codes in their towers' IDs
 */
export const CARRIERS = [
    {name: "Aurora Mobile", code: "AUR"},
    {name: "Meridian Wireless", code: "MER"},
    {name: "Polaris Telecom", code: "POL"},
    {name: "Zenith Cellular", code: "ZEN"},
    {name: "Harbor Networks", code: "HAR"},
    {name: "Summit Connect", code: "SUM"},
]
export const PHONES = "Phones (located)"
export const SERIES_NAMES = [...CARRIERS.map(carrier => carrier.name), PHONES]

// the major cities: their codes, their countries, and their centers' [longitude, latitude] (every
// carrier has nine towers in each)
const MAJOR_CITIES: Array<{code: string, country: string, center: [longitude: number, latitude: number]}> = [
    {code: "LON", country: "United Kingdom", center: [-0.13, 51.51]},
    {code: "PAR", country: "France", center: [2.35, 48.86]},
    {code: "BER", country: "Germany", center: [13.40, 52.52]},
    {code: "MAD", country: "Spain", center: [-3.70, 40.42]},
    {code: "IST", country: "Turkey", center: [28.98, 41.01]},
    {code: "CAI", country: "Egypt", center: [31.24, 30.04]},
    {code: "LOS", country: "Nigeria", center: [3.38, 6.52]},
    {code: "NBO", country: "Kenya", center: [36.82, -1.29]},
    {code: "JNB", country: "South Africa", center: [28.05, -26.20]},
    {code: "DXB", country: "United Arab Emirates", center: [55.27, 25.20]},
    {code: "BOM", country: "India", center: [72.88, 19.08]},
    {code: "SIN", country: "Singapore", center: [103.82, 1.35]},
    {code: "TKY", country: "Japan", center: [139.69, 35.68]},
    {code: "SYD", country: "Australia", center: [151.21, -33.87]},
    {code: "LAX", country: "United States of America", center: [-118.24, 34.05]},
    {code: "CHI", country: "United States of America", center: [-87.63, 41.88]},
    {code: "NYC", country: "United States of America", center: [-74.01, 40.71]},
    {code: "MEX", country: "Mexico", center: [-99.13, 19.43]},
    {code: "BOG", country: "Colombia", center: [-74.07, 4.71]},
    {code: "SAO", country: "Brazil", center: [-46.63, -23.55]},
]

// more European cities, each with four of the carriers, five towers each (100 more towers in
// Europe): the carriers that aren't everywhere, as regional networks aren't
const EUROPEAN_CITIES: Array<{code: string, country: string, center: [longitude: number, latitude: number]}> = [
    {code: "ROM", country: "Italy", center: [12.50, 41.90]},
    {code: "AMS", country: "Netherlands", center: [4.90, 52.37]},
    {code: "VIE", country: "Austria", center: [16.37, 48.21]},
    {code: "WAW", country: "Poland", center: [21.01, 52.23]},
    {code: "STO", country: "Sweden", center: [18.07, 59.33]},
]

/**
 * A city: its code, its center's [longitude, latitude], the carriers with towers there, and how many
 * towers each of them has
 */
interface City {
    code: string
    // the city's country (as the world atlas names it)
    country: string
    center: [longitude: number, latitude: number]
    carriers: Array<{name: string, code: string}>
    towersPerCarrier: number
}

const CITIES: Array<City> = [
    ...MAJOR_CITIES.map(city => ({...city, carriers: CARRIERS, towersPerCarrier: 9})),
    // (each of the European cities has a different four of the carriers)
    ...EUROPEAN_CITIES.map((city, index) => ({
        ...city,
        carriers: Array.from({length: 4}, (_, k) => CARRIERS[(index + k) % CARRIERS.length]),
        towersPerCarrier: 5,
    })),
]

/**
 * The kilometers per degree of latitude, and of longitude at a latitude (near enough, over a city)
 */
const KM_PER_DEGREE = 111.2
const kmPerDegreeOfLongitude = (latitude: number): number => KM_PER_DEGREE * Math.cos(latitude * Math.PI / 180)

/**
 * A cell tower: its ID (its carrier's code, its city's code, and its number), its carrier, its city,
 * and its [longitude, latitude]
 */
export interface Tower {
    id: string
    carrier: string
    city: string
    location: [longitude: number, latitude: number]
}

/**
 * The towers: each of a city's carriers', spread around the city's center (from one to six
 * kilometers out, and all around it, so that a phone in the city is among them)
 */
export const TOWERS: Array<Tower> = CITIES.flatMap(({code: city, center: [longitude, latitude], carriers, towersPerCarrier}) =>
    carriers.flatMap(({name, code}) => Array.from({length: towersPerCarrier}, (_, index) => {
        const bearing = (index * 360 / towersPerCarrier + Math.random() * 30) * Math.PI / 180
        const km = 1 + Math.random() * 5
        return {
            id: `${code}-${city}-${index + 1}`,
            carrier: name,
            city,
            location: [
                longitude + km * Math.sin(bearing) / kmPerDegreeOfLongitude(latitude),
                latitude + km * Math.cos(bearing) / KM_PER_DEGREE,
            ] as [number, number],
        }
    }))
)

/**
 * The towers by their carrier and city (`carrier|city`), for finding a phone's nearest
 */
const TOWERS_BY_CARRIER_AND_CITY = d3.group(TOWERS, tower => `${tower.carrier}|${tower.city}`)

/**
 * The towers by ID
 */
export const TOWERS_BY_ID = new Map(TOWERS.map(tower => [tower.id, tower]))

/**
 * The cities' centers ([longitude, latitude]), by code
 */
export const CITY_CENTERS = new Map(CITIES.map(({code, center}) => [code, center]))

/**
 * The number of towers in each country (by the name the world atlas gives it)
 */
export const TOWERS_BY_COUNTRY: Map<string, number> = d3.rollup(
    TOWERS,
    towers => towers.length,
    tower => CITIES.find(city => city.code === tower.city)?.country ?? ''
)

const PHONE_TYPES: Array<[PhoneType, number]> = [
    ['iPhone', 0.35], ['Galaxy', 0.25], ['Pixel', 0.08], ['Other Android', 0.22], ['Feature phone', 0.04], ['IoT module', 0.06],
]
const BANDS: Record<Technology, Array<string>> = {
    '5G': ['n77', 'n78', 'n41', 'n71'],
    'LTE': ['B2', 'B4', 'B12', 'B66'],
    '3G': ['B1', 'B5'],
}

/**
 * @param weighted Items, with their weights (summing to 1)
 * @return One of the items, chosen at random by their weights
 */
function weightedRandomOf<T>(weighted: Array<[T, number]>): T {
    let r = Math.random()
    for (const [item, weight] of weighted) {
        r -= weight
        if (r <= 0) return item
    }
    return weighted[weighted.length - 1][0]
}

const randomOf = <T>(items: Array<T>): T => items[Math.floor(Math.random() * items.length)]

/**
 * A phone: its ID, its carrier, its type and technology, its city, and how it moves around the
 * city's center -- along a Lissajous curve (a figure that loops, like a commute), so that its
 * position is a function of the time alone
 */
interface Phone {
    deviceId: string
    carrier: string
    phoneType: PhoneType
    technology: Technology
    city: string
    // the curve's half-widths (km, east and north), its angular speeds (radians per second), and
    // its phases
    amplitude: [east: number, north: number]
    speed: [east: number, north: number]
    phase: [east: number, north: number]
}

// the phones: two for each of each city's carriers
const PHONES_LIST: Array<Phone> = CITIES.flatMap(({code, carriers}) => carriers.flatMap(carrier => Array.from({length: 2}, () => {
    const phoneType = weightedRandomOf(PHONE_TYPES)
    return {
        deviceId: `dev-${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`,
        carrier: carrier.name,
        phoneType,
        technology: phoneType === 'Feature phone' ? '3G' : weightedRandomOf<Technology>([['5G', 0.5], ['LTE', 0.42], ['3G', 0.08]]),
        city: code,
        amplitude: [1 + Math.random() * 3, 1 + Math.random() * 3],
        // (sped up, so that the phones can be seen moving: a loop takes a few minutes)
        speed: [0.02 + Math.random() * 0.04, 0.02 + Math.random() * 0.04],
        phase: [Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI],
    }
})))

/**
 * @param phone A phone
 * @param time A time (ms)
 * @return Where the phone is ([longitude, latitude]) at the time
 */
function phonePositionAt(phone: Phone, time: number): [number, number] {
    const [longitude, latitude] = CITY_CENTERS.get(phone.city)!
    const seconds = time / 1000
    const east = phone.amplitude[0] * Math.sin(phone.speed[0] * seconds + phone.phase[0])
    const north = phone.amplitude[1] * Math.sin(phone.speed[1] * seconds + phone.phase[1])
    return [longitude + east / kmPerDegreeOfLongitude(latitude), latitude + north / KM_PER_DEGREE]
}

/**
 * @param from A [longitude, latitude]
 * @param to Another [longitude, latitude], nearby (within a city)
 * @return The distance (km) between them
 */
function kmBetween([fromLongitude, fromLatitude]: [number, number], [toLongitude, toLatitude]: [number, number]): number {
    const east = (toLongitude - fromLongitude) * kmPerDegreeOfLongitude((fromLatitude + toLatitude) / 2)
    const north = (toLatitude - fromLatitude) * KM_PER_DEGREE
    return Math.hypot(east, north)
}

// the number of its carrier's nearest towers that a phone measures (and is located from)
const MEASURED_TOWERS = 4
// how precise (km) the phones' distances from the towers are: the timing advance's steps, give or take
const DISTANCE_ERROR = 0.05
// a phone's location is dropped when it's expected to be off by more than this (km)
const MAX_FIX_ERROR = 0.3

/**
 * @param from A [longitude, latitude]
 * @param to Another, nearby (within a city)
 * @return The bearing (degrees, clockwise from north, 0 to 360) of `to`, seen from `from`
 */
function bearingBetween([fromLongitude, fromLatitude]: [number, number], [toLongitude, toLatitude]: [number, number]): number {
    const east = (toLongitude - fromLongitude) * kmPerDegreeOfLongitude((fromLatitude + toLatitude) / 2)
    const north = (toLatitude - fromLatitude) * KM_PER_DEGREE
    return (Math.atan2(east, north) * 180 / Math.PI + 360) % 360
}

// the width (degrees) of a tower's sectors (three antennas, each covering a third of the circle)
const SECTOR_WIDTH = 120
// how far (degrees) outside its serving sector a phone's location can be before it's taken to be
// wrong (the edges of a sector overlap the next, and the location is a little off)
const SECTOR_SLACK = 15

/**
 * @param bearing A bearing (degrees) from a tower
 * @return The tower's sector that covers it: 1, 2, or 3
 */
const sectorOf = (bearing: number): number => 1 + Math.floor(bearing / SECTOR_WIDTH) % 3

/**
 * @param bearing A bearing (degrees) from a tower
 * @param sector One of the tower's sectors
 * @return Whether the bearing is in the sector, or within SECTOR_SLACK of it
 */
function inSector(bearing: number, sector: number): boolean {
    const middle = (sector - 0.5) * SECTOR_WIDTH
    const offset = Math.abs(((bearing - middle) % 360 + 540) % 360 - 180)
    return offset <= SECTOR_WIDTH / 2 + SECTOR_SLACK
}

/**
 * Estimates a place by trilateration: from three or more known places (e.g. towers), and the
 * distances to each (e.g. a phone's, from the timing advance), the place whose distances best match
 * them, by least squares, on a plane tangent to the earth at the first place (near enough within a
 * city). A first estimate, from the linear equations that the differences between the circles'
 * equations make, is refined by a few steps of Gauss-Newton on the distances themselves.
 *
 * How precise the place is depends on how the known places surround it, as well as on how precise
 * the distances are: places all on one side of it (or nearly in a line) pin it down poorly, and
 * small errors in the distances move it far. That's its *dilution of precision*: how many times the
 * distances' error the place's error is (at the root mean square).
 * @param references The known places ([longitude, latitude]), and the distances (km) to each
 * @return The estimated place ([longitude, latitude]), how far (km), at the root mean square, its
 * distances are from the ones given (the residual), and its dilution of precision; or `undefined`
 * with fewer than three places, or places that (nearly) line up, which can't fix a place
 */
export function trilaterate(
    references: Array<{location: [longitude: number, latitude: number], distance: number}>
): {location: [number, number], residual: number, dilution: number} | undefined {
    if (references.length < 3) return undefined
    const [longitude0, latitude0] = references[0].location
    const eastKm = kmPerDegreeOfLongitude(latitude0)
    // the places on the tangent plane (km east and north of the first)
    const points = references.map(({location: [longitude, latitude], distance}) =>
        ({x: (longitude - longitude0) * eastKm, y: (latitude - latitude0) * KM_PER_DEGREE, distance}))

    /**
     * Solves the 2x2 system [[aa, ab], [ab, bb]] [x, y] = [ac, bc]
     * @return The solution, or `undefined` when the system is (nearly) singular
     */
    const solve = (aa: number, ab: number, bb: number, ac: number, bc: number): [number, number] | undefined => {
        const determinant = aa * bb - ab * ab
        if (!(Math.abs(determinant) > 1e-9 * (aa * bb + 1e-12))) return undefined
        return [(ac * bb - bc * ab) / determinant, (bc * aa - ac * ab) / determinant]
    }

    // the first estimate: subtracting the first circle's equation from each of the others' leaves
    // linear equations, a x + b y = c, solved by least squares (the 2x2 normal equations)
    const [first, ...others] = points
    let aa = 0, ab = 0, bb = 0, ac = 0, bc = 0
    others.forEach(({x, y, distance}) => {
        const a = 2 * (x - first.x)
        const b = 2 * (y - first.y)
        const c = first.distance ** 2 - distance ** 2 + x ** 2 - first.x ** 2 + y ** 2 - first.y ** 2
        aa += a * a
        ab += a * b
        bb += b * b
        ac += a * c
        bc += b * c
    })
    const estimate = solve(aa, ab, bb, ac, bc)
    if (estimate === undefined) return undefined
    let [x, y] = estimate

    // refined by Gauss-Newton: each step moves the place by the least-squares solution of the
    // distances' errors, linearized about it (by the unit vectors from the places to it)
    let normal = {aa: 0, ab: 0, bb: 0}
    for (let step = 0; step < 5; step++) {
        let jaa = 0, jab = 0, jbb = 0, jar = 0, jbr = 0
        points.forEach(point => {
            const range = Math.max(1e-6, Math.hypot(x - point.x, y - point.y))
            const ux = (x - point.x) / range
            const uy = (y - point.y) / range
            const error = range - point.distance
            jaa += ux * ux
            jab += ux * uy
            jbb += uy * uy
            jar += ux * error
            jbr += uy * error
        })
        normal = {aa: jaa, ab: jab, bb: jbb}
        const delta = solve(jaa, jab, jbb, -jar, -jbr)
        if (delta === undefined) return undefined
        x += delta[0]
        y += delta[1]
        if (Math.hypot(delta[0], delta[1]) < 1e-6) break
    }

    // the dilution of precision: the root of the trace of the inverse of the normal matrix
    const determinant = normal.aa * normal.bb - normal.ab * normal.ab
    const dilution = determinant > 0 ? Math.sqrt((normal.aa + normal.bb) / determinant) : Infinity
    const residual = Math.sqrt(points.reduce(
        (sum, point) => sum + (Math.hypot(x - point.x, y - point.y) - point.distance) ** 2,
        0
    ) / points.length)
    return {location: [longitude0 + x / eastKm, latitude0 + y / KM_PER_DEGREE], residual, dilution}
}

/**
 * @param distance A phone's distance (km) from a tower
 * @return The tower's signal strength (RSRP, dBm) at the phone: weaker with distance, and with the
 * walls in between (a random loss, as if the phone were indoors, now and then)
 */
function signalStrengthAt(distance: number): number {
    const indoors = Math.random() < 0.3 ? 10 + Math.random() * 15 : 0
    const strength = -65 - 30 * Math.log10(distance + 0.05) - indoors + d3.randomNormal(0, 6)()
    return Math.round(Math.max(-140, Math.min(-44, strength)))
}

/**
 * @param signalStrength A signal's strength (dBm)
 * @return Its quality (SINR, dB): better for a stronger signal, give or take
 */
const signalQualityOf = (signalStrength: number): number =>
    Math.round(Math.max(-10, Math.min(30, 25 + (signalStrength + 80) / 2.5 + d3.randomNormal(0, 3)())) * 10) / 10

/**
 * @param signalStrength The serving tower's signal strength (dBm)
 * @return What the phone's ping to its serving tower was for (a weak signal drops calls)
 */
function servingEventOf(signalStrength: number): PingEvent {
    if (signalStrength < -110 && Math.random() < 0.3) return 'call drop'
    return weightedRandomOf<PingEvent>([['data', 0.5], ['call', 0.17], ['sms', 0.15], ['handover', 0.12], ['call drop', 0.06]])
}

// the number of phones that report at each tick
const REPORTS_PER_TICK = 10

/**
 * The events that the network sees at one moment (one tick of the generator): ten phones' reports,
 * each a ping to the tower serving the phone (its carrier's nearest in its city), and the phone's
 * location, trilaterated from the measurements of its carrier's four nearest towers that it reports
 * with the ping
 * @param time The time of the events (ms)
 * @return The new events, by series (the pings by their carriers, the locations as the phones')
 */
export function cellEventsAt(time: number): Map<string, Array<GeoDatum<CellEvent>>> {
    const events = new Map<string, Array<GeoDatum<CellEvent>>>(SERIES_NAMES.map(name => [name, []]))
    // (different phones: a phone reports once a tick at most)
    const reporting = new Set<Phone>()
    while (reporting.size < Math.min(REPORTS_PER_TICK, PHONES_LIST.length)) reporting.add(randomOf(PHONES_LIST))
    reporting.forEach(phone => reportOf(phone, time, events))
    return events
}

/**
 * A phone's report: its ping to the tower serving it, and its location, trilaterated from its
 * measurements of its carrier's nearest towers
 * @param phone The phone
 * @param time The time of the report (ms)
 * @param events The events so far, by series (the report's are added to them)
 */
function reportOf(phone: Phone, time: number, events: Map<string, Array<GeoDatum<CellEvent>>>): void {
    const position = phonePositionAt(phone, time)
    const nearest = (TOWERS_BY_CARRIER_AND_CITY.get(`${phone.carrier}|${phone.city}`) ?? [])
        .map(tower => ({tower, distance: kmBetween(position, tower.location)}))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, MEASURED_TOWERS)

    // the phone's measurements of the towers: their distances (the timing advance measures the
    // distance in steps of about 78 m, give or take)
    const reported = nearest.map(({tower, distance}) => ({
        location: tower.location,
        distance: Math.round(Math.max(0.03, Math.round((distance + d3.randomNormal(0, DISTANCE_ERROR)()) / 0.078) * 0.078) * 100) / 100,
    }))

    // the ping to the serving tower (the nearest), through the sector facing the phone
    const sector = nearest.length > 0 ? sectorOf(bearingBetween(nearest[0].tower.location, position)) : 0
    if (nearest.length > 0) {
        const {tower, distance} = nearest[0]
        const signalStrength = signalStrengthAt(distance)
        events.get(phone.carrier)?.push(geoDatumOf<CellEvent>(tower.id, tower.location[1], tower.location[0], time, {
            kind: 'ping',
            carrier: phone.carrier,
            deviceId: phone.deviceId,
            phoneType: phone.phoneType,
            technology: phone.technology,
            band: randomOf(BANDS[phone.technology]),
            sector,
            event: servingEventOf(signalStrength),
            signalStrength,
            signalQuality: signalQualityOf(signalStrength),
            distance: reported[0].distance,
            phoneLatitude: position[1],
            phoneLongitude: position[0],
        }))
    }

    // (a fix is dropped, as a network would drop it, rather than shown somewhere misleading, when
    // it's expected to be off by more than MAX_FIX_ERROR, or when it isn't in the sector of the
    // serving tower that the phone pinged through -- the towers' distances can fit a place on the
    // wrong side of them, a mirror image of the right one, when they're nearly in a line)
    const fix = trilaterate(reported)
    const accuracy = fix === undefined ? Infinity : Math.max(fix.residual, DISTANCE_ERROR * fix.dilution)
    const consistent = fix !== undefined && nearest.length > 0 &&
        inSector(bearingBetween(nearest[0].tower.location, fix.location), sector)
    if (fix !== undefined && consistent && accuracy <= MAX_FIX_ERROR) {
        const [longitude, latitude] = fix.location
        events.get(PHONES)?.push(geoDatumOf<CellEvent>(phone.deviceId, latitude, longitude, time, {
            kind: 'fix',
            carrier: phone.carrier,
            deviceId: phone.deviceId,
            phoneType: phone.phoneType,
            towers: reported.length,
            accuracy: Math.round(accuracy * 1000),
            phoneLatitude: position[1],
            phoneLongitude: position[0],
        }))
    }
}

/**
 * Creates the observable of the network's events: every update period, the events the network sees
 * at the current time (the start time plus the wall-clock time elapsed since starting)
 * @param updatePeriod The time (ms) between ticks
 * @param startTime The time from which the events' times continue (e.g. the latest existing time)
 * @return The observable of geo chart data
 */
export function cellTowerDataObservable(updatePeriod: number, startTime: number = 0): Observable<GeoChartData<CellEvent>> {
    // wall-clock elapsed time, rather than counting ticks (see randomOutlierDataObservable)
    const subscribeTime = performance.now()
    return interval(updatePeriod).pipe(
        map(() => geoChartDataOf(cellEventsAt(startTime + (performance.now() - subscribeTime))))
    )
}

/**
 * Creates the example's initial data: the series, holding the events the network would have seen
 * over the specified time
 * @param updatePeriod The time (ms) between ticks
 * @param duration How much history (ms) to create
 * @return The initial series
 */
export function initialCellTowerData(updatePeriod: number, duration: number): Array<GeoSeries<CellEvent>> {
    const series = new Map(SERIES_NAMES.map(name => [name, [] as Array<GeoDatum<CellEvent>>]))
    for (let time = updatePeriod; time <= duration; time += updatePeriod) {
        cellEventsAt(time).forEach((events, name) => series.get(name)?.push(...events))
    }
    return SERIES_NAMES.map(name => geoSeriesFrom<CellEvent>(name, series.get(name) ?? []))
}
