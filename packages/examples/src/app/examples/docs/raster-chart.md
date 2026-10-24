### the raster chart

A raster chart plots *events* in time, rather than values. Each series gets its own row, and each event is a short vertical line (a "spike") at the time it happened. If you've ever seen a plot of neurons firing, you've seen a raster chart – that's where the name comes from.

The raster chart is the one to reach for when *when* something happened matters more than *how much*. Although, each event can carry a value too, and the tooltip will tell you what it is.

#### what you're looking at

<figure>
    <img src="./images/raster-chart.png" alt="The raster chart example: fifty neurons, one per row, each spike a short vertical line, with an external legend">
    <figcaption>
        <b>Figure 6</b> The raster chart, with its legend. Each row is a neuron, and each short vertical line is a spike. The legend scrolls, since fifty neurons don't fit.
    </figcaption>
</figure>

The example has fifty neurons, named "HC 1" through "HC 50", one per row. Every time new data is generated (every 50 ms, to start with), each neuron fires with a 10% chance, and each spike carries a random value of around 55 mV (somewhere between 50 and 60 mV, shown in the tooltip). So what you see is a lot of random firing – no deep neuroscience here, sorry.

The chart's x-axis is time, and the y-axis is an *ordinal* (category) axis – one category per neuron. The top and right sides of the chart use empty axes (`<EmptyAxis>`), which draw the chart's border without any ticks or labels.

#### controls just for this chart

<figure>
    <img src="./images/raster-controls.png" alt="The raster chart's expanded control panel, with the one control just for the raster chart outlined: legend" width="460px">
    <figcaption>
        <b>Figure 7</b> The raster chart's control panel, opened with the expand button. Only the outlined legend control is just for the raster chart – the rest are the common controls from the previous page.
    </figcaption>
</figure>

Just one, in fact. A raster chart doesn't have lines to interpolate, or markers to show – the spikes are the markers.

- **legend** – Shows the legend, and where to put it. With fifty neurons, the legend gets long, so the external legend (beside the chart) is the more practical choice here. Legends get their own page later on.

The **Number of Series** control from the common controls is especially fun here: crank it up and watch the **Update Lag** to see how many neurons the chart can keep up with.

#### where the code lives

The example (yours to copy, change, or ignore):
- `src/app/examples/StreamingRasterChart.tsx` – the control bar, and the chart itself
- `src/app/examples/appstate/rasterChartStore.ts` – the example's state, including its data source
- `src/app/examples/dataproviders/randomSpikeData.ts` – the random-spike data generator

The library (what you'd use in your own application):
- `<Chart>`, `<ContinuousAxis>`, `<OrdinalAxis>`, `<EmptyAxis>`, `<RasterPlot>`, `<Tracker>`, `<Tooltip>` with `<RasterPlotTooltipContent>`, and `<Legend>`
- `TimeSeriesDataSource` – the same data source as the scatter chart's; a spike is just a data point
