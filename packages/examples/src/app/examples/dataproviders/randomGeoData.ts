import {interval, type Observable} from "rxjs"
import {map} from "rxjs/operators"
import * as d3 from "d3"
import {type GeoChartData, geoChartDataOf, type GeoDatum, geoDatumOf, type GeoSeries, geoSeriesFrom} from "stream-charts"

/*
    A random network of sensors around the world, for the geo example:
    - seismic stations, two or three sensors at each site (so one quake is often reported by
      several sensors at the same place), around the Pacific "Ring of Fire" and other active zones
    - weather stations, one per city
    - vessels, moving sensors that sail back and forth along shipping routes, reporting as they go
 */

/**
 * The kind of sensor that reported an event
 */
export type SensorKind = 'seismic' | 'weather' | 'vessel'

/**
 * How serious a reading is
 */
export type SensorStatus = 'ok' | 'warning' | 'alarm'

/**
 * What a sensor reports with each event (the events' payload): the magnitude of a quake, a wind
 * speed (m/s), or a vessel's speed (knots), and how serious that is
 */
export interface SensorReading {
    kind: SensorKind
    magnitude: number
    status: SensorStatus
}

export const SEISMIC = "Seismic"
export const WEATHER = "Weather"
export const VESSELS = "Vessels"
export const SERIES_NAMES = [SEISMIC, WEATHER, VESSELS]

// a place with sensors: its code, and its [longitude, latitude]
type Site = { code: string, location: [longitude: number, latitude: number], sensors: number }

const SEISMIC_SITES: Array<Site> = [
    {code: "TKY", location: [139.69, 35.68], sensors: 3},
    {code: "SND", location: [140.87, 38.27], sensors: 2},
    {code: "PKC", location: [158.65, 53.02], sensors: 2},
    {code: "ANC", location: [-149.90, 61.22], sensors: 3},
    {code: "SEA", location: [-122.33, 47.61], sensors: 2},
    {code: "SFO", location: [-122.42, 37.77], sensors: 3},
    {code: "LAX", location: [-118.24, 34.05], sensors: 3},
    {code: "MEX", location: [-99.13, 19.43], sensors: 2},
    {code: "UIO", location: [-78.47, -0.18], sensors: 2},
    {code: "LIM", location: [-77.04, -12.05], sensors: 2},
    {code: "SCL", location: [-70.67, -33.45], sensors: 3},
    {code: "WLG", location: [174.78, -41.29], sensors: 2},
    {code: "JKT", location: [106.85, -6.21], sensors: 2},
    {code: "MNL", location: [120.98, 14.60], sensors: 2},
    {code: "TPE", location: [121.57, 25.03], sensors: 2},
    {code: "REK", location: [-21.94, 64.15], sensors: 2},
    {code: "NAP", location: [14.27, 40.85], sensors: 2},
    {code: "IST", location: [28.98, 41.01], sensors: 2},
    {code: "THR", location: [51.39, 35.69], sensors: 2},
    {code: "KTM", location: [85.32, 27.72], sensors: 2},
]

const WEATHER_STATIONS: Array<Site> = [
    {code: "LON", location: [-0.13, 51.51], sensors: 1},
    {code: "PAR", location: [2.35, 48.86], sensors: 1},
    {code: "BER", location: [13.40, 52.52], sensors: 1},
    {code: "MAD", location: [-3.70, 40.42], sensors: 1},
    {code: "MOW", location: [37.62, 55.76], sensors: 1},
    {code: "CAI", location: [31.24, 30.04], sensors: 1},
    {code: "LOS", location: [3.38, 6.52], sensors: 1},
    {code: "NBO", location: [36.82, -1.29], sensors: 1},
    {code: "JNB", location: [28.05, -26.20], sensors: 1},
    {code: "DXB", location: [55.27, 25.20], sensors: 1},
    {code: "BOM", location: [72.88, 19.08], sensors: 1},
    {code: "DEL", location: [77.21, 28.61], sensors: 1},
    {code: "PEK", location: [116.41, 39.90], sensors: 1},
    {code: "SHA", location: [121.47, 31.23], sensors: 1},
    {code: "SIN", location: [103.82, 1.35], sensors: 1},
    {code: "SYD", location: [151.21, -33.87], sensors: 1},
    {code: "PER", location: [115.86, -31.95], sensors: 1},
    {code: "AKL", location: [174.76, -36.85], sensors: 1},
    {code: "HNL", location: [-157.86, 21.31], sensors: 1},
    {code: "YVR", location: [-123.12, 49.28], sensors: 1},
    {code: "CHI", location: [-87.63, 41.88], sensors: 1},
    {code: "NYC", location: [-74.01, 40.71], sensors: 1},
    {code: "MIA", location: [-80.19, 25.76], sensors: 1},
    {code: "BOG", location: [-74.07, 4.71], sensors: 1},
    {code: "SAO", location: [-46.63, -23.55], sensors: 1},
    {code: "BUE", location: [-58.38, -34.60], sensors: 1},
]

// a shipping route between two ports ([longitude, latitude]), and the vessels sailing it
type Route = { from: [number, number], to: [number, number], vessels: number }

