### tutorial: your own geo chart, from sensor events

The scatter-chart tutorial built a chart of readings over time. This one builds a chart of readings over *space*: events from sensors at places on the earth, on a map. Along the way, we'll cover the things a geo chart brings:

- **events that carry a place**, and a payload of whatever the sensor reported,
- **sensors that stay put, and sensors that move**,
- **a map**, which you bring yourself, in the projection you want, starting on the region you care about,
- **roll-ups** – the events aggregated by place, by sensor, or by the cells of a grid – kept up to date as events arrive and age out, and
- **a tooltip** that works while the data streams.

Our sensors measure air quality – fine particulate matter, PM2.5, in µg/m³ – across Europe: two or three monitors in each of eight cities, and two monitors riding trains between cities. By the end, you'll have the chart, and you'll know where to plug in your real sensors.

The code imports the library from the `stream-charts` package, just as your own application would. Every piece of it was run as you see it here.

#### step 1: the readings

Each message from a monitor is one reading:

```ts
export type AirQualityReading = {
    sensor: string        // which monitor (e.g. "paris-2", or "train-1")
    city?: string         // the city a fixed monitor is in
    latitude: number      // where the reading was taken
    longitude: number
    time: number          // when (ms since the session started)
    pm25: number          // fine particulate matter, in µg/m³
}
```

Until the real monitors are wired up, we'll simulate them. Each city's monitors sit a little apart, around the city's center, and each city has its own typical air quality. The trains ride back and forth between two cities, along the great circle between them:

```ts
import {interval, type Observable} from "rxjs";
import {filter, map} from "rxjs/operators";
import * as d3 from "d3";

export const SESSION_START = Date.now()

// the cities, with their centers ([longitude, latitude]), how many monitors each has, and how
// polluted their air usually is
const CITIES: Array<{city: string, center: [number, number], monitors: number, typical: number}> = [
    {city: "Paris", center: [2.35, 48.86], monitors: 3, typical: 14},
    {city: "London", center: [-0.13, 51.51], monitors: 3, typical: 11},
    {city: "Berlin", center: [13.40, 52.52], monitors: 2, typical: 13},
    {city: "Madrid", center: [-3.70, 40.42], monitors: 2, typical: 10},
    {city: "Milan", center: [9.19, 45.46], monitors: 3, typical: 26},
    {city: "Rome", center: [12.50, 41.90], monitors: 2, typical: 15},
    {city: "Warsaw", center: [21.01, 52.23], monitors: 2, typical: 22},
    {city: "Athens", center: [23.73, 37.98], monitors: 2, typical: 18},
]
export const CITY_CENTERS = new Map(CITIES.map(({city, center}) => [city, center]))

// each city's monitors, spread around its center
const MONITORS = CITIES.flatMap(({city, center: [longitude, latitude], monitors, typical}) =>
    Array.from({length: monitors}, (_, index) => ({
        sensor: `${city.toLowerCase()}-${index + 1}`,
        city,
        latitude: latitude + (Math.random() - 0.5) * 0.08,
        longitude: longitude + (Math.random() - 0.5) * 0.12,
        typical,
    }))
)

// monitors on trains, which ride back and forth between two cities in 20 minutes
const TRAINS = [
    {sensor: "train-1", route: d3.geoInterpolate([2.35, 48.86], [13.40, 52.52])},   // Paris - Berlin
    {sensor: "train-2", route: d3.geoInterpolate([9.19, 45.46], [12.50, 41.90])},   // Milan - Rome
]
const TRIP = 20 * 60_000
```

Every quarter of a second, the simulation reports a reading from a random city monitor (most of the time), or, now and then, from a train:

```ts
/**
 * Simulated monitors: every 250 ms, a reading from a random city monitor (most of the time), and
 * now and then one from a train
 * @return The observable of readings
 */
export function simulatedReadings(): Observable<AirQualityReading> {
    return interval(250).pipe(
        map((): AirQualityReading | undefined => {
            const time = Date.now() - SESSION_START
            if (Math.random() < 0.8) {
                const monitor = MONITORS[Math.floor(Math.random() * MONITORS.length)]
                const pm25 = Math.max(1, monitor.typical * d3.randomLogNormal(0, 0.45)())
                return {...monitor, time, pm25: Math.round(pm25 * 10) / 10}
            }
            if (Math.random() < 0.5) {
                const train = TRAINS[Math.floor(Math.random() * TRAINS.length)]
                const leg = (time / TRIP) % 2
                const [longitude, latitude] = train.route(leg < 1 ? leg : 2 - leg)
                return {sensor: train.sensor, latitude, longitude, time, pm25: Math.round(d3.randomUniform(4, 30)() * 10) / 10}
            }
            return undefined
        }),
        filter((reading): reading is AirQualityReading => reading !== undefined)
    )
}
```

