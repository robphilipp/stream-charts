### under the hood: how the data flows

Let's follow a data point from the moment it's created to the moment it shows up on the screen. Along the way, it passes from the example to the library – and knowing where that hand-off happens is most of what you need to know to build your own streaming chart.

```
 the example                          the library
───────────────────────────────────────────────────────────────────────────────
 data generator  ──────────▶  data source  ──────────▶  view driver  ──▶  plot
 (an RxJS observable)         (held by the example's    (one per mounted
                               store; started and        plot)
                               stopped by Run/Pause)
```

#### 1. the data generator (the example)

Everything starts with an [RxJS](https://rxjs.dev) observable that emits new data. In the examples, those observables make up random data (they're in `src/app/examples/dataproviders`). In your application, this is where your real data comes from – a web socket, a server-sent event stream, a simulation, whatever you've got. As long as you can turn it into an observable, the library can chart it.

The examples don't hand the library an observable directly, though. They hand it a *generator* – a function that creates the observable. The data source calls the generator each time it starts, and passes it the data it already has, so that when you click **Run** after **Pause**, the new stream can carry on from where the old one left off.

#### 2. the data source (the library, owned by the example)

The data source is where the data lives. It subscribes to the generator's observable, adds each new chunk of data to its series, and drops the data that's gotten too old (the drop-after setting). There's one kind of data source for each shape of data: `TimeSeriesDataSource` (scatter and raster), `IteratesDataSource` (Poincare), `OrdinalDataSource` (bar), and `OutlierDataSource` (outlier).

The data source is library code, but it's *owned* by the example – the example creates it, starts it, stops it, and decides where it lives. In the examples, it lives in the example's zustand store:

```ts
const dataSource = new TimeSeriesDataSource({
    initialData,                              // the series to start with
    generator: randomData(dataUpdatePeriod),  // creates the stream
    dropDataAfter: 20_000,                    // keep 20 seconds of data
})

dataSource.start()   // Run: subscribes to the generator's stream
dataSource.stop()    // Pause: unsubscribes -- nothing keeps running
```

Because the store outlives the chart components, so does the data source. That's why you can start a chart, switch tabs, and come back to find it kept streaming the whole time: the chart was gone, but the data source wasn't.

#### 3. the chart, and its view drivers (the library)

The example hands the data source to the chart:

```tsx
<Chart dataSource={dataSource} windowingTime={50} ...>
    <ContinuousAxis axisId="x-axis-1" ... />
    <ContinuousAxis axisId="y-axis-1" ... />
    <ScatterPlot ... />
</Chart>
```

The chart and its plots *read* from the data source, but they never subscribe to the stream themselves. Instead, when a plot appears on the screen, it creates a *view driver*. The view driver listens to the data source's updates, batches them up (the buffering setting), moves the time axis along as new data arrives (and on each cadence tick, when there is one), and asks the plot to redraw. When the plot goes away – say, you switch tabs – its view driver goes away with it. Nothing is left running in the background but the data source itself.

#### 4. the plot (the library)

Finally, the plot draws the data onto the chart's canvas. And the data point has arrived &#x1F389;.

#### what this means for your code

To build your own streaming chart, you need to:

1. **Turn your data into an observable**, and write a generator for it. (The example's job.)
2. **Create a data source** for your kind of data, with your generator, and keep it somewhere that lives as long as you want the data to (a store, a context, or wherever suits your application).
3. **Start and stop the data source** when it makes sense – on a button click, when a connection opens, or right away.
4. **Hand the data source to a `<Chart>`**, along with the axes and the plot you want. The library takes it from there.

The five examples do exactly this, so pick the one closest to what you're building, and use it as your starting point. Or, to see each step on its own, turn to the next page, where we build one from scratch.