const ROUTES: Array<Route> = [
    {from: [4.48, 51.92], to: [-74.01, 40.71], vessels: 2},        // Rotterdam - New York
    {from: [121.47, 31.23], to: [-118.24, 33.74], vessels: 2},     // Shanghai - Los Angeles
    {from: [129.04, 35.10], to: [-123.12, 49.28], vessels: 1},     // Busan - Vancouver
    {from: [103.82, 1.35], to: [79.86, 6.93], vessels: 1},         // Singapore - Colombo
    {from: [79.86, 6.93], to: [43.15, 11.59], vessels: 1},         // Colombo - Djibouti
    {from: [-46.33, -23.96], to: [18.42, -33.92], vessels: 1},     // Santos - Cape Town
    {from: [151.21, -33.87], to: [174.76, -36.85], vessels: 1},    // Sydney - Auckland
    {from: [-79.57, 8.95], to: [-77.15, -12.05], vessels: 1},      // Balboa - Callao
]

// how long (ms) a vessel takes to sail its route one way (sped up, so that the vessels can be
// seen moving)
const VOYAGE_TIME = 120_000

// the vessels: their IDs, their routes' great-circle interpolators, and where on their voyage
// they start (so that they're spread out along the routes)
const VESSELS_ON_ROUTES = ROUTES.flatMap((route, routeIndex) =>
    Array.from({length: route.vessels}, (_, index) => ({
        id: `V-${routeIndex + 1}${String.fromCharCode(65 + index)}`,
        interpolate: d3.geoInterpolate(route.from, route.to),
        phase: (index + 0.3 * routeIndex) / route.vessels,
    }))
)

const statusOf = (value: number, warning: number, alarm: number): SensorStatus =>
    value >= alarm ? 'alarm' : value >= warning ? 'warning' : 'ok'

const randomOf = <T>(items: Array<T>): T => items[Math.floor(Math.random() * items.length)]

/**
 * The events that the sensor network reports at one moment (one tick of the generator)
 * @param time The time of the events (ms)
 * @return The new events, by series
 */
export function sensorEventsAt(time: number): Map<string, Array<GeoDatum<SensorReading>>> {
    const seismic: Array<GeoDatum<SensorReading>> = []
    const weather: Array<GeoDatum<SensorReading>> = []
    const vessels: Array<GeoDatum<SensorReading>> = []

    // a quake near a seismic site, reported by some (at least one) of the site's sensors, each
    // measuring a slightly different magnitude (roughly Gutenberg-Richter: small quakes are common)
    if (Math.random() < 0.25) {
        const site = randomOf(SEISMIC_SITES)
        const magnitude = 1 + d3.randomExponential(1.1)()
        const first = Math.floor(Math.random() * site.sensors)
        for (let sensor = 0; sensor < site.sensors; sensor++) {
            if (sensor !== first && Math.random() > 0.6) continue
            const measured = Math.max(0.5, magnitude + d3.randomNormal(0, 0.15)())
            seismic.push(geoDatumOf(
                `${site.code}-${sensor + 1}`, site.location[1], site.location[0], time,
                {kind: 'seismic', magnitude: Math.round(measured * 10) / 10, status: statusOf(measured, 3.5, 5)}
            ))
        }
    }

    // a wind-speed reading (m/s) from a weather station
    if (Math.random() < 0.3) {
        const station = randomOf(WEATHER_STATIONS)
        const windSpeed = d3.randomGamma(2, 4)()
        weather.push(geoDatumOf(
            `${station.code}-1`, station.location[1], station.location[0], time,
            {kind: 'weather', magnitude: Math.round(windSpeed * 10) / 10, status: statusOf(windSpeed, 20, 30)}
        ))
    }

    // a position report from a vessel, with its speed (knots): back and forth along its route
    if (Math.random() < 0.4) {
        const vessel = randomOf(VESSELS_ON_ROUTES)
        const voyage = (time / VOYAGE_TIME + vessel.phase) % 2
        const [longitude, latitude] = vessel.interpolate(voyage < 1 ? voyage : 2 - voyage)
        const speed = 12 + d3.randomNormal(0, 3)()
        vessels.push(geoDatumOf(
            vessel.id, latitude, longitude, time,
            {kind: 'vessel', magnitude: Math.round(speed * 10) / 10, status: statusOf(speed, 18, 21)}
        ))
    }

    return new Map([[SEISMIC, seismic], [WEATHER, weather], [VESSELS, vessels]])
}

/**
 * Creates the observable of sensor events: every update period, the events the network reports at
 * the current time (the start time plus the wall-clock time elapsed since starting)
 * @param updatePeriod The time (ms) between ticks
 * @param startTime The time from which the events' times continue (e.g. the latest existing time)
 * @return The observable of geo chart data
 */
export function randomGeoDataObservable(updatePeriod: number, startTime: number = 0): Observable<GeoChartData<SensorReading>> {
    // wall-clock elapsed time, rather than counting ticks (see randomOutlierDataObservable)
    const subscribeTime = performance.now()
    return interval(updatePeriod).pipe(
        map(() => geoChartDataOf(sensorEventsAt(startTime + (performance.now() - subscribeTime))))
    )
}

/**
 * Creates the example's initial data: the three series, holding the events the network would have
 * reported over the specified time
 * @param updatePeriod The time (ms) between ticks
 * @param duration How much history (ms) to create
 * @return The initial series
 */
export function initialGeoData(updatePeriod: number, duration: number): Array<GeoSeries<SensorReading>> {
    const series = new Map(SERIES_NAMES.map(name => [name, [] as Array<GeoDatum<SensorReading>>]))
    for (let time = updatePeriod; time <= duration; time += updatePeriod) {
        sensorEventsAt(time).forEach((events, name) => series.get(name)?.push(...events))
    }
    return SERIES_NAMES.map(name => geoSeriesFrom<SensorReading>(name, series.get(name) ?? []))
}