#### step 2: from readings to chart data

A geo chart's data is a stream of `GeoChartData`: chunks of *events*, by series. An event – a `GeoDatum` – is a sensor ID, a latitude and longitude, a time, and a *payload*, which is whatever you want to keep about the event. Ours keeps the reading, the city (for a city monitor), and the reading's level:

```ts
export type AirQuality = {
    pm25: number
    city?: string
    level: 'good' | 'moderate' | 'unhealthy'
}

export const CITY_MONITORS = "City monitors"
export const TRAIN_MONITORS = "Train monitors"

const levelOf = (pm25: number): AirQuality['level'] => pm25 <= 15 ? 'good' : pm25 <= 35 ? 'moderate' : 'unhealthy'
```

A series is a group of sensors, with its own color and legend entry. We'll have two: the city monitors and the train monitors. Each event's sensor ID says which monitor in the group reported it.

The readings arrive one at a time, so we batch them (redrawing for every single reading would be wasteful), sort each batch by time, and turn it into chart data. `geoDatumOf` creates an event, and `geoChartDataOf` creates the chart data, filling in the series' names:

```ts
import {bufferTime} from "rxjs/operators";
import {type GeoChartData, geoChartDataOf, type GeoDatum, geoDatumOf} from "stream-charts";

/**
 * Batches the readings, and turns each batch into chart data: the readings, by series, as geo events
 * @param readings The readings
 * @return The chart data
 */
export function toChartData(readings: Observable<AirQualityReading>): Observable<GeoChartData<AirQuality>> {
    return readings.pipe(
        bufferTime(500),
        filter(batch => batch.length > 0),
        map(batch => {
            const newPoints = new Map<string, Array<GeoDatum<AirQuality>>>()
            batch
                .sort((a, b) => a.time - b.time)
                .forEach(reading => {
                    const series = reading.city !== undefined ? CITY_MONITORS : TRAIN_MONITORS
                    const event = geoDatumOf<AirQuality>(
                        reading.sensor, reading.latitude, reading.longitude, reading.time,
                        {pm25: reading.pm25, city: reading.city, level: levelOf(reading.pm25)}
                    )
                    newPoints.set(series, [...(newPoints.get(series) ?? []), event])
                })
            return geoChartDataOf(newPoints)
        })
    )
}
```

Each series' events must be in time order: the data source drops old events from the front of each series. That's what the sort is for.

#### step 3: the data source, with its roll-ups

The data source holds the events, and drops them once they're ten minutes old. It also keeps *roll-ups*: the events aggregated by place. Each roll-up puts every event into a cell, and keeps, for each cell, the count of its events and sensors, its *measures*, and a breakdown by group. We'll keep three:

```ts
import * as d3 from "d3";
import {byGridCell, bySensor, GeoDataSource, geoSeriesFrom, maxOf, meanOf, measureOf, reduceOf} from "stream-charts";

const pm25 = (datum: GeoDatum<AirQuality>): number => datum.payload.pm25

// a measure of our own, from all of a cell's readings at once: the median (which, unlike a sum,
// can't take a reading back out, so it's recalculated from the readings when they've changed)
const medianPm25 = measureOf<AirQuality>(readings => d3.median(readings, pm25) ?? NaN)

// a measure of our own that can take a reading back out, so it's kept as readings come and go:
// the share of the readings that are unhealthy
const unhealthyShare = reduceOf<AirQuality, {readings: number, unhealthy: number}>({
    initial: () => ({readings: 0, unhealthy: 0}),
    add: ({readings, unhealthy}, datum) =>
        ({readings: readings + 1, unhealthy: unhealthy + (datum.payload.level === 'unhealthy' ? 1 : 0)}),
    remove: ({readings, unhealthy}, datum) =>
        ({readings: readings - 1, unhealthy: unhealthy - (datum.payload.level === 'unhealthy' ? 1 : 0)}),
    value: ({readings, unhealthy}) => readings > 0 ? unhealthy / readings : NaN,
})

export const airQualityDataSource = new GeoDataSource<AirQuality>({
    initialData: [geoSeriesFrom<AirQuality>(CITY_MONITORS), geoSeriesFrom<AirQuality>(TRAIN_MONITORS)],
    generator: (): Observable<GeoChartData<AirQuality>> => toChartData(simulatedReadings()),
    dropDataAfter: 10 * 60_000,
    rollups: {
        // each city's readings, from all its monitors, at the city's center, broken down by monitor
        "by city": {
            cellOf: (datum): {id: string, latitude: number, longitude: number} => {
                const [longitude, latitude] = CITY_CENTERS.get(datum.payload.city ?? '') ?? [datum.longitude, datum.latitude]
                return {id: datum.payload.city ?? datum.sensorId, latitude, longitude}
            },
            filter: (_datum, seriesName): boolean => seriesName === CITY_MONITORS,
            groupBy: (datum): string => datum.sensorId,
            measures: {
                "mean PM2.5": meanOf(pm25),
                "median PM2.5": medianPm25,
                "peak PM2.5": maxOf(pm25),
                "unhealthy share": unhealthyShare,
            },
        },
        // each monitor's readings, where the monitor last was (the trains move)
        "by monitor": {
            cellOf: bySensor({position: 'latest'}),
            measures: {"mean PM2.5": meanOf(pm25), "peak PM2.5": maxOf(pm25)},
        },
        // only the unhealthy readings, in the cells of a 2° grid
        "unhealthy": {
            cellOf: byGridCell(2),
            filter: (datum): boolean => datum.payload.level === 'unhealthy',
            measures: {"peak PM2.5": maxOf(pm25)},
        },
    },
})
```

- **"by city"** puts each city monitor's readings in its city's cell, drawn at the city's center. The cells are ours to choose: `cellOf` is a function here, giving each event's cell ID and the cell's position. (The library's `byLocation(precision)` would put the events at the same place in one cell, but a city's monitors aren't at the same place.) The `filter` leaves out the trains, and `groupBy` breaks each city down by monitor.
- **"by monitor"** puts each monitor's readings in a cell of its own – `bySensor` – drawn where the monitor last was. A train's cell moves with the train.
- **"unhealthy"** keeps only the unhealthy readings, in the cells of a 2° by 2° grid – `byGridCell(2)` – which can be drawn as areas.

The library's measures – `meanOf` and `maxOf` here, and also `countOf`, `sumOf`, `minOf`, and `latestOf` – take a function that gives an event's value. And when none of them is what you need, you write your own, in one of two ways:

- **`reduceOf`**, for a measure that can take an event back out. It keeps a *state* – here, the number of readings, and how many of them were unhealthy – which `add` updates as each reading arrives and `remove` as each one leaves, and `value` turns into the measure: the "unhealthy share". It costs the same however many readings a city has, so prefer it whenever you can undo what an event added (sums, counts, means, and the moments behind a standard deviation all can).
- **`measureOf`**, for a measure that can't – like the median: taking one reading out can move the median anywhere. It's handed all of a cell's readings at once. It's only recalculated for a cell whose readings changed, and only when the chart next draws it, but then over all of the cell's readings, so keep it for the measures that need it.

Your measures are measures like any other: the tooltip lists them, the breakdown by group has them too, and `sizeBy` and `colorBy` can use them. The data source keeps the roll-ups up to date as events arrive *and as they're dropped*, so a roll-up always covers exactly the events the data source holds – and it keeps up while the chart is off screen, too.

Unlike the time-series data source, the geo data source adds a series the first time it shows up in the stream, so the initial series are optional. We start with both, so the legend shows them from the start.

#### step 4: the map

