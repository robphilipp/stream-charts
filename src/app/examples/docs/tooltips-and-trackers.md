### tooltips and trackers

Tooltips and trackers both follow the mouse around the chart, and both help you read values off the chart. The difference is what they tell you about: a tooltip tells you about the *data* under the mouse, and a tracker tells you about the *position* of the mouse.

In the examples, both are turned on and off with checkboxes in the control bar, and both are only available while the chart is paused.

#### tooltips

Hover over a series (or a point, a spike, a bar, or a band) with the tooltip on, and a little box pops up with the details: the series name, the values, and whatever else makes sense for the chart type. For example, the scatter chart's tooltip shows the data points on either side of the mouse and the change between them – or, when the mouse is right on a data point, that point along with the points before and after it – and the chart highlights the points the tooltip is showing. The raster chart's tooltip adds statistics of the neuron's spikes in the window – their count, mean value and standard deviation, and the mean time between spikes – with a sparkline of their values. The bar chart's tooltip includes a sparkline – a tiny line chart of the value over the data the chart is holding, ending in the current value – and the outlier chart's tooltip describes the band you're hovering over.

In the library, a tooltip comes in two parts:

1. `<Tooltip>` – the box itself. It handles showing, hiding, and positioning the tooltip, and its look (colors, border, opacity) is set through its `style` property.
2. The *content* – what goes in the box. The library has content for each chart type: `<ScatterPlotTooltipContent>`, `<RasterPlotTooltipContent>`, `<PoincarePlotTooltipContent>`, `<BarPlotTooltipContent>`, and for the outlier chart, `<OutlierPlotTooltipContent>` (drawn in SVG) and `<OutlierPlotHtmlTooltipContent>` (plain HTML).

You put the content inside the tooltip, and the tooltip inside the chart:

```tsx
<Chart ...>
    ...
    <Tooltip visible={showTooltip} style={{backgroundColor: theme.backgroundColor}}>
        <ScatterPlotTooltipContent
            xLabel="t (ms)"
            yLabel="count"
            yValueFormatter={value => formatNumber(value, " ,.0f")}
        />
    </Tooltip>
</Chart>
```

Most of the content components take *formatters* – functions that turn the values into text – so you can control the units, the number of decimal places, and the wording without writing a whole tooltip. Each example sets its own (have a look for `Formatter` in the example's code).

And when the formatters aren't enough, you can write the content yourself. The HTML tooltip is the easiest place to start, since it's just React. The outlier example comes with a custom tooltip, `MyOutlierHtmlTooltipContent` (in `src/app/examples`), that you can switch on in `StreamingOutlierChart.tsx`: uncomment the `<MyOutlierHtmlTooltipContent/>` line (inside the `<OutlierPlotHtmlTooltipContent>`), and import it. It gets the tooltip's data from the library's `useOutlierTooltip()` hook, and then lays it out however it likes. And for the whole story – a tooltip of your own for each chart type – see the tutorial at the end of these pages.

#### trackers

A tracker is a line that follows the mouse across the chart, with a label showing the mouse's position on the axis. It's the chart equivalent of holding a ruler up to the screen. Hover over the chart with the tracker on and you'll see it.

- Most examples use a vertical tracker, labelled with the time.
- The bar chart uses a horizontal tracker (labelled with the value), which makes it easy to compare the bars against each other.
- The Poincare chart uses *two* trackers, one for each axis, so you get a crosshair.

*Wired to:* the `<Tracker>` component. Its `trackerAxis` property sets which axis it tracks (and so whether it's vertical or horizontal), `labelLocation` sets whether the label shows by the axis (`TrackerLabelLocation.ByAxis`) or not at all (`TrackerLabelLocation.Nowhere`), and `labelFormatter` turns the position into the label's text. If you want to do something else with the mouse position, the tracker can also hand it to you through its `onTrackerUpdate` callback.
