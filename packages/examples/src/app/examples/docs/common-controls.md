### the common controls

Most of the examples share a set of controls. Not every example has every one of them (it wouldn't make much sense to, say, ask a Poincare plot how many series it should have), but when a control shows up, it does the same thing in every example.

Remember, the controls are part of this *example application*, and are **not** part of the [stream-charts](https://www.npmjs.com/package/stream-charts) library. Each control is simply wired to an option or a property of the library's chart. So for each control below, we also point out what it's wired to – that's the part you'd set in your own code. The controls themselves live in `src/app/examples/controls`, if you want to borrow one.

A lot of the controls are disabled while the chart is running. Those change how the data is generated or held, and changing them mid-stream would be, well, messy. Click **Pause**, change them, and click **Run** again.

#### in the header

- **Run/Pause** – Starts and pauses the stream of data. **Run** starts the chart's *data source*, which subscribes to the stream, and **Pause** stops it. Pausing really does stop the stream – nothing keeps generating data in the background. And when you click **Run** again, the data picks up from where it left off, rather than starting over.
- **Reset** – Puts the example back the way it was when you first opened it: the initial data, the default settings, and the original zoom. It's disabled while the chart is running, so pause first.

#### in the panel

- **drop-after drop-down** – Data streaming into a chart piles up. This drop-down sets how long the data is kept: data older than 10, 20, 50, or 100 seconds (measured from the latest data) is dropped. Or, if you like living dangerously, "Keep All" keeps everything. *Wired to:* the data source's `dropDataAfter` option.
- **Number of Series** – How many series (lines, neurons, bars) the example generates. Changing it regenerates the initial data. *Wired to:* the initial data handed to the data source.
- **Update Rate (ms)** – How often (in milliseconds) the example's random-data generator produces a new data point for each series. This is how fast the data *arrives*, which isn't necessarily how fast the chart redraws (see the next two). *Wired to:* nothing in the library, actually – this one belongs to the example's data generator, which the data source subscribes to.
- **Buffering (ms)** – How long the chart collects incoming data before it redraws. Redrawing for every single data point would be wasteful when the data arrives every few milliseconds, so the chart batches the updates. Smaller values give smoother scrolling, but more redraws. *Wired to:* the `<Chart>`'s `windowingTime` property (along with `dataUpdatePeriod`, which tells the chart how often the data arrives, so it can batch evenly).
- **Cadence** – When checked, a field for the cadence period appears (25 ms to start with). With a cadence, the chart redraws on a steady beat, whether or not new data has arrived, so the time axis scrolls smoothly instead of jumping forward with each batch. That's especially handy when the data arrives slowly. When the data arrives quickly, the cadence is generally unnecessary. *Wired to:* the plot's `withCadenceOf` property.
- **Update Lag** – Not a control, but a read-out: how far the chart's time has fallen behind real time since you clicked **Run**. If the chart can't keep up with the data (too many series, arriving too often, with too little buffering), the lag grows – and the lag icon in the header turns red. This is a good way to find the limits of what a chart can handle. *Computed by:* the example, from the time the chart reports through its `onUpdateAxesBounds` (or `onUpdateChartTime`) callback.
- **RegEx filter** – Type a regular expression and only the series whose names match it are shown. For example, `1$` shows only the series whose names end in "1". An invalid expression (say, while you're still typing it) shows all the series. This one works while the chart is running. *Wired to:* the `<Chart>`'s `seriesFilter` property.
- **tooltip** – Shows a tooltip with details about the series (or data point) under the mouse. The tooltips are only available while the chart is paused – chasing a moving line with the mouse isn't much fun anyway. More on tooltips a few pages from now. *Wired to:* the `<Tooltip>`'s `visible` property.
- **tracker** – Shows a line that follows the mouse, with a label for its value on the axis. Also only available while the chart is paused. *Wired to:* the `<Tracker>`'s `visible` property.
- **highlight axes** – When checked, hovering over a series also highlights the axes it's plotted against. That's handy when a chart has more than one x- or y-axis (the scatter chart, for example, has two of each). *Wired to:* the plot's `highlightAxesOnMouseOver` property.

#### which example has which

|                    | Scatter | Raster | Poincare | Bar | Outlier |
|--------------------|:-------:|:------:|:--------:|:---:|:-------:|
| drop-after         |    ✓    |   ✓    |    ✓     |  ✓  |    ✓    |
| Number of Series   |    ✓    |   ✓    |          |  ✓  |         |
| Update Rate        |    ✓    |   ✓    |          |  ✓  |    ✓    |
| Buffering          |    ✓    |   ✓    |          |  ✓  |    ✓    |
| Cadence            |    ✓    |   ✓    |          |     |    ✓    |
| Update Lag         |    ✓    |   ✓    |    ✓     |  ✓  |    ✓    |
| RegEx filter       |    ✓    |   ✓    |          |  ✓  |    ✓    |
| tooltip            |    ✓    |   ✓    |    ✓     |  ✓  |    ✓    |
| tracker            |    ✓    |   ✓    |    ✓     |  ✓  |         |
| highlight axes     |    ✓    |   ✓    |    ✓     |  ✓  |    ✓    |

The next pages go through the examples one at a time – what each chart shows, and the controls that are specific to it.