The library doesn't come with a map – you bring the land and borders you want, at the level of detail you want, as GeoJSON. We'll use the [world-atlas](https://github.com/topojson/world-atlas) package's 1:50m countries (the 1:110m ones are coarse for a continent), converted from TopoJSON with [topojson-client](https://github.com/topojson/topojson-client):

```sh
npm install world-atlas topojson-client
npm install --save-dev @types/topojson-client
```

```ts
import {feature, mesh} from "topojson-client";
import type {GeometryCollection, Topology} from "topojson-specification";
import countries50m from "world-atlas/countries-50m.json";
import type {GeoPlotViewState} from "stream-charts";

type World = Topology<{countries: GeometryCollection, land: GeometryCollection}>
const world = countries50m as unknown as World
const LAND = feature(world, world.objects.land)
const BORDERS = mesh(world, world.objects.countries, (a, b) => a !== b)

// the view: it starts centered on Europe, zoomed in 4x, and is kept here as it changes, so that
// it survives the chart being unmounted (any store would do)
const EUROPE_CENTER: [number, number] = [12, 50]
const saved: {view: GeoPlotViewState} = {view: {rotate: [-12, -50, 0], k: 4, offsetY: 0}}
```

`LAND` is the land, which the plot fills, and `BORDERS` the borders between countries (each border once, without the coastlines), which it draws as lines. Importing the JSON needs `"resolveJsonModule": true` in your `tsconfig.json`.

For the projection, we'll use the Lambert azimuthal equal-area projection – the one the European Union uses for its statistics – centered on Europe. The plot shows the whole earth until you zoom in, so `saved.view` holds the view we start with: centered on 12° E, 50° N (a rotation of `[-12, -50, 0]`), zoomed in four times. The plot reports every change of view, and we keep the latest, so that the view survives the chart being unmounted (say, when the user switches tabs). Any store would do; a module-level object is the simplest.

#### step 5: the chart

The series' colors, a color scale for PM2.5 (green for clean air, through yellow, to red), and a formatter for the times:

```tsx
import * as d3 from "d3";
import {defaultLineStyle} from "stream-charts";

const SERIES_STYLES = new Map([
    [CITY_MONITORS, {...defaultLineStyle(), color: '#1f77b4', highlightColor: '#1f77b4'}],
    [TRAIN_MONITORS, {...defaultLineStyle(), color: '#9467bd', highlightColor: '#9467bd'}],
])

// green for clean air, through yellow, to red for unhealthy air
const pm25Colors = (t: number): string => d3.interpolateRdYlGn(1 - t)

// a time as "m:ss" into the session
const sessionTime = (time: number): string =>
    `${Math.floor(time / 60_000)}:${String(Math.floor(time % 60_000 / 1000)).padStart(2, '0')}`
```

And the chart itself, with a **Run**/**Pause** button, and a drop-down to switch between the readings and the roll-ups:

```tsx
import {type JSX, useState} from "react";
import {Chart, GeoPlot, GeoPlotTooltipContent, Legend, LegendLocation, Tooltip, useDataSourceRunning} from "stream-charts";

export function AirQualityMap(): JSX.Element {
    const running = useDataSourceRunning(airQualityDataSource)
    // the roll-up to show, or undefined to show each reading
    const [rollup, setRollup] = useState<string | undefined>(undefined)

    return (
        <div>
            <div style={{display: 'flex', gap: 12, marginBottom: 8}}>
                <button onClick={() => running ? airQualityDataSource.stop() : airQualityDataSource.start()}>
                    {running ? 'Pause' : 'Run'}
                </button>
                <select
                    value={rollup ?? 'readings'}
                    onChange={event => setRollup(event.target.value === 'readings' ? undefined : event.target.value)}
                >
                    <option value="readings">each reading</option>
                    {airQualityDataSource.rollupNames().map(name => <option key={name} value={name}>{name}</option>)}
                </select>
            </div>
            <Chart
                chartId={7}
                width={900}
                height={600}
                color="#333"
                backgroundColor="#fff"
                dataSource={airQualityDataSource}
                seriesStyles={SERIES_STYLES}
                windowingTime={500}
            >
                <GeoPlot<AirQuality>
                    projection="azimuthalEqualArea"
                    center={EUROPE_CENTER}
                    viewState={saved.view}
                    onViewChange={view => saved.view = view}
                    basemap={LAND}
                    borders={BORDERS}
                    radiusOf={datum => 2 + datum.payload.pm25 / 8}
                    fadeDuration={5 * 60_000}
                    mode={rollup === undefined ? 'points' : 'aggregates'}
                    rollup={rollup}
                    colorBy={rollup === 'unhealthy' ? 'peak PM2.5' : 'mean PM2.5'}
                    aggregateShape={rollup === 'unhealthy' ? 'cells' : 'circles'}
                    colorDomain={[0, 50]}
                    colorScheme={pm25Colors}
                />
                <Legend
                    visible={rollup === undefined}
                    location={LegendLocation.TOP_LEFT}
                    style={{fontColor: '#333', backgroundColor: '#fff', borderColor: '#ccc'}}
                />
                <Tooltip
                    visible={true}
                    style={{fontColor: '#333', backgroundColor: '#fff', borderColor: '#ccc', backgroundOpacity: 0.95}}
                >
                    <GeoPlotTooltipContent<AirQuality>
                        timeFormatter={sessionTime}
                        payloadFormatter={({pm25, city, level}) => <>
                            <div>{city ?? 'on a train'}</div>
                            <div>PM2.5: <b>{pm25} µg/m³</b> ({level})</div>
                        </>}
                        valueFormatter={(name, value) => name === 'unhealthy share' ?
                            `${(value * 100).toFixed(0)}%` :
                            `${value.toFixed(1)} µg/m³`
                        }
                    />
                </Tooltip>
            </Chart>
        </div>
    )
}
```

Going through the plot's properties:

- **`projection`, `center`, `viewState`, `onViewChange`** – the projection, the center the view returns to when it's reset, and the view to start with (and to keep). Dragging turns the view, and holding shift while scrolling zooms it, about the mouse.
- **`basemap`, `borders`** – the map, from step 4.
- **`radiusOf`** – sizes each reading's marker by its PM2.5. (`colorOf` would color it, too – we leave the color to the series.) The markers are circles on the earth, drawn through the projection, so they're shaped like the land around them.
- **`fadeDuration`** – fades the readings as they age, over five minutes, so the newest stand out.
- **`mode`, `rollup`** – each reading, or a roll-up's aggregates.
- **`colorBy`, `colorDomain`, `colorScheme`** – colors the aggregates by their mean (or, for the unhealthy readings, peak) PM2.5, on a fixed scale from 0 to 50 µg/m³, so a color means the same thing from one moment to the next. Their size shows their number of readings (`sizeBy`, which defaults to `count`). Keys for both are drawn in the corner.
- **`aggregateShape`** – draws the "unhealthy" grid's aggregates as their cells.

The tooltip's formatters show the times as minutes into the session, the payload as a city and a reading, and the measures in µg/m³ (and the unhealthy share as a percentage). Hover over a city's circle, and the tooltip lists its readings and monitors, its mean, median, and peak PM2.5, its share of unhealthy readings, and how many readings each monitor reported. The geo chart's tooltip also works while the data streams: the places don't move, so there's nothing to chase.

The legend shows only with the readings – the aggregates have their keys instead.

#### the whole chart

The two files, in full. The data:

```ts
import {interval, type Observable} from "rxjs";
import {bufferTime, filter, map} from "rxjs/operators";
import * as d3 from "d3";
import {
    byGridCell,
    bySensor,
    type GeoChartData,
    geoChartDataOf,
    GeoDataSource,
    type GeoDatum,
    geoDatumOf,
    geoSeriesFrom,
    maxOf,
    meanOf,
    measureOf,
    reduceOf,
} from "stream-charts";

export type AirQualityReading = {
    sensor: string        // which monitor (e.g. "paris-2", or "train-1")
    city?: string         // the city a fixed monitor is in
    latitude: number      // where the reading was taken
    longitude: number
    time: number          // when (ms since the session started)
    pm25: number          // fine particulate matter, in µg/m³
}

export const SESSION_START = Date.now()

// the cities, with their centers ([longitude, latitude]), how many monitors each has, and how
// polluted their air usually is
const CITIES: Array<{city: string, center: [number, number], monitors: number, typical: number}> = [
    {city: "Paris", center: [2.35, 48.86], monitors: 3, typical: 14},
    {city: "London", center: [-0.13, 51.51], monitors: 3, typical: 11},
    {city: "Berlin", center: [13.40, 52.52], monitors: 2, typical: 13},
    {city: "Madrid", center: [-3.70, 40.42], monitors: 2, typical: 10},
    {city: "Milan", center: [9.19, 45.46], monitors: 3, typical: 26},
    {city: "Rome", center: [12.50, 41.90], monitors: 2, typical: 15},
    {city: "Warsaw", center: [21.01, 52.23], monitors: 2, typical: 22},
    {city: "Athens", center: [23.73, 37.98], monitors: 2, typical: 18},
]
export const CITY_CENTERS = new Map(CITIES.map(({city, center}) => [city, center]))

// each city's monitors, spread around its center
const MONITORS = CITIES.flatMap(({city, center: [longitude, latitude], monitors, typical}) =>
    Array.from({length: monitors}, (_, index) => ({
        sensor: `${city.toLowerCase()}-${index + 1}`,
        city,
        latitude: latitude + (Math.random() - 0.5) * 0.08,
        longitude: longitude + (Math.random() - 0.5) * 0.12,
        typical,
    }))
)

// monitors on trains, which ride back and forth between two cities in 20 minutes
const TRAINS = [
    {sensor: "train-1", route: d3.geoInterpolate([2.35, 48.86], [13.40, 52.52])},   // Paris - Berlin
    {sensor: "train-2", route: d3.geoInterpolate([9.19, 45.46], [12.50, 41.90])},   // Milan - Rome
]
const TRIP = 20 * 60_000

/**
 * Simulated monitors: every 250 ms, a reading from a random city monitor (most of the time), and
 * now and then one from a train
 * @return The observable of readings
 */
export function simulatedReadings(): Observable<AirQualityReading> {
    return interval(250).pipe(
        map((): AirQualityReading | undefined => {
            const time = Date.now() - SESSION_START
            if (Math.random() < 0.8) {
                const monitor = MONITORS[Math.floor(Math.random() * MONITORS.length)]
                const pm25 = Math.max(1, monitor.typical * d3.randomLogNormal(0, 0.45)())
                return {...monitor, time, pm25: Math.round(pm25 * 10) / 10}
            }
            if (Math.random() < 0.5) {
                const train = TRAINS[Math.floor(Math.random() * TRAINS.length)]
                const leg = (time / TRIP) % 2
                const [longitude, latitude] = train.route(leg < 1 ? leg : 2 - leg)
                return {sensor: train.sensor, latitude, longitude, time, pm25: Math.round(d3.randomUniform(4, 30)() * 10) / 10}
            }
            return undefined
        }),
        filter((reading): reading is AirQualityReading => reading !== undefined)
    )
}

export type AirQuality = {
    pm25: number
    city?: string
    level: 'good' | 'moderate' | 'unhealthy'
}

export const CITY_MONITORS = "City monitors"
export const TRAIN_MONITORS = "Train monitors"

const levelOf = (pm25: number): AirQuality['level'] => pm25 <= 15 ? 'good' : pm25 <= 35 ? 'moderate' : 'unhealthy'

/**
 * Batches the readings, and turns each batch into chart data: the readings, by series, as geo events
 * @param readings The readings
 * @return The chart data
 */
export function toChartData(readings: Observable<AirQualityReading>): Observable<GeoChartData<AirQuality>> {
    return readings.pipe(
        bufferTime(500),
        filter(batch => batch.length > 0),
        map(batch => {
            const newPoints = new Map<string, Array<GeoDatum<AirQuality>>>()
            batch
                .sort((a, b) => a.time - b.time)
                .forEach(reading => {
                    const series = reading.city !== undefined ? CITY_MONITORS : TRAIN_MONITORS
                    const event = geoDatumOf<AirQuality>(
                        reading.sensor, reading.latitude, reading.longitude, reading.time,
                        {pm25: reading.pm25, city: reading.city, level: levelOf(reading.pm25)}
                    )
                    newPoints.set(series, [...(newPoints.get(series) ?? []), event])
                })
            return geoChartDataOf(newPoints)
        })
    )
}

const pm25 = (datum: GeoDatum<AirQuality>): number => datum.payload.pm25

// a measure of our own, from all of a cell's readings at once: the median (which, unlike a sum,
// can't take a reading back out, so it's recalculated from the readings when they've changed)
const medianPm25 = measureOf<AirQuality>(readings => d3.median(readings, pm25) ?? NaN)

// a measure of our own that can take a reading back out, so it's kept as readings come and go:
// the share of the readings that are unhealthy
const unhealthyShare = reduceOf<AirQuality, {readings: number, unhealthy: number}>({
    initial: () => ({readings: 0, unhealthy: 0}),
    add: ({readings, unhealthy}, datum) =>
        ({readings: readings + 1, unhealthy: unhealthy + (datum.payload.level === 'unhealthy' ? 1 : 0)}),
    remove: ({readings, unhealthy}, datum) =>
        ({readings: readings - 1, unhealthy: unhealthy - (datum.payload.level === 'unhealthy' ? 1 : 0)}),
    value: ({readings, unhealthy}) => readings > 0 ? unhealthy / readings : NaN,
})

export const airQualityDataSource = new GeoDataSource<AirQuality>({
    initialData: [geoSeriesFrom<AirQuality>(CITY_MONITORS), geoSeriesFrom<AirQuality>(TRAIN_MONITORS)],
    generator: (): Observable<GeoChartData<AirQuality>> => toChartData(simulatedReadings()),
    dropDataAfter: 10 * 60_000,
    rollups: {
        // each city's readings, from all its monitors, at the city's center, broken down by monitor
        "by city": {
            cellOf: (datum): {id: string, latitude: number, longitude: number} => {
                const [longitude, latitude] = CITY_CENTERS.get(datum.payload.city ?? '') ?? [datum.longitude, datum.latitude]
                return {id: datum.payload.city ?? datum.sensorId, latitude, longitude}
            },
            filter: (_datum, seriesName): boolean => seriesName === CITY_MONITORS,
            groupBy: (datum): string => datum.sensorId,
            measures: {
                "mean PM2.5": meanOf(pm25),
                "median PM2.5": medianPm25,
                "peak PM2.5": maxOf(pm25),
                "unhealthy share": unhealthyShare,
            },
        },
        // each monitor's readings, where the monitor last was (the trains move)
        "by monitor": {
            cellOf: bySensor({position: 'latest'}),
            measures: {"mean PM2.5": meanOf(pm25), "peak PM2.5": maxOf(pm25)},
        },
        // only the unhealthy readings, in the cells of a 2° grid
        "unhealthy": {
            cellOf: byGridCell(2),
            filter: (datum): boolean => datum.payload.level === 'unhealthy',
            measures: {"peak PM2.5": maxOf(pm25)},
        },
    },
})
```

The chart:

```tsx
import {type JSX, useState} from "react";
import * as d3 from "d3";
import {feature, mesh} from "topojson-client";
import type {GeometryCollection, Topology} from "topojson-specification";
import countries50m from "world-atlas/countries-50m.json";
import {
    Chart,
    defaultLineStyle,
    GeoPlot,
    GeoPlotTooltipContent,
    type GeoPlotViewState,
    Legend,
    LegendLocation,
    Tooltip,
    useDataSourceRunning,
} from "stream-charts";
import {type AirQuality, airQualityDataSource, CITY_MONITORS, TRAIN_MONITORS} from "./airQuality";

type World = Topology<{countries: GeometryCollection, land: GeometryCollection}>
const world = countries50m as unknown as World
const LAND = feature(world, world.objects.land)
const BORDERS = mesh(world, world.objects.countries, (a, b) => a !== b)

// the view: it starts centered on Europe, zoomed in 4x, and is kept here as it changes, so that
// it survives the chart being unmounted (any store would do)
const EUROPE_CENTER: [number, number] = [12, 50]
const saved: {view: GeoPlotViewState} = {view: {rotate: [-12, -50, 0], k: 4, offsetY: 0}}

const SERIES_STYLES = new Map([
    [CITY_MONITORS, {...defaultLineStyle(), color: '#1f77b4', highlightColor: '#1f77b4'}],
    [TRAIN_MONITORS, {...defaultLineStyle(), color: '#9467bd', highlightColor: '#9467bd'}],
])

// green for clean air, through yellow, to red for unhealthy air
const pm25Colors = (t: number): string => d3.interpolateRdYlGn(1 - t)

// a time as "m:ss" into the session
const sessionTime = (time: number): string =>
    `${Math.floor(time / 60_000)}:${String(Math.floor(time % 60_000 / 1000)).padStart(2, '0')}`

export function AirQualityMap(): JSX.Element {
    const running = useDataSourceRunning(airQualityDataSource)
    // the roll-up to show, or undefined to show each reading
    const [rollup, setRollup] = useState<string | undefined>(undefined)

    return (
        <div>
            <div style={{display: 'flex', gap: 12, marginBottom: 8}}>
                <button onClick={() => running ? airQualityDataSource.stop() : airQualityDataSource.start()}>
                    {running ? 'Pause' : 'Run'}
                </button>
                <select
                    value={rollup ?? 'readings'}
                    onChange={event => setRollup(event.target.value === 'readings' ? undefined : event.target.value)}
                >
                    <option value="readings">each reading</option>
                    {airQualityDataSource.rollupNames().map(name => <option key={name} value={name}>{name}</option>)}
                </select>
            </div>
            <Chart
                chartId={7}
                width={900}
                height={600}
                color="#333"
                backgroundColor="#fff"
                dataSource={airQualityDataSource}
                seriesStyles={SERIES_STYLES}
                windowingTime={500}
            >
                <GeoPlot<AirQuality>
                    projection="azimuthalEqualArea"
                    center={EUROPE_CENTER}
                    viewState={saved.view}
                    onViewChange={view => saved.view = view}
                    basemap={LAND}
                    borders={BORDERS}
                    radiusOf={datum => 2 + datum.payload.pm25 / 8}
                    fadeDuration={5 * 60_000}
                    mode={rollup === undefined ? 'points' : 'aggregates'}
                    rollup={rollup}
                    colorBy={rollup === 'unhealthy' ? 'peak PM2.5' : 'mean PM2.5'}
                    aggregateShape={rollup === 'unhealthy' ? 'cells' : 'circles'}
                    colorDomain={[0, 50]}
                    colorScheme={pm25Colors}
                />
                <Legend
                    visible={rollup === undefined}
                    location={LegendLocation.TOP_LEFT}
                    style={{fontColor: '#333', backgroundColor: '#fff', borderColor: '#ccc'}}
                />
                <Tooltip
                    visible={true}
                    style={{fontColor: '#333', backgroundColor: '#fff', borderColor: '#ccc', backgroundOpacity: 0.95}}
                >
                    <GeoPlotTooltipContent<AirQuality>
                        timeFormatter={sessionTime}
                        payloadFormatter={({pm25, city, level}) => <>
                            <div>{city ?? 'on a train'}</div>
                            <div>PM2.5: <b>{pm25} µg/m³</b> ({level})</div>
                        </>}
                        valueFormatter={(name, value) => name === 'unhealthy share' ?
                            `${(value * 100).toFixed(0)}%` :
                            `${value.toFixed(1)} µg/m³`
                        }
                    />
                </Tooltip>
            </Chart>
        </div>
    )
}
```

Put `<AirQualityMap/>` anywhere in your application, click **Run**, and the readings start to appear across Europe. Switch the drop-down to **by city** to see each city's air, to **by monitor** to follow the trains, and to **unhealthy** to see where the air is worst.

#### step 6: plugging in the real sensors

The simulation is the only part to replace. If your monitors publish their readings over a web socket, for example:

```ts
import {webSocket} from "rxjs/webSocket";

airQualityDataSource.setGenerator(
    () => toChartData(webSocket<AirQualityReading>('wss://air.example.com/readings'))
)
```

(Call `setGenerator` while the data source is stopped, or pass the generator to the data source when you create it.) Real sensors bring a few things that simulated ones don't:

- **Readings arrive out of order.** The sort in step 2 orders each batch. A reading older than the last one in its series would sit out of order, though, and the data source drops events from the front of each series, so drop such stragglers before they get there – the scatter-chart tutorial's `inOrder` operator does exactly that, keyed by the sensor.
- **Sensors come and go.** The geo data source adds a series the first time it shows up in the stream, and roll-ups pick up new sensors as they report. To change the roll-ups themselves – say, a finer grid – call `setRollups`, which rolls up the events held now.
- **Sensors move.** `bySensor({position: 'latest'})` follows a moving sensor; `'mean'` places it at the average of its retained positions instead (on the sphere, so it's right across the date line, too).
- **There are a lot of them.** Each event is a marker, so for thousands of sensors reporting often, show a roll-up instead, or shorten `dropDataAfter`.

That's the last page of the intro. Happy mapping!
