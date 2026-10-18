### legends

A legend tells you which series is which. In the [stream-charts](https://www.npmjs.com/package/stream-charts) library, the legend is a component, `<Legend>`, that you drop into a `<Chart>` alongside the plot. It reads the series names from the chart's data, and their colors from the chart's series styles – so there's nothing to keep in sync.

The scatter and raster examples have a legend. Check the **legend** checkbox in the control bar to show it, and use the drop-down next to it to choose where it goes.

#### inside or outside

The legend can go in one of two places.

- **Inside the chart** – in one of its corners: top-left, top-right, bottom-left, or bottom-right. The legend floats over the plot, so it's compact, but it can cover some of the data. *Wired to:* the legend's `location` property (for example, `LegendLocation.TOP_RIGHT`), and optionally its `offset` from that corner.
- **Outside the chart** ("External") – in an element of your choosing, anywhere on the page. The library renders the legend into it as a [React portal](https://react.dev/reference/react-dom/createPortal). In the examples, that's a column to the right of the chart, which slides open when the legend is shown. *Wired to:* the legend's `container` property – a ref to the element to render the legend into.

The sliding column is the example's doing, not the library's. The library just renders the legend into whatever container you hand it – how that container is laid out (and whether it slides) is up to you. If you're curious, the example animates the width of a grid column (see `EXTERNAL_LEGEND_WIDTH` in `src/app/examples/controls/LegendControl.tsx`, and its use in `StreamingScatterChart.tsx`).

#### things the legend does for you

- **It follows the filter.** Type a regular expression into the filter, and the legend only lists the series that match – the same ones the chart shows.
- **It highlights.** Hover over a series in the legend, and that series is highlighted in the chart (and the rest fade into the background). It works the other way, too: hover over a series in the chart, and it's highlighted in the legend. With fifty neurons in the raster chart, that's the easiest way to find the one you're after.
- **It scrolls.** When there are more series than fit, the legend scrolls.

#### styling

The legend's look – its font, colors, background, border, padding, and the size of the color swatches – is set through its `style` property. The examples pass in the colors from the current theme, which is how the legend switches between light and dark along with everything else.
