### tutorial: your own scatter chart, from sensor data

The data-source tutorial, two pages back, built the smallest chart that works: three made-up sensors, a reading every 100 ms like clockwork, and one axis. Real sensors aren't that tidy. On this page, we'll build a scatter chart the way you would for real sensor data, where:

- **the readings arrive one at a time**, as messages, rather than as ready-made chart data,
- **each sensor reports on its own schedule** – about once a second, give or take – and now and then **misses a reading**,
- **the sensors measure different things**, in different units, so they need different y-axes, and
- **the chart has to be readable**: colors that mean something, a legend, and a tracker and tooltip that show times and values the way people read them.

Our sensors are in a greenhouse: three temperature sensors (in °C) and two humidity sensors (in %). By the end, you'll have the chart, and you'll know which line to change to plug in your real sensors.

The code imports the library from the `stream-charts` package, just as your own application would. Every piece of it was run as you see it here.

#### step 1: the readings

Start with what your sensors actually send. Here, each message is one reading from one sensor:

```ts
export type SensorReading = {
    sensor: string       // which sensor (e.g. "temp-north")
    time: number         // when it was taken (ms since the epoch)
    value: number        // what it read
}
```

Until the real sensors are wired up, we'll simulate them. Each simulated sensor reports about once a second (somewhere between 0.7 and 1.3 seconds after its last reading), and one reading in twenty goes missing:

```ts
import {Observable} from "rxjs";

type SimulatedSensor = {
    name: string
    // the reading's typical value, and how far it swings
    baseline: number
    swing: number
}

export function simulatedSensorFeed(sensors: Array<SimulatedSensor>): Observable<SensorReading> {
    return new Observable<SensorReading>(subscriber => {
        const timers = new Map<string, ReturnType<typeof setTimeout>>()
        const report = (sensor: SimulatedSensor): void => {
            const time = Date.now()
            // one reading in twenty goes missing
            if (Math.random() > 0.05) {
                const value = sensor.baseline + sensor.swing * Math.sin(time / 20_000) + (Math.random() - 0.5)
                subscriber.next({sensor: sensor.name, time, value})
            }
            timers.set(sensor.name, setTimeout(() => report(sensor), 700 + Math.random() * 600))
        }
        sensors.forEach(report)
        // stops the timers when the subscriber unsubscribes (Pause)
        return () => timers.forEach(timer => clearTimeout(timer))
    })
}
```

The function returned at the end is the observable's *teardown*. It runs when the data source unsubscribes – when you click **Pause** – so that nothing keeps ticking in the background.

#### step 2: from readings to chart data

The chart doesn't want a stream of single readings. It wants `TimeSeriesChartData`: the new points for each series, and their latest times (the data-source tutorial goes through its fields). So we collect the readings into batches with RxJS's `bufferTime`, and turn each batch into one chunk of chart data:

```ts
import {type Observable} from "rxjs";
import {bufferTime, filter, map} from "rxjs/operators";
import type {Datum, TimeSeriesChartData} from "stream-charts";

// when the session started: the chart's times are milliseconds since then
export const SESSION_START = Date.now()

export function toChartData(readings: Observable<SensorReading>): Observable<TimeSeriesChartData> {
    return readings.pipe(
        bufferTime(250),
        filter(batch => batch.length > 0),
        map(batch => {
            const newPoints = new Map<string, Array<Datum>>()
            const maxTimes = new Map<string, number>()
            batch
                .slice()
                .sort((a, b) => a.time - b.time)
                .forEach(reading => {
                    const x = reading.time - SESSION_START
                    const points = newPoints.get(reading.sensor) ?? []
                    points.push({x, y: reading.value})
                    newPoints.set(reading.sensor, points)
                    maxTimes.set(reading.sensor, x)
                })
            return {
                seriesNames: new Set(newPoints.keys()),
                newPoints,
                maxTimes,
                maxTime: Math.max(...maxTimes.values()),
            }
        })
    )
}
```

A few things are going on here:

