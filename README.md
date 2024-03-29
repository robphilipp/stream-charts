# <span id="top">stream-charts</span>
[Homepage](https://robphilipp.github.io/stream-charts/) •
[Code Docs](docs/index.html) •
[Change History](changes.md) •
[Example Project](https://github.com/robphilipp/stream-charts-examples)

`stream-charts` are [react](https://reactjs.org)-based time-series charts for viewing high frequency data, streamed in real-time using [rxjs](https://rxjs-dev.firebaseapp.com). Generally, update periods of 25 ms aren't a problem for about a hundred or so time-series. To achieve this type of performance, the charts are implemented using [d3](https://d3js.org) SVG elements, wrapped in react functional components, and keep chart updates outside the react render cycle.

### quick overview

With `stream-charts` you can display initial (or static) data as well as live data from an `Observable`.

`Charts` are composable using react components. So you can add different axis types, multiple axes, trackers, tooltips, and plots.

All aspects of the `Charts` style are exposed allowing you to use your favorite frameworks theme provider, or none at all.

`Charts` provide zooming and panning can be enabled or disabled. And zooming is set to use a modifier key by default so that it doesn't interfere with normal scrolling.

When using lower update frequencies, such as < 250 ms, and data updates are sparse, you can set an update cadence so that the plot's time smoothly scrolls, rather than updating only when new data arrives.

`Charts` can have a data TTL (time-to-live) to drop older data to allow long-running streams of data. With the data-update callback you can capture that data and store it in local storage, memory, or a location of your choice.


### project status
Although still under development, there are two charts available:

1. a neuron raster chart, and a
2. scatter chart.

Over time, I'll add additional chart types. In the meantime, I welcome any contributions to create new chart types (bar, gauges, etc).

## [&#10514;](#top) <span id="content">content</span>

**[quick start](#quick-start)**<br>
&nbsp;&nbsp;&nbsp;&nbsp;[example raster chart code](#example-raster-chart-code)<br>
&nbsp;&nbsp;&nbsp;&nbsp;[example scatter chart code](#example-scatter-chart-code)

**[intro](#intro)**<br>
&nbsp;&nbsp;&nbsp;&nbsp;[terminology](#terminology)<br>
&nbsp;&nbsp;&nbsp;&nbsp;[data ttl, time-windows, performance](#data-ttl)<br>

**[chart](#chart)**<br>
&nbsp;&nbsp;&nbsp;&nbsp;[&lt;Chart/&gt;](#chart-usage)<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[dimensions](#chart-usage-dimensions)<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[styling](#chart-usage-styling)<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[initial data](#chart-usage-initial-data)<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[streaming data](#chart-usage-streaming-data)<br>

**[axes](#axes)**<br>
&nbsp;&nbsp;&nbsp;&nbsp;[&lt;ContinousAxis/&gt;](#continuous-axes-usage)<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[base properties](#continuous-axes-usage-base)<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[styling](#continuous-axes-usage-styling)<br>

&nbsp;&nbsp;&nbsp;&nbsp;[&lt;CategoryAxis/&gt;](#category-axes-usage)<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[base properties](#category-axes-usage-base)<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[styling](#category-axes-usage-styling)<br>

**[plots](#plots)**<br>
&nbsp;&nbsp;&nbsp;&nbsp;[&lt;ScatterPlot/&gt;](#scatter-plot-usage)<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[base properties](#scatter-plot-usage-base)<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[view-modifying interactions](#scatter-plot-usage-view)<br>

&nbsp;&nbsp;&nbsp;&nbsp;[&lt;RasterPlot/&gt;](#raster-plot-usage)<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[base properties](#raster-plot-usage-base)<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[view-modifying interactions](#raster-plot-usage-view)<br>

**[utilities](#utilities)**<br>
&nbsp;&nbsp;&nbsp;&nbsp;[&lt;Tracker/&gt;](#tracker-usage)<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[base properties](#tracker-usage-base)<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[styling](#tracker-usage-styling)<br>

&nbsp;&nbsp;&nbsp;&nbsp;[&lt;Tooltip/&gt;](#tooltip-usage)<br>

&nbsp;&nbsp;&nbsp;&nbsp;[&lt;ScatterPlotTooltipContent/&gt;](#scatterplot-tooltip-usage)<br>

&nbsp;&nbsp;&nbsp;&nbsp;[&lt;RasterPlotTooltipContent/&gt;](#rasterplot-tooltip-usage)<br>


## [&#10514;](#content) <span id="quick-start">quick start</span>

```shell
npm install stream-charts
```

### [&#10514;](#content) <span id="example-raster-chart-code">example raster chart</span>
For the neuron raster chart (see [example](https://github.com/robphilipp/stream-charts-examples/blob/master/src/app/examples/StreamingRasterChart.tsx))

![raster-chart](https://github.com/robphilipp/stream-charts/blob/master/images/raster-magnifier.png?raw=true)


```typescript jsx
import {RasterChart} from "stream-charts";
// .
// .
// .
<Chart
    width={useGridCellWidth()}
    height={useGridCellHeight()}
    margin={{...defaultMargin, top: 60, right: 60}}
    color={theme.color}
    backgroundColor={theme.backgroundColor}
    seriesStyles={new Map([
        ['test1', {...defaultLineStyle, color: 'orange', lineWidth: 1, highlightColor: 'orange'}],
        ['test2', {...defaultLineStyle, 
            color: theme.name === 'light' ? 'blue' : 'gray', 
            lineWidth: 3, 
            highlightColor: theme.name === 'light' ? 'blue' : 'gray', 
            highlightWidth: 5}
        ],
    ])}
    initialData={initialDataRef.current}
    seriesFilter={filter}
    seriesObservable={observableRef.current}
    shouldSubscribe={running}
    windowingTime={35}
>
    <ContinuousAxis
        axisId="x-axis-1"
        location={AxisLocation.Bottom}
        domain={[0, 5000]}
        label="x-axis"
        // font={{color: theme.color}}
    />
    <ContinuousAxis
        axisId="x-axis-2"
        location={AxisLocation.Top}
        domain={[0, 10000]}
        label="x-axis"
        // font={{color: theme.color}}
    />
    <CategoryAxis
        axisId="y-axis-1"
        location={AxisLocation.Left}
        categories={initialDataRef.current.map(series => series.name)}
        label="y-axis"
    />
    <CategoryAxis
        axisId="y-axis-2"
        location={AxisLocation.Right}
        categories={initialDataRef.current.map(series => series.name)}
        label="y-axis"
    />
    <Tracker
        visible={visibility.tracker}
        labelLocation={TrackerLabelLocation.WithMouse}
        style={{color: theme.color}}
        font={{color: theme.color}}
        // onTrackerUpdate={update => console.dir(update)}
    />
    <Tooltip
        visible={visibility.tooltip}
        style={{
            fontColor: theme.color,
            backgroundColor: theme.backgroundColor,
            borderColor: theme.color,
            backgroundOpacity: 0.9,
        }}
    >
        <RasterPlotTooltipContent
            xFormatter={value => formatNumber(value, " ,.0f") + ' ms'}
            yFormatter={value => formatNumber(value, " ,.1f") + ' mV'}
        />
    </Tooltip>
    <RasterPlot
        axisAssignments={new Map([
            // ['test', assignAxes("x-axis-1", "y-axis-1")],
            ['test1', assignAxes("x-axis-2", "y-axis-2")],
            // ['test3', assignAxes("x-axis-1", "y-axis-1")],
        ])}
        dropDataAfter={10000}
        panEnabled={true}
        zoomEnabled={true}
        zoomKeyModifiersRequired={true}
        withCadenceOf={30}
    />
</Chart>
```

### [&#10514;](#content) <span id="example-scatter-chart-code">example scatter chart</span>

An example scatter chart  (see [example](https://github.com/robphilipp/stream-charts-examples/blob/master/src/app/examples/StreamingScatterChart.tsx))

![scatter-chart-tooltip](https://github.com/robphilipp/stream-charts/blob/master/images/scatter-tooltip.png?raw=true)


```typescript jsx
import {ScatterChart} from "stream-charts";
// .
// .
// .
<Chart
    width={useGridCellWidth()}
    height={useGridCellHeight()}
    margin={{...defaultMargin, top: 60, right: 60}}
    color={theme.color}
    backgroundColor={theme.backgroundColor}
    seriesStyles={new Map([
        ['test1', {...defaultLineStyle, color: 'orange', lineWidth: 1, highlightColor: 'orange'}],
        ['test2', {...defaultLineStyle, 
            color: theme.name === 'light' ? 'blue' : 'gray', 
            lineWidth: 3, 
            highlightColor: theme.name === 'light' ? 'blue' : 'gray', 
            highlightWidth: 5}
        ],
    ])}
    initialData={initialDataRef.current}
    seriesFilter={filter}
    seriesObservable={observableRef.current}
    shouldSubscribe={running}
    windowingTime={25}
>
    <ContinuousAxis
        axisId="x-axis-1"
        location={AxisLocation.Bottom}
        domain={[10, 5000]}
        label="x-axis"
    />
    <ContinuousAxis
        axisId="y-axis-1"
        location={AxisLocation.Left}
        domain={[0, 1000]}
        label="y-axis"
    />
    <ContinuousAxis
        axisId="x-axis-2"
        location={AxisLocation.Top}
        domain={[100, 2500]}
        label="x-axis (2)"
    />
    <ContinuousAxis
        axisId="y-axis-2"
        location={AxisLocation.Right}
        scale={d3.scaleLog()}
        domain={[100, 1200]}
        label="y-axis (2)"
    />
    <Tracker
        visible={visibility.tracker}
        labelLocation={TrackerLabelLocation.WithMouse}
        style={{color: theme.color}}
        font={{color: theme.color}}
        // onTrackerUpdate={update => console.dir(update)}
    />
    <Tooltip
        visible={visibility.tooltip}
        style={{
            fontColor: theme.color,
            backgroundColor: theme.backgroundColor,
            borderColor: theme.color,
            backgroundOpacity: 0.9,
        }}
    >
        <ScatterPlotTooltipContent
            xLabel="t (ms)"
            yLabel="count"
            yValueFormatter={value => formatNumber(value, " ,.0f")}
            yChangeFormatter={value => formatNumber(value, " ,.0f")}
        />
    </Tooltip>
    <ScatterPlot
        interpolation={interpolation}
        axisAssignments={new Map([
            ['test2', assignAxes("x-axis-2", "y-axis-2")],
        ])}
        dropDataAfter={10000}
        panEnabled={true}
        zoomEnabled={true}
        zoomKeyModifiersRequired={true}
        withCadenceOf={30}
    />
</Chart>
```

## [&#10514;](#content) <span id="intro">intro</span>

`stream-charts` aim to provide high-performance charts for displaying large amounts of data in real-time. The examples (above) show a scatter plot and raster plot whose data was updated about every 25 ms. These plots show 30 time-series of data each. 

> There are obviously limits to the amount of data, and the performance of the plots. For example, the raster chart plots thousands of lines in the chart. When displaying more data in the raster plot, update performance will suffer. Therefore, you must tune your plots somewhat when you are working in the limits of their performance. 
>
> The scatter chart can handle a larger number of series at 25 ms update frequency.

### [&#10514;](#content) <span id="terminology">terminology</span>

A &lt;Chart/&gt; holds a `plot`, the `axes`, and optionally, a &lt;Tracker/&gt;, and a &lt;Tooltip/&gt;. A &lt;Chart/&gt; is generic, and holds a specific type of `plot`, for example, a &lt;RasterPlot/&gt; or a &lt;ScatterPlot/&gt;. The `plot` holds the data, and optionally provides pan and zoom. The `axes` provide the scale of the data. For example, the scale could be a continuous numeric logarithmic scale, or a category scale. The `axes` are also generic. Though, a `plot` can restrict the type of `axes` allowed. For example, a &lt;RasterPlot/&gt; requires that the y-axes are category axes. &lt;Trackers/&gt; are generic. &lt;Tooltipes/&gt; are also generic, though the tooltip content is a child, specific to a plot type, that it knows how to interpret and present the data.

> **&lt;Chart/&gt;** [&#8628;](#chart)<br>
> Generic container which holds the `Axes`, `Plot`, `Tracker`, `Tooltip`.

> **Axes** [&#8628;](#axes)<br>
> Defines the scale of the data. `stream-charts` current has two axis types: [&lt;ContinousAxis/&gt;](#continuous-axes-usage) and [&lt;CategoryAxis/&gt;](#category-axes-usage). The &lt;ContinousAxis can be used as an x-axis or y-axis. However, the &lt;CategoryAxis/&gt; can only be used as a y-axes because these are all time-series charts and the x-axis currently only represents time (this will change in the future with additional plot types). 

> **Plot** [&#8628;](#plots)<br>
> The plot is a container for the data that uses the `axes` for scale, domain, and range information. Plots provide panning and zooming of the x-axis (time), interacting with the `axes` to update the time-range. The plot is the visual representation of the data. Currently, two type of plots are available: [&lt;RasterPlot/&gt;](#raster-plot-usage), and [&lt;ScatterPlot/&gt;](#scatter-plot-usage).

> **&lt;Tracker/&gt;** [&#8628;](#tracker-usage)<br>
> The tracker displays the current plot time of the mouse. When multiple x-axes are used in the chart, then the tracker displays both times (i.e. from the upper and lower x-axis).

> **&lt;Tooltip/&gt;** [&#8628;](#tooltip-usage)<br>
> The tooltip is a generic component for rendering information about the data when the user mouses over a series or datum. The `<Tooltip/>` expects a child component that understands the data and renders the information show in the tooltip. For example, when using a [&lt;RasterPlot/&gt;](#raster-plot-usage), the [&lt;RasterPlotTooltipContent/&gt;](#rasterplot-tooltip-usage) renders the data for the raster plot tooltip. And when using a [&lt;ScatterPlot/&gt;](#scatter-plot-usage), the [&lt;ScatterPlotTooltipContent/&gt;](#scatterplot-tooltip-usage) renders the data for the scatter plot tooltip. The tooltip content can be extended.

### [&#10514;](#content) <span id="data-ttl">data ttl, time-windows, performance</span>

The `stream-charts` have been designed to work with fairly large amounts of high frequency data. When the data time exceeds the larges time on the x-axes, the chart begins to scroll, shifting the time-window to keep up with the present data time. The data that *falls off* the chart is held in memory and can be viewed by changing the time-window with "zoom" or panning to earlier times.

For long-running charts, the amount of data may get large. Because of this, each `stream-charts` plot provides a data time-to-live (TTL) setting called `dropDataAfter` which is the number of milliseconds, in chart time, after which the data is dropped. The TTL applies to data that *falls off* the chart. The TTL does not refer to real time. The data will not dissappear fro the plot of the `dropDataAfter` milliseconds (see [dropDataAfter](#raster-plot-drop) for raster plots, and [dropDataAfter](#scatter-plot-drop) for scatter plots).

As the amount of data and the update frequency increase, you have three levers to make your plots run more smoothly when the start to stutter. Each set of streaming data is unique and may require tuning when the default settings aren't giving the desired results.

1. **Drop data with the data TTL.** By dropping data, `d3` has less data to manage and will run faster. Without TTD, the data the falls off the time-window as the plot scroll is still kept in memory, and is still processed by `d3`, but it is clipped, and so not shown. Dropping data will reduce the processing load as data is streamed in. To later view that dropped data, you can store the data from your observable with a separate observer, and when the streaming is complete, load that data once into the plot.
2. **Decrease the windowing-time.** The windowing-time, not to be confused with the time-window described below, determines how long (in milliseconds) the incoming data is buffered before the plot is updated. Longer windowing times give better performance, though, at the cost of more choppy scrolling.
3. **Decrease the time-window.** The time-window is defined by the (min, max) time values of your axes. Smaller time-windows mean less data, but also it will stream by faster.

As a final note, generally, the &lt;ScatterPlot/&gt; performs better than the &lt;RasterPlot/&gt;.

## [&#10514;](#content) <span id="chart">chart</span>

The `stream-charts` module wraps [d3](http://d3js.org) elements with functional [react](http://reactjs.org) in a way that keeps the chart (d3) updates out of the react render cycle. All `stream-charts` start with the [&lt;Chart/&gt;](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/Chart.tsx) root element.

### [&#10514;](#content) <span id="chart-usage">&lt;Chart/&gt;</span>

The `Chart` component creates the main SVG element (container) holding the chart, manages a reference to that container, and is the wraps the children in the chart context provider so that they have access to the [useChart](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/hooks/useChart.tsx) hook which holds properties, styles, callbacks, subscription needed to construct the charts and make them interactive.

The `Chart`s properties fall into four categories:
1. container dimensions
2. chart style
3. initial (static data)
4. streamed data and how to manage the stream of data

#### [&#10514;](#content) <span id="chart-usage-dimensions">&lt;Chart/&gt; dimensions</span>
> **width (pixels)**<br>
> The width (in pixels) of the container that holds the chart. The actual plot will be smaller based on the margins.

> **height (pixels)**<br>
> The height (in pixels) of the container that holds the chart. The actual plot will be smaller based on the margins.

#### [&#10514;](#content) <span id="chart-usage-styling">&lt;Chart/&gt; styling</span>
> **margin ([Margin](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/margins.ts), optional)**<br>
> The margin (in pixels) around plot. For example, if the container has a (h, w) = (300, 600) and a margin of 10 pixels for the top, left, right, bottom, then the actual plot will have a (h, w) = (290, 590), leaving only 10 pixels around the plot for axis titles, ticks, and axis labels. 
> 
> The Margin has the following shape 
>```typescript
>interface Margin {
>   top: number
>   bottom: number
>   left: number
>   right: number
>}
>```


> **color (string, optional)**<br>
> The color of the axis lines and text, which can be overridden specifically by the axes styles.

> **backgroundColor (string, optional)**<br>
> The color of the chart background (the whole chart, not just the plot).

> **svgStyle ([SvgStyle](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/svgStyle.ts), optional)**<br>
> The style attributes for the main SVG element, in case you want to change those. Generally, this is not needed.
> 
> The SvgStyle has the following shape 
>```typescript
>interface SvgStyle {
>   height?: string | number 
>   width?: string | number 
>   outline?: string
>   // any valid SVG CSS attribute
>   [propName: string]: any
>}
>```

> **seriesStyles (Map&lt;string, [SeriesLineStyle](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/axes.ts) &gt;, optional)**<br>
> A map holding the data series name with an associated SeriesLineStyle. Any series listed in this map will use the associated styles for that series. Any series not in the map will use the default series styles.
> 
> The SeriesLineStyle has the following shape
> ```typescript
> interface SeriesLineStyle {
>    color: string
>    lineWidth: number
>    // the color of the series when the user mouses over the series
>    highlightColor: string
>    // the line width of the series when the user mouses over the series 
>    highlightWidth: number
>    // the line margin used for raster charts
>    margin?: number
> }
>```

#### [&#10514;](#content) <span id="chart-usage-initial-data">&lt;Chart/&gt; initial data</span>

Holds the initial (static data). This data is displayed in the chart even before subscribing to the chart-data observable. The initial data can be used to generate static charts.

> **initialData (Array<[Series](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/datumSeries.ts) >)**<br>
> An array holding the initial data series to be plotted before subscribing to the chart-data observable.  
>
> The Series has the following shape
> ```typescript
> interface Series {
>    // the series name
>    readonly name: string;
>    // the array of time-value pairs
>    data: Array<Datum>;
>    // ... accessor functions
>    . 
>    . 
>    . 
> }
>
>```
> And the [Datum](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/datumSeries.ts) is an immutable object that has the following shape 
> ```typescript
> interface Datum {
>    readonly time: number;
>    readonly value: number;
> }
>```
> There are a number of helper functions for creating `Series` and `Datum`.
>> `seriesFrom(name: string, data: Array<Datum> = []): Series`<br>
>> `seriesFromTuples(name: string, data: Array<[number, number]> = []): Series`<br>
>> `emptySeries(name: string): Series`<br>
>> `emptySeriesFor(names: Array<string>): Array<Series>`<br>

#### [&#10514;](#content) <span id="chart-usage-streaming-data">&lt;Chart/&gt; streaming data</span>

A set of properties, functions, and callbacks to control and observe the streaming of live data into the chart.

> **seriesObservable (Observable<[ChartData](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/chartData.ts) >)**<br>
> An observable of (source for) chart-data. The `shouldSubscribe` property controls whether the chart subscribes to the observable, or unsubscribes. This is the source of live data to the chart. An example of an observable is shown below.
> ```typescript
> function randomSpikeDataObservable(
>     series: Array<Series>,
>     updatePeriod: number = UPDATE_PERIOD_MS,
>     spikeProbability: number = 0.1
> ): Observable<ChartData> {
>   const seriesNames = series.map(series => series.name)
>   const initialData = initialChartData(series)
>   return interval(updatePeriod).pipe(
>     // convert the number sequence to a time
>     map(sequence => (sequence + 1) * updatePeriod),
>     // create a random spike for each series
>     map((time) => randomSpikeData(time, seriesNames, initialData.maxTimes, updatePeriod, spikeProbability))
>   )
> }
> ```

> **shouldSubscribe (boolean, optional, default = false)**<br>
> Optional property, that when set from `false` to `true`, causes the &lt;Chart/&gt; to subscribe to the chart-data observable. When set to `false` after a subscription, causes the &lt;Chart/&gt; to unsubscribe from the chart-data observable. 

> **windowingTime (number, milliseconds, optional, default = 100 ms)**<br>
> Optional property that defines a time-window during which incoming events are buffered, and then handed to plot, causing the plot to update. The `windowingTime` defines the maximum plot update rate, though not the maximum data update rate. The larger the windowing time, the fewer updates per unit time, and the more choppy the updates. Large amounts of data with high update rates can cause rendering delays. The windowing time provides a lever to manage the plot update rates to get the smoothest plot updates that keep up with real-time.

> **shouldSubscribe (number, optional, default = false)**<br>
> Optional property that default to `false`. When changed to `true`, from `false`, signals the &lt;Chart/&gt; to subscribe to the `seriesObservable`, streaming in the `ChartData` and updating the &lt;Chart/&gt; in real-time.

> **onSubscribe (callback function, (subscription: Subscription) => void, optional, default = noop**<br>
> Optional callback function that is called when the &lt;Chart/&gt; subscribes to the `ChartData` observable.

> **onUpdateData (callback function, (seriesName: string, data: Array<Datum>)) => void, optional, default = noop)**<br>
> Optional callback function that is called when the data updates. This callback can be used if you would like to respond to data updates. For example, use this callback if you would like to have the plot drop data after 10 seconds, but would like to store that data in an in-browser database. Though, a more efficient way to store the data would be to subscribe to the series-observable separately, and then use that observer to stream the data to the storage.

> **onUpdateTime (callback function, (times: Map<string, [start: number, end: number]>) => void, optional, default = noop)**<br>
> Optional callback this is called whenever the time-ranges change. Use this to track the current time of the plot.

## [&#10514;](#content) <span id="axes">axes</span>

### [&#10514;](#content) <span id="continuous-axes-usage">&lt;ContinuousAxis/&gt;</span>

The &lt;ContinuousAxis/&gt; must be a child of the &lt;Chart/&gt;. Each &lt;Chart/&gt can one or two continuous axes for the x-axes and for the y-axes. When a &lt;Chart/&gt has multiple x-axes or y-axes then you must assign series to the axes in one of the `Plot` components. Any series that are not explicitly assigned an axis will be assigned to the default x-axis or y-axis. The default x-axis is the bottom axis in the &lt;Chart/&gt, and the default y-axis is the left-hand side axis in the &lt;Chart/&gt.

When creating a &lt;ContinuousAxis/&gt;, you must specify its location using the `AxisLocation` enum defined in the [axes.ts](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/axes.ts) file. Each axis must have a unique axis ID. By default a &lt;ContinuousAxis/&gt; will have a linear scale (d3.scaleLinear). The `scale` property can by used to set the scale to a `log` (d3.scaleLog) or `power` (d3.scalePow) scale or any other continuous numeric scale available in `d3`. The `domain` property defines the initial min and max values for the axis, and when data streams into the plot, that defines the time-window displayed for the axis (unless changed by a zoom event).

#### [&#10514;](#content) <span id="continuous-axes-usage-base">&lt;ContinuousAxis/&gt; base properties</span>

The base properties defining the axis.

> **axisId (string)**<br>
> The unique ID of the axis. The axis can then be referred to by this ID. For example, when assigning axes to series, the assignment is made by associating the axis ID to the series name.

> **location ([AxisLocation](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/axes.ts) )**<br>
> The location of the axis. As defined by the `AxisLocation` in the the [axes.ts](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/axes.ts) file, x-axes can be placed on the `bottom` or the `top`, and y-axes can be placed on the `left` or the `right`. 

> **scale (ScaleContinuousNumeric<number, number>, optional, default = d3.scaleLinear)**<br>
> The optional scale (factory) of the continuous axis. The scale of the axis is like the axis ruler and determines how the points are placed on the screen. For example, a linear scale is like an evenly spaced ruler, and the mapping between screen location and data value are linear. As another example, the log scale has a logarithmic mapping between the screen location and the data. The scale can be a linear scale (default scale, d3.scaleLinear), a logarithmic scale (d3.scaleLog), a power scale (d3.scalePower), or any other d3 continouos numeric scale that works. Not that if a chart, for example, has two x-axes, that the x-axes are **not** required to have the same scale.

> **domain ([min: number, max: number])**<br>
> The domain of the axis (in d3 terminology) is effectively the minimum value of the axis and the maximum value of the axis when the initial data is displayed. The domain defines the time-window of the displayed data. For example, if the `domain` for an x-axis is specified as `[1000, 6000]`, then the axis starts at `1000` and ends at `6000`, and the time-window is `5000`. Once data starts to stream past the axis end, the plot starts to scroll, maintaining the calculated time-window (in out example, 5000). Of course, a zooming event will change the domain, and also the time-window.

> **label (string)**<br>
> The axis label.

#### [&#10514;](#content) <span id="continuous-axes-usage-styling">&lt;ContinuousAxis/&gt; styling</span>

A set of properties to update the style of the axes.

> **font (Partial<[AxesLabelFont](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/axes.ts) >)**<br>
> An optional CSS properties specifying the font for the axis and tick labels.


### [&#10514;](#content) <span id="category-axes-usage">&lt;CategoryAxis/&gt;</span>

The &lt;CategoryAxis/&gt; must be a child of the &lt;Chart/&gt;. Each &lt;Chart/&gt can one or two category axes for the y-axes. Unlike the [&lt;ContinousAxis/&gt;](#continuous-axes-usage), the &lt;CategoryAxis/&gt; can only be used as a y-axis because for stream charts (at this point) the x-axes represent time. In the same way as with the [&lt;ContinousAxis/&gt;](#continuous-axes-usage), when using multiple multiple y-axes you must assign the series to the axes in one of the `Plot` components. Any series that are not explicitly assigned an axis will be assigned to the default y-axis, which is the left-hand side axis in the &lt;Chart/&gt.

When creating a &lt;CategoryAxis/&gt;, you must specify its location using the `AxisLocation` enum defined in the [axes.ts](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/axes.ts) file. Each axis must have a unique axis ID. The &lt;CategoryAxis/&gt; uses a band scale (d3.scaleLinear).

#### [&#10514;](#content) <span id="category-axes-usage-base">&lt;CategoryAxis/&gt; base properties</span>

The base properties defining the axis.

> **axisId (string)**<br>
> The unique ID of the axis. The axis can then be referred to by this ID. For example, when assigning axes to series, the assignment is made by associating the axis ID to the series name.

> **location ([AxisLocation](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/axes.ts) )**<br>
> The location of the axis. As defined by the `AxisLocation` in the the [axes.ts](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/axes.ts) file, x-axes can be placed on the `bottom` or the `top`, and y-axes can be placed on the `left` or the `right`.

> **categories (Array<string>)**<br>
> The required `categories` property holds the names of the categories, in the order that they will be displayed on the axis. The first element in the array will be on shown at the top of the axis. The second element will be on lower, and the last element will be at the bottom of the axis.

> **domain ([min: number, max: number])**<br>
> The domain of the axis (in d3 terminology) is effectively the minimum value of the displayed axis and the maximum value of the displayed axis when the initial data is displayed. The domain defines the time-window of the displayed data. For example, if the `domain` for an x-axis is specified as `[1000, 6000]`, then the axis starts at `1000` and ends at `6000`, and the time-window is `5000`. Once data starts to stream past the axis end, the plot starts to scroll, maintaining the calculated time-window (in out example, 5000). Of course, a zooming event will change the domain, and also the time-window.

> **label (string)**<br>
> The axis label.

#### [&#10514;](#content) <span id="category-axes-usage-styling">&lt;CategoryAxis/&gt; styling</span>

A set of properties to update the style of the axes.

> **font (Partial<[AxesLabelFont](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/axes.ts) >, optional)**<br>
> An optional CSS properties specifying the font for the axis and tick labels.


## [&#10514;](#content) <span id="plots">plots</span>

### [&#10514;](#content) <span id="scatter-plot-usage">&lt;ScatterPlot/&gt;</span>

In `stream-charts`, the `plot` is the data visualization component. To work, a plot must be a child of the &lt;Chart/&gt; component so that it is plugged into the `stream-charts` ecosystem. The plot determines how to render the data. But it relies on the axes to determine scaling information so that it can map data to screen locations. And therefore, a plot must have sibling axes ([&lt;ContinousAxis/&gt;](#continuous-axes-usage), [&lt;CategoryAxis/&gt;](#category-axes-usage)) components for the x-axis and the y-axis. Because the plot is responsible for data visualization, it is also where the data series are assigned to axes. The assignment of axes to series is optional, and any series not explicitly assigned to an axis will be assigned to the default axes. The default x-axis is the bottom axis, and the default y-axis is the axis on the left-hand side of the plot. 

The plot determines what view-modifying user interactions are available. Specifically, panning the data to the left and right in time, and zooming in time.

The &lt;ScatterPlot/&gt; specifically is used to plot time-series data, where the x-values are time. The x-axis and y-axis are required to be a [&lt;ContinousAxis/&gt;](#continuous-axes-usage).

#### [&#10514;](#content) <span id="scatter-plot-usage-base">&lt;ScatterPlot/&gt; base properties</span>

> **axisAssignments (Map<string, [AxesAssignment](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/plot.ts) >, optional, default = Map())**<br>
> An optional property that assigns data series to (x, y)-axes. Any series not assigned to an axis will use the default axis. The default x-axis is the bottom axis, and the default y-axis is the axis on the left-hand side of the plot. The `Map` associates the series name with an [AxesAssignment](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/plot.ts), which is a simple object (`{xAxis: string, yAxis: string}`) that holds the axis ID for the x-axis and for the y-axis assigned to the series.

> **interpolation (d3.CurveFactory, optional, default = d3.curveLinear)**<br>
> An optional property that defines how the data series line will be interpolated between individual data points. You can use any valid [d3.CurveFactory](https://github.com/d3/d3-shape#curves) for the interpolation. Changing the interpolation once the data is already display, will cause a re-render of the data with the new interpolation.

> <span id="scatter-plot-drop">**dropDataAfter (number, milliseconds, opitional, default = Infinity)**</span><br>
> Optional property that sets when to drop data (effectively a TTL). This only drops data while streaming. Don't worry, your data won't disappear after the streaming has stopped. By default, none of the data is dropped. However, when large amounts of data are being streamed and plotted over long periods of time, memory and performance may become an issue. Setting this value allows a scrolling chart to run forever without running into resource issues.

#### [&#10514;](#content) <span id="scatter-plot-usage-view">&lt;ScatterPlot/&gt; view-modifying interactions</span>

View-modifying interactions are those that change the way the data is displayed. For example, zooming in time, panning in time.

> **panEnabled (boolean, optional, default = false)**<br>
> Optional property that defaults to `false`. When set to `true` then enables "panning" which allows the user to drag the plot to the left and right.

> **zoomEnabled (boolean, optional, default = false)**<br>
> Optional property that defaults for `false`. When set to `true` then enables "zooming" which allows the user to increase or decrease the displayed time range. By default, scrolling will cause the zoom effect. See the `zoomKeyModifiersRequired` property which requires the `shift` key to be pressed in order for the zoom action to apply.

> **zoomKeyModifiersRequired (boolean, optional, default = false)**<br>
> An optional property that defaults to `false`. When set to `true`, and the `zoomEnabled` property is also set to `true`, then requires that the `shift` key be pressed when scrolling in order to activate the zoom. This is nice when a user can scroll through your page containing the plot, so that zooming doesn't interfere with scrolling. 

> **withCadenceOf (number, optional, default = undefinded)**<br>
> An optional property that defaults to `undefined`. When set, uses a cadence with the specified refresh period (in milliseconds). For plots with slow data updates (> 100 ms) using a cadence of 10 to 25 ms smooths out the updates so the time scrolling doesn't appear choppy. When updates are around 25 ms or less, then setting the cadence period too small will result in poor update performance. Generally at high update speeds, the cadence is unnecessary. Finally, using cadence, sets the max time to the current time. See also the related &lt;Chart/&gt's `windowingTime` property.


### [&#10514;](#content) <span id="raster-plot-usage">&lt;RasterPlot/&gt;</span>

In `stream-charts`, the `plot` is the data visualization component. To work, a plot must be a child of the &lt;Chart/&gt; component so that it is plugged into the `stream-charts` ecosystem. The plot determines how to render the data. But it relies on the axes to determine scaling information so that it can map data to screen locations. And therefore, a plot must have sibling axes ([&lt;ContinousAxis/&gt;](#continuous-axes-usage), [&lt;CategoryAxis/&gt;](#category-axes-usage)) components for the x-axis and the y-axis. Because the plot is responsible for data visualization, it is also where the data series are assigned to axes. The assignment of axes to series is optional, and any series not explicitly assigned to an axis will be assigned to the default axes. The default x-axis is the bottom axis, and the default y-axis is the axis on the left-hand side of the plot.

The plot determines what view-modifying user interactions are available. Specifically, panning the data to the left and right in time, and zooming in time.

The &lt;RasterPlot/&gt; specifically is used to plot event-timing data, where the x-values are time, and the y-values are a category to which the event belongs. The x-axis is required to be a [&lt;ContinousAxis/&gt;](#continuous-axes-usage), and the y-axis is required to the a [&lt;CategoryAxis/&gt;](#category-axes-usage). 

#### [&#10514;](#content) <span id="raster-plot-usage-base">&lt;RasterPlot/&gt; base properties</span>

> **axisAssignments (Map<string, [AxesAssignment](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/plot.ts) >, optional, default = Map())**<br>
> An optional property that assigns data series to (x, y)-axes. Any series not assigned to an axis will use the default axis. The default x-axis is the bottom axis, and the default y-axis is the axis on the left-hand side of the plot. The `Map` associates the series name with an [AxesAssignment](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/plot.ts), which is a simple object (`{xAxis: string, yAxis: string}`) that holds the axis ID for the x-axis and for the y-axis assigned to the series.

> <span id="raster-plot-drop">**dropDataAfter (number, milliseconds, opitional, default = Infinity)**</span><br>
> Optional property that sets when to drop data (effectively a TTL). This only drops data while streaming. Don't worry, your data won't disappear after the streaming has stopped. By default, none of the data is dropped. However, when large amounts of data are being streamed and plotted over long periods of time, memory and performance may become an issue. Setting this value allows a scrolling chart to run forever without running into resource issues.

> **spikeMargin (number, pixels, default = 2)**<br>
> Optional property that adds a margin to the top and bottom of the raster (event) lines to give vertical spacing to the events in the plot. Margins on individual series can also be set through the [Chart.seriesStyles](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/hooks/useChart.tsx) property.

#### [&#10514;](#content) <span id="raster-plot-usage-view">&lt;RasterPlot/&gt; view-modifying interactions</span>

View-modifying interactions are those that change the way the data is displayed. For example, zooming in time, panning in time.

> **panEnabled (boolean, optional, default = false)**<br>
> Optional property that defaults to `false`. When set to `true` then enables "panning" which allows the user to drag the plot to the left and right.

> **zoomEnabled (boolean, optional, default = false)**<br>
> Optional property that defaults for `false`. When set to `true` then enables "zooming" which allows the user to increase or decrease the displayed time range. By default, scrolling will cause the zoom effect. See the `zoomKeyModifiersRequired` property which requires the `shift` key to be pressed in order for the zoom action to apply.

> **zoomKeyModifiersRequired (boolean, optional, default = false)**<br>
> An optional property that defaults to `false`. When set to `true`, and the `zoomEnabled` property is also set to `true`, then requires that the `shift` key be pressed when scrolling in order to activate the zoom. This is nice when a user can scroll through your page containing the plot, so that zooming doesn't interfere with scrolling.

> **withCadenceOf (number, optional, default = undefinded)**<br>
> An optional property that defaults to `undefined`. When set, uses a cadence with the specified refresh period (in milliseconds). For plots with slow data updates (> 100 ms) using a cadence of 10 to 25 ms smooths out the updates so the time scrolling doesn't appear choppy. When updates are around 25 ms or less, then setting the cadence period too small will result in poor update performance. Generally at high update speeds, the cadence is unnecessary. Finally, using cadence, sets the max time to the current time. See also the related &lt;Chart/&gt's `windowingTime` property.

## [&#10514;](#content) <span id="utilities">utilities</span>

### [&#10514;](#content) <span id="tracker-usage">&lt;Tracker/&gt;</span>

The tracker, when enabled, follows the mouse when it is in the plot area, renders a vertical line from the bottom x-axis to the top of the plot, and displays the time value for either one or both the x-axes.

#### [&#10514;](#content) <span id="tracker-usage-base">&lt;Tracker/&gt; base properties</span>

> **visible (boolean)**<br>
> When set to `true` the tracker is visible when the mouse is in the plot area. When set to `false` the tracker is not shown.

> **labelLocation ([TrackerLabelLocation](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/Tracker.tsx), optional, default = TrackerLabelLocation.WithMouse)**<br>
> Optional property specifies the location of the label. The `TrackerLabelLocation` is an enumeration with three values `Nowhere`, `WithMouse`, and `ByAxes`. By default, the label location is with the mouse (i.e. `WithMouse`). The `Nowhere` location can be used to hide the label, in cases where you would like to use your own. The `WithMouse` value has the label follow the mouse in the vertical direction along the tracker line. And the `ByAxes` displays the labels next to their respective axes, with the tracker line.

> **onTrackerUpdate ((update: TrackerAxisUpdate) => void, optional, default = noop)**<br>
> Optional callback function that accepts the update from the tracker. Use this to display the tracker and data information outside of the &lt;Chart/&gt. The `TrackerAxisUpdate` is a `Map<string, TrackerAxisInfo>`, the `TrackerAxisInfo` has the shape `{x: number, axisLocation: AxisLocation}`, and the `AxisLocation` is an same enumeration used for placing the axes on the chart (i.e. `AxisLocation.Bottom`, `AxisLocation.Top`).


#### [&#10514;](#content) <span id="tracker-usage-styling">&lt;Tracker/&gt; styling</span>

> **style ([TrackerStyle](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/trackerUtils.ts), optional, default = {visible: false, color: '#d2933f', lineWidth: 1})**<br>
> Optional property defining the style for the tracker line. Has a shape of `{visible: boolean, color: string, lineWidth: number}`.

> **font ([TrackerLabelFont](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/trackerUtils.ts), optional, default = {size: 12, color: '#d2933f', weight: 300, family: 'sans-serif'})**<br>
> Optional property defining the font for the tracker label. Has a shape of `{size: number, color: string, family: string, weight: number}`.


### [&#10514;](#content) <span id="tooltip-usage">&lt;Tooltip/&gt;</span>

A tooltip renders information about the data over which the mouse is hovering. The &lt;Tooltip/&gt; component in `stream-charts` is the container for the tooltip content. It is responsible for rendering the area in which the tooltip contents are displayed. The tooltip content is a child of the &lt;Tooltip/&gt; component so that it can be (relatively) easily extended. Currently `stream-charts` has two tooltip contents, one for each plot type (&lt;ScatterPlotTooltipContent/&gt; and &lt;RasterPlotTooltipContent/&gt;). Each of these will be covered after we discuss the &lt;Tooltip/&gt;.

The properties for the lt;Tooltip/&gt; are simple and limited. The tooltip content components have more options.

> **visible (boolean)**<br>
> When set to `true` the the tooltip is shown when the mouse hovers over a data series or point.

> **style ([TooltipStyle](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/tooltipUtils.ts), optional, default = [defaultTooltipStyle](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/tooltipUtils.ts) )**<br>
> Optional property defining the style of the tooltip. The following style elements are available
> 1. **visible**<br>Visibility of the tooltip when the mouse hovers over a data series or point
> ---
> 2. **fontSize**<br>The size of the font displayed in the tooltip
> 3. **fontColor**<br>The color of the text displayed in the tooltip
> 4. **fontFamily**<br>The font weight for the text displayed in the tooltip
> 5. **fontWeight**<br>The font weight for the text displayed in the tooltip
> ---
> 6. **backgroundColor**<br>The background color of the tooltip
> 7. **backgroundOpacity**<br>The opacity of the background (i.e. how transparent it is)
> ---
> 8. **borderColor**<br>The color of the border surrounding the tooltip content
> 9. **borderWidth**<br>The width of the border surrounding the tooltip content
> 10. **borderRadius**<br>The radius of the border surrounding the tooltip content
> ---
> 11. **paddingLeft**<br>The padding to the left of the tooltip content
> 12. **paddingRight**<br>The padding to the right of the tooltip content
> 13. **paddingTop**<br>The padding to the top of the tooltip content
> 14. **paddingBottom**<br>The padding to the bottom of the tooltip content

> **children (&lt;ScatterPlotTooltipContent/&gt; and &lt;RasterPlotTooltipContent/&gt;)**<br>
> The tooltip content.


### [&#10514;](#content) <span id="scatterplot-tooltip-usage">&lt;ScatterPlotTooltipContent/&gt;</span>

The &lt;ScatterPlotTooltipContent/&gt; renders a table displaying the series datum that immediately precedes the mouse location, and immediately follows the mouse location. The first row shows the x-values, and the second row shows the y-values. The table below maps the properties to the table elements they effect.

---
series name

|  | beforeHeader | afterHeader | deltaHeader |
|---|-------------|-------------|-------------|
| xLabel | xValueFormatter | xValueFormatter | xChangeFormatter |
| yLabel | yValueFormatter | yValueFormatter | yChangeFormatter |

---

> **xLabel (string)**<br>
> Required property that gives a name to the x-values. This is the label for the x-values in the tooltip.

> **yLabel (string)**<br>
> Required property that gives a name to the y-values. This is the label for the y-values in the tooltip.

> **beforeHeader (string, optional, default = 'before')**<br>
> Optional property that gives a name to the data point that is immediately before the mouse location.

> **afterHeader (string, optional, default = 'after')**<br>
> Optional property that gives a name to the data point that is immediately after the mouse location.

> **deltaHeader (string, optional, default = '∆')**<br>
> Optional property that gives a name to the difference between the datum immediately before and after the mouse location.

> **xValueFormatter ((value: number) => string, optional, default =** [**formatTime**](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/utils.ts) <br>
> Optional function that formats the x-value immediately before and after the mouse location. The default function formats that x-values as natural numbers representing milliseconds.

> **yValueFormatter ((value: number) => string, optional, default =** [**formatValue**](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/utils.ts) <br>
> Optional function that formats the x-value immediately before and after the mouse location. The default function formats the y-values as floating point with 3 values to the right of the decimal point.

> **xChangeFormatter ((value1: number, value2: number) => string, optional, default =** [**formatTimeChange**](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/utils.ts) <br>
> Optional function that formats the change in the x-value of the points immediately before and after the mouse location. The default function formats the value as a natural number. 

> **yChangeFormatter ((value1: number, value2: number) => string, optional, default =** [**formatValueChange**](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/utils.ts) <br>
> Optional function that formats the change in the y-value of the points immediately before and after the mouse location. The default function formats the value as floating point with 3 values to the right of the decimal point.

> **style ([TooltipStyle](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/tooltipUtils.ts), optional, default = [defaultTooltipStyle](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/tooltipUtils.ts) )**<br>
> Optional styles for the tooltip content. The styles are the same as those for the &lt;Tooltip/&gt;.


### [&#10514;](#content) <span id="rasterplot-tooltip-usage">&lt;RasterTooltipContent/&gt;</span>
The &lt;RasterPlotTooltipContent/&gt; shows the series name, the time and value of the point over which the mouse is hovering. There are only three properties.

> **xFormatter ((value: number) => string, optional, default =** [**formatTime**](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/utils.ts) <br>
> Optional function that formats the x-value immediately before and after the mouse location. The default function formats that x-values as natural numbers representing milliseconds.

> **yFormatter ((value: number) => string, optional, default =** [**formatValue**](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/utils.ts) <br>
> Optional function that formats the x-value immediately before and after the mouse location. The default function formats the y-values as floating point with 3 values to the right of the decimal point.

> **style ([TooltipStyle](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/tooltipUtils.ts), optional, default = [defaultTooltipStyle](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/tooltipUtils.ts) )**<br>
> Optional styles for the tooltip content. The styles are the same as those for the &lt;Tooltip/&gt;.

## building

Building
```shell
npm install
npm run build
```

Packaging
```shell
npm pack
```

Testing
```shell
npm run test
```

Creating docs
```shell
npm install typedoc
npx typedoc src/app/charts/*
```