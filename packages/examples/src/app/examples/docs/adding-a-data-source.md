### tutorial: adding your own data source

The last page described how the data flows. On this page, we'll put that into practice and build a streaming chart from scratch, starting with nothing but an idea for some data. By the end, you'll have:

1. an [RxJS](https://rxjs.dev) observable that streams the data,
2. a generator that creates the observable,
3. a data source that holds the data, and
4. a chart that shows it, with a **Run**/**Pause** button.

Our data will be three temperature sensors – the kitchen, the garage, and the attic – each reporting a reading every 100 ms. They're made-up readings (a slow sine wave plus a little noise), but by the end of the tutorial, you'll see where your real data would plug in.

The code imports the library from the `stream-charts` package, just as your own application would.

#### step 1: pick the shape of your data

Each kind of chart takes its own shape of data, and each shape has its own data source.

| your data is...                                | chart data              | data source           | plot               |
|------------------------------------------------|-------------------------|-----------------------|--------------------|
| values over time                               | `TimeSeriesChartData`   | `TimeSeriesDataSource` | `<ScatterPlot>`    |
| events over time                               | `TimeSeriesChartData`   | `TimeSeriesDataSource` | `<RasterPlot>`     |
| a sequence, plotted against itself (`x[n+1]` vs `x[n]`) | `IterateChartData` | `IteratesDataSource`  | `<PoincarePlot>`   |
| the latest value of each category              | `OrdinalChartData`      | `OrdinalDataSource`   | `<BarPlot>`        |
| values over time, with model bounds            | `OutlierChartData`      | `OutlierDataSource`   | `<OutlierPlot>`    |

Temperature readings are values over time, so we'll use `TimeSeriesChartData`. Each chunk of `TimeSeriesChartData` that the observable emits holds:

- `seriesNames` – the names of the series (our sensors),
- `newPoints` – a map from each series' name to its *new* points (each a `{x: time, y: value}`),
- `maxTimes` – a map from each series' name to its latest time, and
- `maxTime` – the latest time of all of them.

Notice the word *new*: the observable only emits what's new since its last emission. The data source keeps track of everything that came before.

#### step 2: write the observable

Now for the RxJS part. We want an observable that, every 100 ms, emits one new reading for each sensor. RxJS's `interval` emits on a timer, and `map` turns each tick into chart data:

```ts
import {interval, Observable} from "rxjs";
import {map} from "rxjs/operators";
import type {Datum, TimeSeriesChartData} from "stream-charts";

export function sensorReadings(
    sensorNames: Array<string>,
    startTime: number,
    updatePeriod: number
): Observable<TimeSeriesChartData> {
    const clockStart = performance.now()
    return interval(updatePeriod).pipe(
        // the time of this reading: the wall-clock time since subscribing, after the start time
        map(() => startTime + (performance.now() - clockStart)),
        // one new reading for each sensor, packaged up as chart data
        map(time => ({
            seriesNames: new Set(sensorNames),
            maxTime: time,
            maxTimes: new Map(sensorNames.map(name => [name, time])),
            newPoints: new Map<string, Array<Datum>>(sensorNames.map(name => [
                name,
                [{x: time, y: 20 + 5 * Math.sin(time / 1000) + Math.random()}]
            ])),
        }))
    )
}
```

Two things are worth pointing out.

- **The times come from the wall clock**, not from counting ticks. When the browser tab is hidden, the browser slows timers down, and ticks get skipped. If you count ticks, your data's time falls behind real time and never catches up. Measuring the elapsed time avoids that.
- **Each emission is brand new.** Every chunk gets its own `newPoints` map and its own arrays. The chart can buffer several chunks before it draws them. If you reuse and change the same map from one emission to the next, the buffered chunks all end up showing the latest values.

Of course, a real sensor doesn't live on a timer. If your readings arrive over a web socket, RxJS's `webSocket` gives you an observable of the messages, and the same `map` turns each message into chart data:

```ts
import {webSocket} from "rxjs/webSocket";

const readings = webSocket<SensorMessage>('wss://example.com/sensors').pipe(
    map(message => toChartData(message))   // your conversion
)
```

The same goes for server-sent events, polling an API (`interval` + `switchMap` to a `fetch`), or a simulation. If you can get it into an observable, you can chart it.

#### step 3: wrap it in a generator

The data source doesn't take an observable. It takes a *generator* – a function that creates the observable. The data source calls the generator every time it starts, and passes it the series as they are *right now*. That's what lets **Run** after **Pause** carry on from where the data left off, instead of starting over at time zero:

```ts
import type {DataGenerator, TimeSeries} from "stream-charts";

export const sensorGenerator = (updatePeriod: number): DataGenerator<TimeSeriesChartData, TimeSeries> =>
    currentSeries => {
        // carry on from the latest reading the series already hold (or from 0, when they're empty)
        const latestTime = currentSeries.reduce(
            (latest, series) => Math.max(latest, series.last().map(datum => datum.x).getOrElse(0)),
            0
        )
        return sensorReadings(currentSeries.map(series => series.name), latestTime, updatePeriod)
    }
```

(`series.last()` returns a `Result`, which is empty when the series has no data. That's why there's a `getOrElse`.)

Our generator also takes the sensor names from the current series, rather than from a hard-coded list. So the series you give the data source decide what gets generated.

#### step 4: create the data source

Next, create the data source. You give it the initial series, the generator, and how long to keep the data:

```ts
import {emptySeries, TimeSeriesDataSource} from "stream-charts";

const SENSORS = ['kitchen', 'garage', 'attic']

export const sensorDataSource = new TimeSeriesDataSource({
    initialData: SENSORS.map(name => emptySeries<Datum>(name)),
    generator: sensorGenerator(100),
    dropDataAfter: 30_000,   // keep the last 30 seconds of data
})
```

A few things to know about the data source:

- **The initial data decides the series.** A time-series data source has a fixed set of series. When new points show up for a series that isn't in the initial data, it ignores them. So start with one series for each sensor, even if they're empty. (Or, to start with some history, create them with `seriesFrom(name, points)`.)
- **It starts out stopped.** Nothing happens until you call `start()`. `stop()` unsubscribes from the observable, and nothing keeps running in the background.
- **It lives as long as you keep it.** Here, it lives at the module level, so it outlives any chart that shows it. The examples keep theirs in a zustand store instead (see `src/app/examples/appstate`). Either way, put it somewhere that lives as long as you want the data to.
- **To change the generator** (say, a new update period), call `setGenerator(...)` while the source is stopped. **To start over with new data,** `dispose()` the old data source and create a new one. That's what the examples' **Reset** button does.

#### step 5: hand it to a chart

Finally, put the data source in a `<Chart>`, along with the axes and a plot. The button starts and stops the data source, and listens to `isRunningObservable` so its label stays in step:

```tsx
import {type JSX, useEffect, useState} from "react";
import {AxisLocation, Chart, ContinuousAxis, ScatterPlot} from "stream-charts";
import {sensorDataSource} from "./sensorData";

export function SensorChart(): JSX.Element {
    const [running, setRunning] = useState<boolean>(sensorDataSource.running)

    // keep the button in step with the data source (it also stops on its own when the stream
    // completes, or fails)
    useEffect(() => {
        const subscription = sensorDataSource.isRunningObservable.subscribe(setRunning)
        return () => subscription.unsubscribe()
    }, [])

    return (
        <div>
            <button onClick={() => running ? sensorDataSource.stop() : sensorDataSource.start()}>
                {running ? 'Pause' : 'Run'}
            </button>
            <Chart
                chartId={1}
                width={800}
                height={400}
                dataSource={sensorDataSource}
                windowingTime={100}
                dataUpdatePeriod={100}
            >
                <ContinuousAxis axisId="x-axis" location={AxisLocation.Bottom} domain={[0, 10_000]} label="time (ms)"/>
                <ContinuousAxis axisId="y-axis" location={AxisLocation.Left} domain={[10, 30]} label="temperature (°C)"/>
                <ScatterPlot/>
            </Chart>
        </div>
    )
}
```

Click **Run**, and the three sensors start drawing their waves. When the data reaches the end of the x-axis, the axis starts to scroll. Click **Pause**, switch to another tab, come back, and click **Run** again. The data picks up where it left off.

A few of the chart's props tie into the data:

- **`windowingTime`** – how long (ms) the chart collects updates before it redraws (the buffering setting from the common controls).
- **`dataUpdatePeriod`** – how often (ms) your generator emits, when you know it. With it, the chart buffers a fixed number of updates, rather than a fixed amount of time, which makes the scrolling smoother. Leave it out when your data arrives at irregular times.
- **`domain`** on the x-axis – the time window the chart starts with: the first 10 seconds, here.

#### step 6: make it your own

That's a working chart. From here, you can add the pieces from the earlier pages:

- **Colors** – by default, every series is drawn in the same color. Pass the chart a `seriesStyles` map from each series' name to its style (start from `defaultLineStyle()`, and set its `color`).
- **A tooltip, tracker, and legend** – add `<Tooltip>` (with `<ScatterPlotTooltipContent>`), `<Tracker>`, and `<Legend>` as children of the chart, just as the scatter example does.
- **Zooming and panning** – turn on the plot's `zoomEnabled` and `panEnabled` props.
- **A different chart type** – pick a different row from the table in step 1. The steps are the same: write an observable of that chart data, wrap it in a generator, and create its data source. The examples' generators in `src/app/examples/dataproviders` show one of each.

And when you're ready for real data, replace `sensorReadings` with an observable of your own. Nothing else needs to change.

Next up: a tooltip of your own.
