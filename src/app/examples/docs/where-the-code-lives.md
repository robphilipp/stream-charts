### under the hood: where the code lives

So far, we've looked at the examples from the outside. These next two pages look at the code – and in particular, at where the example application ends and the [stream-charts](https://www.npmjs.com/package/stream-charts) library begins. When you go to build your own charts, the library is what you use, and the example is what you read (and maybe borrow from).

Everything lives under `src/app`, in three directories.

| directory          | whose is it? | what's in it                                                         |
|--------------------|--------------|----------------------------------------------------------------------|
| `src/app/charts`   | the library  | the charts: `<Chart>`, the axes, plots, data sources, and so on      |
| `src/app/examples` | the example  | the five examples, their state, their data, and their controls       |
| `src/app/ui`       | the example  | general-purpose UI widgets – buttons, drop-downs, the control bar    |

There's a simple rule that keeps the two apart: **the example uses the library, and the library never uses the example.** Nothing in `src/app/charts` imports anything from `src/app/examples` or `src/app/ui`. So if you're wondering whether a piece of code is "stream-charts," check which directory it's in.

#### the library – `src/app/charts`

- `Chart.tsx` – the `<Chart>` component, the container that everything else goes into
- `axes` – `<ContinuousAxis>`, `<OrdinalAxis>`, and `<EmptyAxis>`, and the code for zooming and panning them
- `plots` – one plot per chart type: `<ScatterPlot>`, `<RasterPlot>`, `<PoincarePlot>`, `<BarPlot>`, and `<OutlierPlot>`
- `datasources` – the data sources, which hold a chart's data and ingest the stream (next page)
- `subscriptions` – the view drivers, which keep a plot's view in step with its data source (also the next page)
- `series` and `observables` – the shapes of the data, and helpers for building streams of it
- `legends`, `tooltips`, and `trackers` – the components from the earlier pages
- `hooks`, `styling`, and `filters` – the plumbing that ties it all together (the chart's React contexts, the plots' styles and margins, and the regular-expression filter)

#### the example – `src/app/examples`

- `Streaming*Chart.tsx` – one file per example (`StreamingScatterChart.tsx`, and so on). Each one lays out the control bar and the chart, and wires the controls to the chart. If you only read one file, read one of these.
- `appstate` – the examples' state, one [zustand](https://www.npmjs.com/package/zustand) store per example. Each store holds the example's settings, its zoom, and its data source.
- `dataproviders` – the random-data generators that feed the examples. In your application, this is where your real data would come from.
- `controls` – the pieces of the control bars (the drop-after drop-down, the buffering field, the lag display, and so on)
- `options` – the choices offered by the drop-downs (the interpolations, the legend locations, and the drop-after times)
- `docs` – these very pages (they're markdown files), and `Intro.tsx`, which renders them

And outside of the `examples` directory, `src/app/router.tsx`, `src/app/routeComponents.tsx`, and `src/app/routeData.ts` set up the tabs, and the initial data for each example.

#### the UI widgets – `src/app/ui`

The buttons, checkboxes, toggles, drop-downs, the expandable control bar, the floating navigation bar you're using right now, the themes, and the icons. These are written for this application, and aren't part of the library. They're general-purpose enough to borrow, though.
