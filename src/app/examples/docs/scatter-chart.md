### the scatter chart

The scatter chart is the workhorse of the bunch. It plots any number of time-series, each as a line connecting its data points (with optional markers on the points themselves). If your data is "a value that changes over time," this is probably your chart.

#### what you're looking at

The example plots ten series of random data – each one a random walk, nudging its previous value up or down a bit with every new point. Think of them as, say, the weights of ten neurons drifting during learning. Or don't. They're random &#x1F937;.

What's more interesting is the axes. The chart has *four* of them: two x-axes and two y-axes.

- The bottom x-axis ("Time (ms)") shows a 10-second window of time, and the top x-axis ("Expanded Time (ms)") shows a 5-second window. 
- The left y-axis is linear, and the right y-axis is logarithmic.

Each series is assigned to one x-axis and one y-axis. Most of the series use the bottom and left axes (the defaults). But "Series 2" uses the top and right axes, and "Series 3" uses the top and left axes. Those two are drawn with thicker lines, so you can find them. Because the top axis covers half the time of the bottom axis, those two series stretch out to twice the width, and they scroll twice as fast once the data reaches the end of the window. Check the **highlight axes** box and hover over a series to see which axes it belongs to.

Assigning series to axes is done through the plot's `axisAssignments` property – a map from the series name to its x- and y-axis IDs.

#### controls just for this chart

- **markers** – Draws a small circle on each data point. When checked, a **hide while running** checkbox appears: markers on hundreds of fast-moving points can get busy, so by default they're only shown while the chart is paused. *Wired to:* the plot's `markerRadius` and `hideMarkersWhileRunning` properties.
- **interpolation drop-down** – How the line gets from one point to the next: linear, natural, monotone, three flavors of step, bump, or no line at all (handy with markers). These are [d3 curves](https://d3js.org/d3-shape/curve), so you can use any d3 curve factory in your own code. *Wired to:* the plot's `interpolation` property.
- **auto-scale y-axes** – Lets the y-axes grow to fit the data. When it's on, the axes start out narrower than usual (400–600 on the left, and 200–800 on the right), and each grows whenever the data on screen goes above or below it – but never past its limits (0–1,000 on the left, and 10–1,200 on the right). An axis only ever grows: once it's grown, it stays that way until the data is replaced (**Reset**, or a change to the **Number of Series**), or auto-scaling is turned off. *Wired to:* the y-axes' `autoScale`, `autoScaleMin`, and `autoScaleMax` properties, on `<ContinuousAxis>`.
- **legend** – Shows the legend, and where to put it. Legends get their own page later on.

#### where the code lives

The example (yours to copy, change, or ignore):
- `src/app/examples/StreamingScatterChart.tsx` – the control bar, and the chart itself
- `src/app/examples/appstate/scatterChartStore.ts` – the example's state, including its data source
- `src/app/examples/dataproviders/randomWeightData.ts` – the random-walk data generator

The library (what you'd use in your own application):
- `<Chart>`, `<ContinuousAxis>`, `<ScatterPlot>`, `<Tracker>`, `<Tooltip>` with `<ScatterPlotTooltipContent>`, and `<Legend>`
- `TimeSeriesDataSource` – holds the time-series and ingests the stream
