# <span id="top">stream-charts</span>
[Homepage](https://robphilipp.github.io/stream-charts/) •
[Code Docs](docs/index.html) •
[Change History](changes.md) •
[Example Project](https://github.com/robphilipp/stream-charts-examples)

`stream-charts` are [react](https://reactjs.org)-based time-series charts for viewing high frequency data, streamed in real-time using [rxjs](https://rxjs-dev.firebaseapp.com). Generally, update periods of 25 ms aren't a problem for about a hundred or so time-series. To achieve this type of performance, the charts are implemented using [d3](https://d3js.org) SVG elements, wrapped in react functional components, and keeping the chart updates outside the react render cycle.

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
<span style="margin-left: 15px">[example raster chart code](#example-raster-chart-code)</span><br>
<span style="margin-left: 15px">[example scatter chart code](#example-scatter-chart-code)</span>

**[intro](#intro)**<br>
<span style="margin-left: 15px">[terminology](#terminology)</span><br>

**[usage](#usage)**<br>
<span style="margin-left: 15px">[&lt;Chart/&gt;](#chart-usage)</span><br>
<span style="margin-left: 30px">[dimensions](#chart-usage-dimensions)</span><br>
<span style="margin-left: 30px">[styling](#chart-usage-styling)</span><br>
<span style="margin-left: 30px">[initial data](#chart-usage-initial-data)</span><br>
<span style="margin-left: 30px">[streaming data](#chart-usage-streaming-data)</span><br>

<span style="margin-left: 15px">[&lt;ContinousAxis/&gt;](#continuous-axes-usage)</span><br>
<span style="margin-left: 30px">[base properties](#continuous-axes-usage-base)</span><br>
<span style="margin-left: 30px">[styling](#continuous-axes-usage-styling)</span><br>

<span style="margin-left: 15px">[&lt;CategoryAxis/&gt;](#category-axes-usage)</span><br>
<span style="margin-left: 30px">[base properties](#category-axes-usage-base)</span><br>
<span style="margin-left: 30px">[styling](#category-axes-usage-styling)</span><br>


## [&#10514;](#content) <span id="quick-start">quick start</span>

```shell
npm install stream-charts
```

### [&#10514;](#content) <span id="example-raster-chart-code">example raster chart</span>
For the neuron raster chart (see [example](https://github.com/robphilipp/stream-charts-examples/blob/master/src/app/examples/StreamingRasterChart.tsx))

![raster-chart](images/raster-magnifier.png?raw=true)

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

![scatter-chart-tooltip](images/scatter-tooltip.png?raw=true)

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

A `chart` holds the `plot`, the `axes`, `tracker`, and `tooltip`. A `chart` is generic, and holds a specific type of `plot`, for example, a raster plot or a scatter plot. The `plot` holds the data, and provides pan and zoom. The `axes` provide the scale of the data. For example, the scale could be a continuous numeric logarithmic scale, or a category scale. The `axes` are also generic. Though, a `plot` can restrict what `axes` are allowed. For example, a raster plot requires that the y-axes are category axes. `trackers` are generic. `tooltips` are also generic, though they have a child that is specific to a plot so that it knows how to interpret and present the data.

> **&lt;Chart/&gt;** [&#8628;](#chart-usage)<br>
> Generic container which holds the `Axes`, `Plot`, `Tracker`, `Tooltip`.

> **Axes** [&#8628;](#)<br>
> Defines the scale of the data. `stream-charts` current has two axis types: `ContinuousAxis` and `CategoryAxis`. The `ContinuousAxis` can be used as an x-axis or y-axis. However, the `CategoryAxis` can only be used as a y-axes because these are all time-series charts and the x-axis currently only represents time (this will change in the future with additional plot types). 

> **Plot** [&#8628;](#)<br>
> The plot is a container for the data that uses the `axes` for scale, domain, and range information. Plots provide panning and zooming of the x-axis (time), interacting with the `axes` to update the time-range. The plot is the visual representation of the data.

> **&lt;Tracker/&gt;** [&#8628;](#)<br>
> The tracker displays the current plot time of the mouse. When multiple x-axes are used in the chart, then the tracker displays both times (i.e. from the upper and lower x-axis).

> **&lt;Tooltip/&gt;** [&#8628;](#)<br>
> The tooltip is a generic component for rendering information about the data when the user mouses over a series or datum. The `<Tooltip/>` expects a child component that understands the data and renders the information show in the tooltip. For example, when using a `<RasterPlot/>`, the `<RasterPlotTooltipContent/>` renders the data for the raster plot. The tooltip content can be extended.

## [&#10514;](#content) <span id="usage">usage</span>

The `stream-charts` module wraps [d3](http://d3js.org) elements with functional [react](http://reactjs.org) in a way that keeps the chart (d3) updates out of the react render cycle. All `stream-charts` start with the [`<Chart/>`](./src/app/charts/Chart.tsx) root element.

### [&#10514;](#content) <span id="chart-usage">&lt;Chart/&gt;</span>

The `Chart` component creates the main SVG element (container) holding the chart, manages a reference to that container, and is the wraps the children in the chart context provider so that they have access to the [useChart](./src/app/charts/hooks/useChart.tsx) hook which holds properties, styles, callbacks, subscription needed to construct the charts and make them interactive.

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
> **margin ([Margin](./src/app/charts/margins.ts), optional)**
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

> **svgStyle ([SvgStyle](./src/app/charts/svgStyle.ts), optional)**<br>
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

> **seriesStyles (Map<string, [SeriesLineStyle](./src/app/charts/axes.ts)>, optional)**<br>
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

> **initialData (Array<[Series](./src/app/charts/datumSeries.ts)>)**<br>
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
> And the [Datum](./src/app/charts/datumSeries.ts) is an immutable object that has the following shape 
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

> **seriesObservable (Observable<[ChartData](./src/app/charts/chartData.ts)>)**<br>
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

> **shouldSubscribe (boolean, optional)**<br>
> Optional property, that when set from `false` to `true`, causes the &lt;Chart/&gt; to subscribe to the chart-data observable. When set to `false` after a subscription, causes the &lt;Chart/&gt; to unsubscribe from the chart-data observable. 

> **windowingTime (number, milliseconds, optional, default = 100 ms)**<br>
> Optional property that defines a time-window during which incoming events are buffered, and then handed to plot, causing the plot to update. The `windowingTime` defines the maximum plot update rate, though not the maximum data update rate. The larger the windowing time, the fewer updates per unit time, and the more choppy the updates. Large amounts of data with high update rates can cause rendering delays. The windowing time provides a lever to manage the plot update rates to get the smoothest plot updates that keep up with real-time.

> **shouldSubscribe (number, optional, default = false)**<br>
> Optional property that default to `false`. When changed to `true`, from `false`, signals the &lt;Chart/&gt; to subscribe to the `seriesObservable`, streaming in the `ChartData` and updating the &lt;Chart/&gt; in real-time.

> **onSubscribe (callback function, (subscription: Subscription) => void)**<br>
> Optional callback function that is called when the &lt;Chart/&gt; subscribes to the `ChartData` observable.

> **onUpdateData (callback function, (seriesName: string, data: Array<Datum>) => void)**<br>
> Optional callback function that is called when the data updates. This callback can be used if you would like to respond to data updates. For example, use this callback if you would like to have the plot drop data after 10 seconds, but would like to store that data in an in-browser database. Though, a more efficient way to store the data would be to subscribe to the series-observable separately, and then use that observer to stream the data to the storage.

> **onUpdateTime (callback function, (times: Map<string, [start: number, end: number]>) => void)**<br>
> Optional callback this is called whenever the time-ranges change. Use this to track the current time of the plot.


### [&#10514;](#content) <span id="continuous-axes-usage">&lt;ContinuousAxis/&gt;</span>

The &lt;ContinuousAxis/&gt; must be a child of the &lt;Chart/&gt;. Each &lt;Chart/&gt can one or two continuous axes for the x-axes and for the y-axes. When a &lt;Chart/&gt has multiple x-axes or y-axes then you must assign series to the axes in one of the `Plot` components. Any series that are not explicitly assigned an axis will be assigned to the default x-axis or y-axis. The default x-axis is the bottom axis in the &lt;Chart/&gt, and the default y-axis is the left-hand side axis in the &lt;Chart/&gt.

When creating a &lt;ContinuousAxis/&gt;, you must specify its location using the `AxisLocation` enum defined in the [axes.ts](./src/app/charts/axes.ts) file. Each axis must have a unique axis ID. By default a &lt;ContinuousAxis/&gt; will have a linear scale (d3.scaleLinear). The `scale` property can by used to set the scale to a `log` (d3.scaleLog) or `power` (d3.scalePow) scale or any other continuous numeric scale available in `d3`. The `domain` property defines the initial min and max values for the axis, and when data streams into the plot, that defines the time-window displayed for the axis (unless changed by a zoom event).

#### [&#10514;](#content) <span id="continuous-axes-usage-base">&lt;ContinuousAxis/&gt; base properties</span>

The base properties defining the axis.

> **axisId (string)**<br>
> The unique ID of the axis. The axis can then be referred to by this ID. For example, when assigning axes to series, the assignment is made by associating the axis ID to the series name.

> **location ([AxisLocation](./src/app/charts/axes.ts))**<br>
> The location of the axis. As defined by the `AxisLocation` in the the [axes.ts](./src/app/charts/axes.ts) file, x-axes can be placed on the `bottom` or the `top`, and y-axes can be placed on the `left` or the `right`. 

> **scale (ScaleContinuousNumeric<number, number>)**<br>
> The optional scale (factory) of the continuous axis. The scale of the axis is like the axis ruler and determines how the points are placed on the screen. For example, a linear scale is like an evenly spaced ruler, and the mapping between screen location and data value are linear. As another example, the log scale has a logarithmic mapping between the screen location and the data. The scale can be a linear scale (default scale, d3.scaleLinear), a logarithmic scale (d3.scaleLog), a power scale (d3.scalePower), or any other d3 continouos numeric scale that works. Not that if a chart, for example, has two x-axes, that the x-axes are **not** required to have the same scale.

> **domain ([min: number, max: number])**<br>
> The domain of the axis (in d3 terminology) is effectively the minimum value of the axis and the maximum value of the axis when the initial data is displayed. The domain defines the time-window of the displayed data. For example, if the `domain` for an x-axis is specified as `[1000, 6000]`, then the axis starts at `1000` and ends at `6000`, and the time-window is `5000`. Once data starts to stream past the axis end, the plot starts to scroll, maintaining the calculated time-window (in out example, 5000). Of course, a zooming event will change the domain, and also the time-window.

> **label (string)**<br>
> The axis label.

#### [&#10514;](#content) <span id="continuous-axes-usage-styling">&lt;ContinuousAxis/&gt; styling</span>

A set of properties to update the style of the axes.

> **font (Partial<[AxesLabelFont](./src/app/charts/axes.ts)>)**<br>
> An optional CSS properties specifying the font for the axis and tick labels.


### [&#10514;](#content) <span id="category-axes-usage">&lt;CategoryAxis/&gt;</span>

The &lt;CategoryAxis/&gt; must be a child of the &lt;Chart/&gt;. Each &lt;Chart/&gt can one or two category axes for the y-axes. Unlike the [&lt;ContinousAxis/&gt;](#continuous-axes-usage), the &lt;CategoryAxis/&gt; can only be used as a y-axis because for stream charts (at this point) the x-axes represent time. In the same way as with the [&lt;ContinousAxis/&gt;](#continuous-axes-usage), when using multiple multiple y-axes you must assign the series to the axes in one of the `Plot` components. Any series that are not explicitly assigned an axis will be assigned to the default y-axis, which is the left-hand side axis in the &lt;Chart/&gt.

When creating a &lt;CategoryAxis/&gt;, you must specify its location using the `AxisLocation` enum defined in the [axes.ts](./src/app/charts/axes.ts) file. Each axis must have a unique axis ID. The &lt;CategoryAxis/&gt; uses a band scale (d3.scaleLinear).

#### [&#10514;](#content) <span id="category-axes-usage-base">&lt;CategoryAxis/&gt; base properties</span>

The base properties defining the axis.

> **axisId (string)**<br>
> The unique ID of the axis. The axis can then be referred to by this ID. For example, when assigning axes to series, the assignment is made by associating the axis ID to the series name.

> **location ([AxisLocation](./src/app/charts/axes.ts))**<br>
> The location of the axis. As defined by the `AxisLocation` in the the [axes.ts](./src/app/charts/axes.ts) file, x-axes can be placed on the `bottom` or the `top`, and y-axes can be placed on the `left` or the `right`.

> **categories (Array<string>)**<br>
> The required `categories` property holds the names of the categories, in the order that they will be displayed on the axis. The first element in the array will be on shown at the top of the axis. The second element will be on lower, and the last element will be at the bottom of the axis.

> **domain ([min: number, max: number])**<br>
> The domain of the axis (in d3 terminology) is effectively the minimum value of the displayed axis and the maximum value of the displayed axis when the initial data is displayed. The domain defines the time-window of the displayed data. For example, if the `domain` for an x-axis is specified as `[1000, 6000]`, then the axis starts at `1000` and ends at `6000`, and the time-window is `5000`. Once data starts to stream past the axis end, the plot starts to scroll, maintaining the calculated time-window (in out example, 5000). Of course, a zooming event will change the domain, and also the time-window.

> **label (string)**<br>
> The axis label.

#### [&#10514;](#content) <span id="category-axes-usage-styling">&lt;CategoryAxis/&gt; styling</span>

A set of properties to update the style of the axes.

> **font (Partial<[AxesLabelFont](./src/app/charts/axes.ts)>)**<br>
> An optional CSS properties specifying the font for the axis and tick labels.




### properties

The [examples](https://github.com/robphilipp/stream-charts-examples) project has example code that was used to generate the charts in the images above. The [StreamingRasterChart](https://github.com/robphilipp/stream-charts-examples/blob/master/src/app/examples/StreamingRasterChart.tsx) provides an example of using the raster chart. The [StreamingScatterChart](https://github.com/robphilipp/stream-charts-examples/blob/master/src/app/examples/StreamingScatterChart.tsx) provides an example of using the scatter chart. Both of these examples provide controls for enabling the filtering, tooltip, tracker, and magnifier enhancements.

Each chart accepts a number of required and optional properties. The properties are divided into

1. style,
2. data,
3. enhancements, and
4. state.

#### styles

Except for the plot height and width, *style* properties are optional. Style properties define how the plot will look. For example, the *margin* property defines the space between the rectangle defined by the *height* and *width* property and the plot area.

All the optional *style* properties have defaults (the defaults look like the example charts above). The defaults can be overridden by specifying the properties you would like to change. For example, if you would like to change only the size of the font used for the axes labels, then you can specify the property as,

```typescript jsx
<ScatterChart
    // .
    // .
    // .
    axisLabelFont={{color: 'blue'}}
    // .
    // .
    // .
/>
```

In this case, the size, family, and weight of the axis labels will remain at their default values, and only the color will change from its default value to the one specified, which in this case is "blue".

The *style* properties common to all plots are listed in the table below.

| Name |  | Type | Description | Example |
| ---- | --- | -------- | ----------- | ------- |
| width | required | number | The width of the chart in pixels | 450 |
| height | required | number | The height of the chart in pixels | 300 |
| margin | optional | [Margin](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/margins.ts) | The plot margin | `{top: 10, left: 10}` |
| axesLabelFont | optional | `{size: number, color: string, family: string, weight: number}` | The font used to display the labels for the axes and ticks | `{size: 14, color: '#fff'}` |
| backgroundColor | optional | string | The background color of the plot. Technically, this property is carried over to the SVG element holding the entire plot | `'#202020'` |
| svgStyle | optional | css object | An object holding the React style CSS properties (i.e. camelCased) for the SVG container holding the chart. This can be used to set properties of the background. | `{width: '100%'}` |

#### data

The *data* properties define the data source, processing, and constraints.

| Name |     | Type | Description | Example |
| ---- | --- | ---- | ----------- | ------- |
| seriesList | required | Array of [Series](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/datumSeries.ts) | A list of the series to plot. | `[seriesFrom('test1')]` |
| seriesObservable | required | [Observable](https://rxjs-dev.firebaseapp.com/api/index/class/Observable) of [ChartData](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/chartData.ts) | An [rxjs](https://rxjs-dev.firebaseapp.com) observable that sources chart data. | see the [randomWeightDataObservable(...)](https://github.com/robphilipp/stream-charts-examples/blob/master/src/app/examples/randomData.ts) function. |
| windowingTime | optional | number (ms) | Controls the update frequency of the chart. Depending on the number of time-series being plotted, this number can be comfortably set at 25 ms. The default value is 100 ms | `100` |
| timeWindow | required | number (ms) | The maximum time between the `minTime` and the `maxTime`. | `2000` |

##### Understanding the time-window

These charts have been developed to be used with high-frequency dynamic data that my run for a considerable amount of time. For example, you may stream in data for a few hundred seconds, and have the plot show the last 10 seconds worth of data. To achieve this you use the `timeWindow` property. Because you want to see the most recent 10 seconds of data, you set the time-window property to 10,000 ms (`timeWindow={10000}`). The charts use the time-window property, and the current simulation time, to show the most recent `timeWindow` milliseconds of data (in our example, the past 10 seconds). This causes the data to "slide" to the left after `timeWindow` has elapsed.

#### enhancements

The tracker, tooltip, magnifier, and filter are enhancements to the plots for exploring the displayed data. Each of these enhancements has a set of properties for determining how they are displayed. The details of the styles are given in sections below. All enhancements are optional, and, inactive by default.

The tracker, tooltip, and magnifier are activated (shown) when the mouse is in the plot area **and** the enhancement's `visible` property is set to true. Generally, only one enhancement is used at one time.

The filter enhancement differs from the others. This isn't a visible component, rather, it controls what data is displayed in the chart. The filter allows the user to specify a regular expression that is used to filter time-series based on their name.

| Name |  | Type | Description | Example |
| ---- | --- | -------- | ----------- | ------- |
| tooltip | optional | [TooltipStyle](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/TooltipStyle.ts) | Styling for the tooltip control when it is active | `{visible: false, fontSize: 12, fontColor: '#d2933f'}`|
| magnifier | optional | [RadialMagnifier](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/ScatterChart.tsx) or [BarMagnifier](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/RasterChart.tsx) | Defines the style of the radial magnifier used for the scatter chart and the bar magnifier used for the raster chart | `{visible: true}` |
| tracker | optional | [TrackerStyle](https://github.com/robphilipp/stream-charts/blob/master/src/app/charts/TrackerStyle.ts) | Style of the tracker line that draws a vertical line at the time represented by the current mouse position and shows that time, when the mouse is in the plot area. | `{visible: false, timeWindow: 50}` |
| filter | optional | [RexExp](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp) | A regular expression used to filter time-series based on their name. Generally, this would be specified by some control in the parent component. See for example [StreamingRasterChart](https://github.com/robphilipp/stream-charts-examples/blob/master/src/app/examples/StreamingRasterChart.tsx). | `^in[0-3]+$` | undefined |

#### state

The *state* properties allow you to provide callbacks when the chart state changes. There are three state changes you can plug into

1. on subscription to the rxjs observable
2. when data changes
3. when the current time changes.

##### shouldSubscribe

> boolean

By default, when the charts mount, they subscribe to the specified observable. This causes the observable to start emitting chart-data. Although the chart controls the subscription to the observable, you can control the timing of that subscription through the `shouldSubscribe` property. Setting the property to `false` for the initial mount tells the chart not to subscribe when it mounts. Then, at some point in time later, when you want the chart to start consuming data, simply set the `shouldSubscribe` property to `true`. Once the chart has subscribed to the observable, changing the value of this property has no effect.

##### onSubscription

> (subscription: Subscription) => void

You hand the `stream-charts` an [Observable](https://rxjs-dev.firebaseapp.com/api/index/class/Observable). This defines how (i.e. the pipeline) the data is generated. Only upon subscription does data flow through this pipeline. The rxjs `Observable.subscribe(...)` function returns a [Subscription](https://rxjs-dev.firebaseapp.com/api/index/class/Subscription) that can be used to stop the data.

An example of an observable can be found in the [randomSpikeDataObservable(...)](./src/app/examples/randomData.ts) function.

One reason to provide an `onSubscription` callback is so that you have a handle on the subscription so that you can stop the data. For example, you may want to provide the user of your application a button to stop the data. Or, you may wish to stop the simulation after a certain period of time.

###### onUpdateData

> (seriesName: string, t: number, y: number) => void

When new data arrives from the observable, the `onUpdateData` callback provides a hook into the data. For example, you may want to stop the data if, for example, the value crosses some threshold.

If you are only interested in the current time, you can use the `onUpdateTime` callback.

##### onUpdateTime

> (time: number) => void

When the time associated with the data in the stream changes, this callback provides a hook into that time. In the [StreamingScatterChart](src/app/examples/StreamingScatterChart.tsx), for example, this callback is used to stop the random data after 1 second (1000 ms) by cancelling the subscription.

```typescript jsx
<ScatterChart
    // .
    // .
    // .
    onSubscribe={subscription => subscriptionRef.current = subscription}
    onUpdateTime={(t: number) => {
        if(t > 1000) subscriptionRef.current!.unsubscribe()
    }}
    // .
    // .
    // .
/>
```

#### axisLabelFont

The axis-label font style is used as a `Partial<{size: number, color: string, family: string, weight: number}>`. This means you only need to specify the values of the style that you wish to change.

| Name | Type | Description | Example | Default Value |
| ---- | ---- | ----------- | ------- | ------- |
| size | number | The font size in pixels | `12` | 12 |
| color | string | The font color expressed as a string | `'rgba(25,25,25,0.3)'` | `'#d2933f'` |
| family | string | The font family | `'sans-serif'` | `'sans-serif'` |
| weight | number | The weight of the font | `350` | `300` |

#### tooltip

The tooltip style is defined in the [TooltipStyle](src/app/charts/TooltipStyle.ts) interface. The `TooltipStyle` is used as a `Partial<TooltipStyle>`. This means that you only need to specify the values of the style that you wish to change.

| Name | Type | Description | Example | Default Value |
| ---- | ---- | ----------- | ------- | ------- |
| visible | boolean | Whether on not the tooltip control is active and will show up on mouse-over. Generally this property will be controlled by the parent component in response to the selection of the control. See, for example, [`StreamingScatterChart`](src/app/examples/StreamingScatterChart.tsx). | `false` | `false` |
| fontSize | number | Size of the font in pixels | `12` | `12` |
| fontColor | string | Color of the font represented as a string | `'blue'` | `'#d2933f'` |
| fontFamily | string | Family of the font | `'"Avenir Next" sans-serif'` | `'sans-serif'` |
| fontWeight | number | Weight of the font represents its "thickness" | `300` | `250` |
| backgroundColor | string | The background color of the tooltip | `'green`' | `'#202020'` |
| backgroundOpacity | number | A number between 0 and 1 defining how opaque the background is. A value of 0 means that the background is completely transparent. A value of 1 means that the background is completely opaque. | `0.5` | `0.8` |
| borderColor | string | Color of the tooltip's border. | `'#f8ebc6'` | `'#d2933f'` |
| borderWidth | number | The width, in pixels, of the tooltip's border. | `3` | `1` |
| borderRadius | number | The radius, in pixels, of the rectangles "corners". A value of 0 is a sharp corner. A value of 5 means that the corner is replaced by a circle of radius 5 px. | `3` | `5` |
| paddingTop | number | The number of pixels between the top of the tooltip and the content. | `8` | `10` |
| paddingRight | number | The number of pixels between the right side of the tooltip and the content. | `8` | `10` |
| paddingLeft | number | The number of pixels between the left side of the tooltip and the content. | `8` | `10` |
| paddingBottom | number | The number of pixels between the bottom of the tooltip and the content. | `8` | `10` |

#### magnifier

Two types of magnifiers are used in `stream-charts`: a radial magnifier and a bar magnifier. The radial magnifier is used in the scatter chart, and the bar magnifier is used in the raster chart.

The radial magnifier style is defined in the [ScatterChart](src/app/charts/ScatterChart.tsx) component and is used as a `Partial<RadialMagnifierStyle>`, which means you only need to specify the values you wish to change.

| Name | Type | Description | Example | Default Value |
| ---- | ---- | ----------- | ------- | ------- |
| visible | boolean | Defines whether the magnifier is visible when the mouse is in the plot area. Generally, this would be managed by a control in the parent component. | `true` | `false` |
| radius | number | Radius, in pixels, of the magnifier lens displayed. | `125` | `100` |
| magnification | number | A value between 1 and 10 that defines the amount of magnification. A value of 1 mean almost no magnification. Generally, this value should be controlled by the parent component. | `4` | `5` |
| color | string | Lens axes and tick color. | `'purple'` | `'#d2933f'` |
| lineWidth | number | Width, in pixels, of the axes and ticks. | `1` | `2` |

The bar magnifier style is defined in the [RasterChart](src/app/charts/RasterChart.tsx) component and is used as a `Partial<LineMagnifierStyle>`, which means you only need to specify the values you wish to change.

| Name | Type | Description | Example | Default Value |
| ---- | ---- | ----------- | ------- | ------- |
| visible | boolean | Defines whether the magnifier is visible when the mouse is in the plot area. Generally, this would be managed by a control in the parent component. | `true` | `false` |
| width | number | Width, in pixels, of the bar-magnifier lens displayed. | `50` | `125` |
| magnification | number | A value between 1 and 10 that defines the amount of magnification. A value of 1 mean almost no magnification. Generally, this value should be controlled by the parent component. | `4` | `5` |
| color | string | Lens axes and tick color. | `'purple'` | `'#d2933f'` |
| lineWidth | number | Width, in pixels, of the axes and ticks. | `1` | `2` |
| axisOpacity | number | A number between 0 and 1 that defines how opaque the magnifier's axes are. A value of 0 means that the axes are completely transparent. A value of 1 means that the axes are completely opaque. | `0.5` | `0.35` |

#### tracker

The tracker displays a vertical line in the chart area at the current mouse position, and show the time represented by that mouse position. The styles for the tracker determine how that line looks.

The tracker styles are defined in the [TrackerStyle](src/app/charts/TrackerStyle.ts) file and is used as a `Partial<TrackerStyle>`, which means that you only need to specify the values you would like to change.

| Name | Type | Description | Example | Default Value |
| ---- | ---- | ----------- | ------- | ------- |
| visible | boolean | Defines whether the tracker is visible when the mouse is in the plot area. Generally, this would be managed by a control in the parent component. | `true` | `false` |
| color | string | Color of the tracker line. | `'rgba(55,66,77,0.88)'` | `'#d2933f'` |
| lineWidth | number | Width, in pixels, of the vertical tracker line. | `2` | `1` |

Please note that the font style of the tracker text is controlled by the axis-label font styles described above.

### time-series

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