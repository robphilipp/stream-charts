### the scatter chart

The scatter chart is the workhorse of the bunch. It plots any number of time-series, each as a line connecting its data points (with optional markers on the points themselves). If your data is "a value that changes over time," this is probably your chart.

#### what you're looking at

<figure>
    <img src="./images/scatter-chart.png" alt="The scatter chart example: ten random-walk series, with two x-axes, two y-axes, and an external legend">
    <figcaption>
        <b>Figure 4</b> The scatter chart, with its legend. Its four axes are the bottom "Time (ms)" and top "Expanded Time (ms)" x-axes, and the linear left and logarithmic right y-axes. The two thicker lines are "Series 2" and "Series 3", which use the top x-axis.
    </figcaption>
</figure>

The example plots ten series of random data – each one a random walk, nudging its previous value up or down a bit with every new point. Think of them as, say, the weights of ten neurons drifting during learning. Or don't. They're random &#x1F937;.

What's more interesting is the axes. The chart has *four* of them: two x-axes and two y-axes.

- The bottom x-axis ("Time (ms)") shows a 10-second window of time, and the top x-axis ("Expanded Time (ms)") shows a 5-second window. 
- The left y-axis is linear, and the right y-axis is logarithmic.

Each series is assigned to one x-axis and one y-axis. Most of the series use the bottom and left axes (the defaults). But "Series 2" uses the top and right axes, and "Series 3" uses the top and left axes. Those two are drawn with thicker lines, so you can find them. Because the top axis covers half the time of the bottom axis, those two series stretch out to twice the width, and they scroll twice as fast once the data reaches the end of the window. Check the **highlight axes** box and hover over a series to see which axes it belongs to.

Assigning series to axes is done through the plot's `axisAssignments` property – a map from the series name to its x- and y-axis IDs.

#### controls just for this chart

<figure>
    <img src="./images/scatter-controls.png" alt="The scatter chart's expanded control panel, with the controls just for the scatter chart outlined: auto-scale y-axes, markers, interpolation, and legend" width="500px">
    <figcaption>
        <b>Figure 5</b> The scatter chart's control panel, opened with the expand button. The outlined controls are just for the scatter chart, and the rest are the common controls (see the common controls page).
    </figcaption>
</figure>

- **markers** – Draws a small circle on each data point. When checked, a **hide while running** checkbox appears: markers on hundreds of fast-moving points can get busy, so by default they're only shown while the chart is paused. *Wired to:* the plot's `markerRadius` and `hideMarkersWhileRunning` properties.
- **interpolation drop-down** – How the line gets from one point to the next: linear, natural, monotone, three flavors of step, bump, or no line at all (handy with markers). These are [d3 curves](https://d3js.org/d3-shape/curve), so you can use any d3 curve factory in your own code. *Wired to:* the plot's `interpolation` property.
- **auto-scale y-axes** – Lets the y-axes grow to fit the data. When it's on, the axes start out narrower than usual (400–600 on the left, and 200–800 on the right), and each grows whenever the data on screen goes above or below it (leaving a little room to spare, so the data doesn't run right up against the edge) – but never past its limits (0–1,000 on the left, and 10–1,200 on the right). An axis only ever grows: once it's grown, it stays that way – even when you switch tabs and come back – until the data is replaced (**Reset**, or a change to the **Number of Series**), or auto-scaling is turned off. *Wired to:* the y-axes' `autoScale`, `autoScaleMin`, `autoScaleMax`, and `autoScalePadding` properties, on `<ContinuousAxis>`. The example keeps each axis' growth in its store, through the axis' `onAutoScale` callback, and hands it back through its `autoScaledDomain` property.
- **legend** – Shows the legend, and where to put it. Legends get their own page later on.

#### where the code lives

The example (yours to copy, change, or ignore):
- `src/app/examples/StreamingScatterChart.tsx` – the control bar, and the chart itself
- `src/app/examples/appstate/scatterChartStore.ts` – the example's state, including its data source
- `src/app/examples/dataproviders/randomWeightData.ts` – the random-walk data generator

The library (what you'd use in your own application):
- `<Chart>`, `<ContinuousAxis>`, `<ScatterPlot>`, `<Tracker>`, `<Tooltip>` with `<ScatterPlotTooltipContent>`, and `<Legend>`
- `TimeSeriesDataSource` – holds the time-series and ingests the stream