- **Batching.** `bufferTime(250)` collects everything that arrived in each quarter of a second into an array. Batching once, here, is cheaper than handing the chart one reading at a time, and the chart batches its own redraws anyway (more on that in step 4).
- **Empty batches are skipped.** When no sensor reported in a quarter-second, `bufferTime` still emits – an empty array. There's nothing to draw, so the `filter` drops it.
- **A batch holds only the sensors that reported.** That's fine: the data source adds the new points to the series that have them, and leaves the rest alone. Most batches here have one or two sensors in them.
- **Times are milliseconds since the session started.** The x-axis is just a number line. Epoch times (about 1.8 trillion milliseconds) would work too, but then the x-axis' domain has to start at the current epoch time, and its tick labels are thirteen-digit numbers. Subtracting `SESSION_START` puts the start of the chart at zero. In step 6, we'll turn these times back into clock times, for people to read.
- **Each batch is sorted by time.** The lines connect a series' points in the order they arrive. Readings that arrive out of order within a batch would make the line double back on itself. (Out-of-order readings *across* batches are a real-sensor problem – step 8 deals with them.)

#### step 3: the data source

The generator creates the observable each time the data source starts. Unlike the data-source tutorial's generator, this one doesn't need to work out where the data left off: real sensors carry on in real time, so **Run** after **Pause** simply picks up with whatever they report next, and the time spent paused shows up as a gap.

```ts
import {type DataGenerator, emptySeries, type TimeSeries, TimeSeriesDataSource} from "stream-charts";

export const TEMPERATURE_SENSORS = ['temp-north', 'temp-south', 'temp-bench']
export const HUMIDITY_SENSORS = ['humidity-north', 'humidity-south']

export const sensorGenerator: DataGenerator<TimeSeriesChartData, TimeSeries> = () => toChartData(
    simulatedSensorFeed([
        {name: 'temp-north', baseline: 24, swing: 3},
        {name: 'temp-south', baseline: 26, swing: 4},
        {name: 'temp-bench', baseline: 22, swing: 2},
        {name: 'humidity-north', baseline: 65, swing: 10},
        {name: 'humidity-south', baseline: 55, swing: 12},
    ])
)

export const greenhouseDataSource = new TimeSeriesDataSource({
    initialData: [...TEMPERATURE_SENSORS, ...HUMIDITY_SENSORS].map(name => emptySeries<Datum>(name)),
    generator: sensorGenerator,
    dropDataAfter: 5 * 60_000,   // keep five minutes of readings
})
```

Remember from the data-source tutorial: **the initial data decides the series**. Readings from a sensor that isn't in the initial data are ignored, so the sensor names here must match the names in the readings exactly.

#### step 4: the chart, with two y-axes

Temperatures run from about 15 to 35 °C, and humidities from 0 to 100 %. On one axis, the temperatures would be squashed into a flat band at the bottom. So we give each unit its own y-axis – temperature on the left, humidity on the right – and tell the plot which series go on which axis:

```tsx
import {assignAxes, AxisLocation, Chart, ContinuousAxis, ScatterPlot} from "stream-charts";

// the humidity sensors use the right-hand y-axis (series without an assignment use the first
// x- and y-axes)
const AXIS_ASSIGNMENTS = new Map(HUMIDITY_SENSORS.map(name => [name, assignAxes('x-axis', 'humidity-axis')]))

<Chart
    chartId={2}
    width={900}
    height={450}
    margin={{right: 60}}
    color="#333"
    backgroundColor="#fff"
    dataSource={greenhouseDataSource}
    seriesStyles={SERIES_STYLES}
    windowingTime={250}
>
    <ContinuousAxis axisId="x-axis" location={AxisLocation.Bottom} domain={[0, 60_000]} label="time (ms)"/>
    <ContinuousAxis axisId="temperature-axis" location={AxisLocation.Left} domain={[15, 35]} label="temperature (°C)"/>
    <ContinuousAxis axisId="humidity-axis" location={AxisLocation.Right} domain={[0, 100]} label="humidity (%)"/>
    <ScatterPlot axisAssignments={AXIS_ASSIGNMENTS}/>
</Chart>
```

