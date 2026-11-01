### axes

Every chart has axes – they're the `<ContinuousAxis>`, `<OrdinalAxis>`, and `<EmptyAxis>` children of the `<Chart>`, next to the plot. This page covers the three kinds of axes, their options, and the rules for which plots take which axes.

A chart has one or two x-axes (`AxisLocation.Bottom`, `AxisLocation.Top`) and one or two y-axes (`AxisLocation.Left`, `AxisLocation.Right`). Each axis has its own `axisId`, which is how the plot assigns series to it.

#### &lt;ContinuousAxis&gt; – numbers

A numeric axis: time on an x-axis, or values on either axis. The scatter chart's four axes are all continuous.

```tsx
<ContinuousAxis 
    axisId="y-axis-2" 
    location={AxisLocation.Right} 
    scale={d3.scaleLog()} 
    domain={[10, 1200]} 
    label="Distance (µm)"
/>
```

| option | what it does |
|---|---|
| `axisId` | **Required.** The axis' ID, unique within the chart. |
| `location` | **Required.** `Bottom` or `Top` for an x-axis; `Left` or `Right` for a y-axis. |
| `domain` | **Required.** The axis' starting range, `[min, max]`. For a time axis, this is also the time window: a domain of `[0, 10000]` shows 10 seconds, and once the data passes 10,000 ms, the axis scrolls. |
| `label` | **Required.** The axis' label. |
| `scale` | The d3 scale. Defaults to `d3.scaleLinear()`, and takes any continuous numeric d3 scale – `d3.scaleLog()`, `d3.scalePow()`, `d3.scaleSqrt()`, and so on. The scatter chart's right-hand y-axis is logarithmic. (Not `d3.scaleTime()`: times on these charts are plain milliseconds.) |
| `font` | The font of the tick labels and the label: any of `size`, `color`, `family`, and `weight`. |
| `updateAxisBasedOnDomainValues` | When `true` (the default), the axis resets whenever the *values* of `domain` change, so you can pass a new `[min, max]` literal on each render. Set it to `false` to reset only when the `domain` *object* changes instead. The Poincaré chart does that, so that its axes reset when you pick a new function, and not on every render. |

A continuous y-axis can also **auto-scale** – grow to fit the data on screen – in the scatter, bar, and outlier plots. (The Poincaré plot ignores it, with a warning in the console, as does an x-axis.)

| option | what it does |
|---|---|
| `autoScale` | Turns auto-scaling on (off by default). The axis starts at `domain`, and only ever grows. |
| `autoScaleMin`, `autoScaleMax` | How far the axis may grow (by default, without limit). |
| `autoScalePadding` | The room left beyond the data's extremes, as a fraction of the axis (0 to 0.45; 0.05 by default). |
| `autoScaledDomain`, `onAutoScale` | Keep the grown axis across remounts: `onAutoScale` hands you the axis' new domain each time it grows, and `autoScaledDomain` hands it back. The scatter, bar, and outlier examples keep it in their stores, so the axes stay grown when you switch tabs. |

#### &lt;OrdinalAxis&gt; – categories

A category axis, with one band per category. The raster chart uses one for its y-axis (one row per neuron), and the bar chart uses one for its x-axis (one bar per neuron).

```tsx
<OrdinalAxis 
    axisId="y-axis-1" 
    location={AxisLocation.Left} 
    categories={names} 
    label="Neuron ID"
/>
```

| option | what it does |
|---|---|
| `axisId` | **Required.** The axis' ID, unique within the chart. |
| `location` | **Required.** Which side of the chart it's on. |
| `categories` | **Required.** The category names, in the order they're shown. On a y-axis, the first category is at the top. For the raster and bar charts, these are the series' names. |
| `label` | **Required.** The axis' label. |
| `axisTickStyle` | The tick labels' `rotation` (in degrees). The bar chart rotates its bottom labels by 90°, and its top ones by 40°, so that fifty neuron names fit. |
| `font` | The font of the tick labels and the label: any of `size`, `color`, `family`, and `weight`. |
| `scale` | The d3 band scale (rarely needed). |
| `updateAxisBasedOnDomainValues` | As for the continuous axis, but for the `categories`. |

#### &lt;EmptyAxis&gt; – just a line

A plain line where an axis would be, without ticks or a label. It frames the plot on a side that has no axis of its own: the raster chart's top and right sides are empty axes.

```tsx
<EmptyAxis 
    axisId="x-axis-2" 
    location={AxisLocation.Top}
/>
```

Its only options are `axisId` and `location`. Behind the scenes, an empty axis is a continuous axis – which matters for the rules below.

#### which plot takes which axes

Each plot needs particular kinds of axes:

| plot | x-axis | y-axis |
|---|---|---|
| `<ScatterPlot>` | `<ContinuousAxis>` | `<ContinuousAxis>` |
| `<RasterPlot>` | `<ContinuousAxis>` | `<OrdinalAxis>` |
| `<PoincarePlot>` | `<ContinuousAxis>` | `<ContinuousAxis>` |
| `<BarPlot>` | `<OrdinalAxis>` | `<ContinuousAxis>` |
| `<OutlierPlot>` | `<ContinuousAxis>` | `<ContinuousAxis>` |

An `<EmptyAxis>` counts as a `<ContinuousAxis>` here. So it's fine as the raster chart's top x-axis, but the raster chart's series can't use one as their y-axis.

#### assigning series to axes

When a chart has more than one x-axis or y-axis, the plot's `axisAssignments` says which series go on which axes – a map from a series' name to its x- and y-axis IDs, made with `assignAxes`:

```tsx
<ScatterPlot axisAssignments={new Map([
    ['Series 2', assignAxes('x-axis-2', 'y-axis-2')],
    ['Series 3', assignAxes('x-axis-2', 'y-axis-1')],
])}/>
```

That's how the scatter chart puts "Series 2" and "Series 3" on its top x-axis. A few things to know:

- **Series without an assignment use the *first* x-axis and the *first* y-axis** – the first ones in the chart's children, whatever side they're on. So list the axes your series use before any `<EmptyAxis>`. The raster chart lists its `<OrdinalAxis>` before the `<EmptyAxis>` on the right. The other way around, the empty (continuous) axis would be the first y-axis, and the raster plot couldn't draw its series.
- **A series assigned to an axis that doesn't exist isn't drawn.** Check the IDs: a misspelled one doesn't fall back to the first axes.
- **The Poincaré plot has no assignments.** All its series share the first x-axis and the first y-axis. Any other axes – the example has all four sides – just mirror them.

#### when the axes are wrong

The axes are child components, so TypeScript can't tell that a bar chart has the wrong kind of x-axis. The plot finds out when it draws: it skips that drawing, and the chart logs the problem to the browser's console, naming the plot, the axis, and the kind of axis it needs. For example:

```
<RasterPlot> needs its y-axis to be an <OrdinalAxis>, but the y-axis "y-axis-2" is a <ContinuousAxis> (or an <EmptyAxis>)
```

So if a chart comes up with its axes but no data, the console is the first place to look.
