### the outlier chart

The outlier chart plots a single time-series along with the bounds that a model says the data *should* stay within. Each bound is drawn as a shaded band around the expected value, and any point that falls outside a band gets flagged with a colored marker. So it answers the question "is this data point unusual?" at a glance.

#### what you're looking at

<figure>
    <img src="./images/outlier-chart.png" alt="The outlier chart example: the Spot Price Index with its three bands, yellow markers on points outside the inner band, and red markers on two outliers">
    <figcaption>
        <b>Figure 12</b> The outlier chart after running for ten seconds. The line is the "Spot Price Index", inside its three bands. The yellow markers are points outside the inner band, and the two red ones are outliers – outside even the outer band.
    </figcaption>
</figure>

The example plots a made-up "Spot Price Index" – a sum of a few periodic functions, plus some random noise. Around it are three bands, one for each of the model's bounds:

- the inner band, holding about 68% of the data (1σ),
- the middle band, holding about 95% (2σ), and
- the outer band, holding about 99.7% (3σ).

The inner bands are drawn darker than the outer ones. A point outside the inner band gets a yellow marker, outside the middle band an orange one, and outside the outer band a red one. Red points are your outliers – they should be rare.

Hover over a band (with the tooltip on) and the tooltip describes the band – for example, "Points in this band are unlikely to be outliers." Hover over a point, and it tells you about the point.

#### controls just for this chart

<figure>
    <img src="./images/outlier-controls.png" alt="The outlier chart's expanded control panel, with the controls just for the outlier chart outlined: markers, auto-scale y-axis, and interpolation" width="460px">
    <figcaption>
        <b>Figure 13</b> The outlier chart's control panel, opened with the expand button. The outlined controls are just for the outlier chart, and the rest are the common controls from the previous page.
    </figcaption>
</figure>

- **markers** – Draws a marker on every data point, not just the outliers. Like the scatter chart's markers, they only show while the chart is paused (the outlier markers show all the time). Disabled while running.
- **interpolation drop-down** – How the line gets from one point to the next, just like the scatter chart's.
- **auto-scale y-axis** – Lets the y-axis grow to fit the data, just like the scatter chart's: when it's on, the axis starts out narrower (80 to 160), and grows to fit the index *and its bands* on screen – but never past 0 to 250. Like the scatter chart's, the axis only ever grows, keeps its growth when you switch tabs, and starts over when the data is replaced (**Reset**). *Wired to:* the y-axis' `autoScale`, `autoScaleMin`, `autoScaleMax`, `autoScaledDomain`, and `onAutoScale` properties.

The common **tooltip** works a little differently here: it shows when you hover over a band or an outlier, and its formatters lay out the outlier, the band, and the probabilities with a little HTML. (There's also a commented-out custom tooltip, `MyOutlierTooltipContent`, in the example's code, if you want to see how to roll your own.) Tooltips get their own page later on.

There's no tracker in this example, and no **Number of Series** – it's a single series.

#### where the code lives

The example (yours to copy, change, or ignore):
- `src/app/examples/StreamingOutlierChart.tsx` – the control bar, and the chart itself
- `src/app/examples/appstate/outlierChartStore.ts` – the example's state, its data source, and the model's bounds
- `src/app/examples/dataproviders/randomOutlierData.ts` – the noisy periodic data generator
- `src/app/examples/MyOutlierTooltipContent.tsx` – an example of a custom tooltip

The library (what you'd use in your own application):
- `<Chart>`, `<ContinuousAxis>`, `<OutlierPlot>`, `<Tooltip>` with `<OutlierPlotTooltipContent>`
- `OutlierDataSource` – holds the series, along with its bounds