- **`axisAssignments`** maps a series' name to its x- and y-axis IDs. Series that aren't in the map use the first x-axis and the first y-axis – here, the temperature sensors.
- **`margin={{right: 60}}`** makes room for the right-hand axis' labels.
- **`color` and `backgroundColor`** set the chart's own colors – its axes, labels, and background. Without them, you get the library's defaults.
- **The x-axis' `domain`** is the time window: one minute. When the data reaches the end, the axis scrolls.
- **`windowingTime={250}`** matches the batching from step 2: the chart collects updates for a quarter of a second before redrawing.
- **There's no `dataUpdatePeriod`.** The data-source tutorial set it, because its data arrived like clockwork. Leave it out when your data arrives at irregular times, as sensor readings do.

For the colors, the series styles give each sensor its own – warm colors for the temperatures, and cool ones for the humidities, so that you can tell the units apart at a glance:

```ts
import {defaultLineStyle, type SeriesLineStyle} from "stream-charts";

const SERIES_STYLES = new Map<string, SeriesLineStyle>([
    ['temp-north', {...defaultLineStyle(), color: '#e8590c', highlightColor: '#e8590c'}],
    ['temp-south', {...defaultLineStyle(), color: '#c92a2a', highlightColor: '#c92a2a'}],
    ['temp-bench', {...defaultLineStyle(), color: '#f08c00', highlightColor: '#f08c00'}],
    ['humidity-north', {...defaultLineStyle(), color: '#1971c2', highlightColor: '#1971c2'}],
    ['humidity-south', {...defaultLineStyle(), color: '#0c8599', highlightColor: '#0c8599'}],
])
```

(`highlightColor` is the line's color when the mouse is over it. `defaultLineStyle()` supplies the line widths, so you only set what you change.)

#### step 5: making sparse data look right

A reading a second is slow, as streaming data goes. Three of the plot's props make slow, uneven data look its best:

```tsx
<ScatterPlot
    axisAssignments={AXIS_ASSIGNMENTS}
    interpolation={d3.curveMonotoneX}
    markerRadius={2}
    hideMarkersWhileRunning={false}
    withCadenceOf={25}
/>
```

- **`interpolation={d3.curveMonotoneX}`** draws a smooth curve through the points without overshooting them. (A plain smooth curve, like `d3.curveNatural`, can swing above a peak or below a dip that the sensor never measured.) Import d3 with `import * as d3 from "d3"`.
- **`markerRadius={2}`** marks each reading, so that you can see where the measurements are – and, where a reading went missing, that the line is bridging a gap. **`hideMarkersWhileRunning={false}`** keeps them while streaming. With a reading a second, there aren't enough points for markers to get busy.
- **`withCadenceOf={25}`** redraws the chart every 25 ms, whether or not new readings have arrived, so the time axis scrolls smoothly instead of jumping forward with each batch. A cadence is meant for exactly this: updates more than about 100 ms apart.

#### step 6: legend, tracker, and tooltip

Now for the pieces that help people read the chart. Add them as children of the `<Chart>`:

```tsx
import {Legend, LegendLocation, ScatterPlotTooltipContent, Tooltip, Tracker, TrackerLabelLocation} from "stream-charts";

// a chart time (ms since the session started) as the time of day, and as seconds
const clockTime = (x: number): string => new Date(SESSION_START + x).toLocaleTimeString()
const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`

<Legend
    visible={true}
    location={LegendLocation.TOP_LEFT}
    style={{fontColor: '#333', backgroundColor: '#fff', borderColor: '#ccc'}}
/>
<Tracker
    visible={!running}
    labelLocation={TrackerLabelLocation.ByAxis}
    labelFormatter={clockTime}
    style={{color: '#888'}}
    font={{color: '#333'}}
/>
<Tooltip
    visible={!running}
    style={{fontColor: '#333', backgroundColor: '#fff', borderColor: '#ccc', backgroundOpacity: 0.95}}
>
    <ScatterPlotTooltipContent
        xLabel="time"
        yLabel="reading"
        xValueFormatter={seconds}
        xChangeFormatter={(x1, x2) => seconds(x2 - x1)}
        yValueFormatter={value => value.toFixed(1)}
        yChangeFormatter={(y1, y2) => (y2 - y1).toFixed(1)}
    />
</Tooltip>
```

- **The legend** lists the sensors in their colors, over the top-left corner of the plot. Hovering over an entry highlights its line. (It can also go outside the chart – see the legends page.)
- **The tracker** follows the mouse, and labels its time on the x-axis. Its `labelFormatter` turns the chart's time back into the time of day – "2:14:05 PM" means a lot more to a person than "754,021".
- **The tooltip** shows a reading's neighbors, the change between them, and some statistics about the sensor's data. Here, its time formatters show seconds since the start, and its value formatters round the readings to a tenth.
- **`visible={!running}`** shows the tracker and the tooltip only while the chart is paused (the `running` state from the data-source tutorial's button). Chasing a moving line with the mouse isn't much fun.

Why does the tooltip show seconds, rather than the time of day, like the tracker? Because its **Mean interval** – the average time between readings – is a duration, and the tooltip formats it with `xValueFormatter` too. With `clockTime`, a mean interval of one second would read as a time of day. With `seconds`, it reads "1.0 s", and so do the times and their change.

One thing the tooltip can't do out of the box: show each sensor's units. `yLabel` is the same for every series. For "23.4 °C" on the temperatures and "61 %" on the humidities, write your own tooltip content, which can look at the series' name – the previous tutorial shows how.

#### step 7: zooming and panning

To look closely at a stretch of readings, turn on zooming and panning:

```tsx
<ScatterPlot
    ...
    zoomEnabled={true}
    panEnabled={true}
    zoomKeyModifiersRequired={true}
/>
```

Hold down `shift` (or `ctrl`) and scroll over the chart to zoom, and drag to pan. `zoomKeyModifiersRequired` is what makes the key necessary, so that scrolling down the page doesn't zoom the chart by accident.

#### the whole chart

Put together, with the **Run**/**Pause** button from the data-source tutorial:

```tsx
import {type JSX, useEffect, useState} from "react";
import * as d3 from "d3";
import {
    assignAxes,
    AxisLocation,
    Chart,
    ContinuousAxis,
    defaultLineStyle,
    Legend,
    LegendLocation,
    ScatterPlot,
    ScatterPlotTooltipContent,
    type SeriesLineStyle,
    Tooltip,
    Tracker,
    TrackerLabelLocation,
} from "stream-charts";
import {greenhouseDataSource, HUMIDITY_SENSORS, SESSION_START} from "./sensorData";

// temperatures in warm colors, humidities in cool ones
const SERIES_STYLES = new Map<string, SeriesLineStyle>([
    ['temp-north', {...defaultLineStyle(), color: '#e8590c', highlightColor: '#e8590c'}],
    ['temp-south', {...defaultLineStyle(), color: '#c92a2a', highlightColor: '#c92a2a'}],
    ['temp-bench', {...defaultLineStyle(), color: '#f08c00', highlightColor: '#f08c00'}],
    ['humidity-north', {...defaultLineStyle(), color: '#1971c2', highlightColor: '#1971c2'}],
    ['humidity-south', {...defaultLineStyle(), color: '#0c8599', highlightColor: '#0c8599'}],
])

// the humidity sensors use the right-hand y-axis (series without an assignment use the first
// x- and y-axes)
const AXIS_ASSIGNMENTS = new Map(HUMIDITY_SENSORS.map(name => [name, assignAxes('x-axis', 'humidity-axis')]))

// a chart time (ms since the session started) as the time of day, and as seconds
const clockTime = (x: number): string => new Date(SESSION_START + x).toLocaleTimeString()
const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`

export function GreenhouseChart(): JSX.Element {
    const [running, setRunning] = useState<boolean>(greenhouseDataSource.running)
    useEffect(() => {
        const subscription = greenhouseDataSource.isRunningObservable.subscribe(setRunning)
        return () => subscription.unsubscribe()
    }, [])

    return (
        <div>
            <button onClick={() => running ? greenhouseDataSource.stop() : greenhouseDataSource.start()}>
                {running ? 'Pause' : 'Run'}
            </button>
            <Chart
                chartId={2}
                width={900}
                height={450}
                margin={{right: 60}}
                color="#333"
                backgroundColor="#fff"
                dataSource={greenhouseDataSource}
                seriesStyles={SERIES_STYLES}
                windowingTime={250}
            >
                <ContinuousAxis
                    axisId="x-axis"
                    location={AxisLocation.Bottom}
                    domain={[0, 60_000]}
                    label="time (ms)"
                />
                <ContinuousAxis
                    axisId="temperature-axis"
                    location={AxisLocation.Left}
                    domain={[15, 35]}
                    label="temperature (°C)"
                />
                <ContinuousAxis
                    axisId="humidity-axis"
                    location={AxisLocation.Right}
                    domain={[0, 100]}
                    label="humidity (%)"
                />
                <ScatterPlot
                    axisAssignments={AXIS_ASSIGNMENTS}
                    interpolation={d3.curveMonotoneX}
                    markerRadius={2}
                    hideMarkersWhileRunning={false}
                    withCadenceOf={25}
                    zoomEnabled={true}
                    panEnabled={true}
                    zoomKeyModifiersRequired={true}
                />
                <Legend
                    visible={true}
                    location={LegendLocation.TOP_LEFT}
                    style={{fontColor: '#333', backgroundColor: '#fff', borderColor: '#ccc'}}
                />
                <Tracker
                    visible={!running}
                    labelLocation={TrackerLabelLocation.ByAxis}
                    labelFormatter={clockTime}
                    style={{color: '#888'}}
                    font={{color: '#333'}}
                />
                <Tooltip
                    visible={!running}
                    style={{fontColor: '#333', backgroundColor: '#fff', borderColor: '#ccc', backgroundOpacity: 0.95}}
                >
                    <ScatterPlotTooltipContent
                        xLabel="time"
                        yLabel="reading"
                        xValueFormatter={seconds}
                        xChangeFormatter={(x1, x2) => seconds(x2 - x1)}
                        yValueFormatter={value => value.toFixed(1)}
                        yChangeFormatter={(y1, y2) => (y2 - y1).toFixed(1)}
                    />
                </Tooltip>
            </Chart>
        </div>
    )
}
```

Click **Run**. The five sensors start drawing, each at its own pace, with a marker on each reading, and the time axis scrolls smoothly once the data reaches the end of the minute. Click **Pause**, and hover over a line for the tooltip, or anywhere on the chart for the tracker's time of day.

#### step 8: plugging in the real sensors

When your sensors are ready, only the generator changes. If they send their readings over a web socket, as JSON messages shaped like `SensorReading`, RxJS's `webSocket` gives you the observable of readings, and `toChartData` does the rest:

```ts
import {webSocket} from "rxjs/webSocket";

greenhouseDataSource.setGenerator(
    () => toChartData(webSocket<SensorReading>('wss://greenhouse.example.com/readings').pipe(inOrder()))
)
```

(Call `setGenerator` while the data source is stopped, or pass the generator to the data source when you create it.) Whatever the transport – server-sent events, MQTT over web sockets, polling a REST API – the job is the same: get an observable of readings, and map each message to a `SensorReading`.

Real sensors bring a few things that simulated ones don't:

- **Readings arrive out of order.** Networks reorder messages, and a sensor might resend an old reading. Within a batch, the sort in step 2 takes care of it. Across batches, a reading older than the series' latest point would make the line double back. The `inOrder` operator in the snippet above drops such stragglers:

  ```ts
  import {type MonoTypeOperatorFunction} from "rxjs";
  import {filter} from "rxjs/operators";

  export function inOrder(): MonoTypeOperatorFunction<SensorReading> {
      const latest = new Map<string, number>()
      return filter(reading => {
          if (reading.time <= (latest.get(reading.sensor) ?? -Infinity)) return false
          latest.set(reading.sensor, reading.time)
          return true
      })
  }
  ```

- **Sensor clocks drift.** The readings' times come from the sensors, and `SESSION_START` comes from the browser. If a sensor's clock runs ahead of the browser's, its readings land ahead of "now" on the chart. If you can't trust the sensors' clocks, stamp the readings with the time they arrive (`Date.now()`) instead.
- **Sensors come and go.** The data source's series are fixed when you create it. To add a sensor, create a new data source with the new set of series (and `dispose()` the old one).
- **Gaps are real.** When a sensor goes quiet, the line bridges the gap between its readings. With the markers on, you can see where the readings stop and start again.

That's the last page of the intro. Happy charting!
