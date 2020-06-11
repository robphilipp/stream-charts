# stream-charts

`stream-charts` are [react](https://reactjs.org)-based time-series charts for viewing high frequency data, streamed in real-time using [rxjs](https://rxjs-dev.firebaseapp.com). Generally, update periods of 25 ms aren't a problem for about a hundred or so time-series. To achieve this type of performance, the charts are implemented in [d3](https://d3js.org) and wrapped in react functional components using hooks.

Although still under development, there are two charts available:
1. A neuron raster chart, and a
2. scatter chart.

Over time, I will add additional chart types. In the meantime, I welcome any contributions to create new chart types (bar, gauges, etc).

Both charts provide
1. a tracker that shows the current time of the mouse position
2. a tooltip that gives information about the current datum
3. a magnifier that zooms in on the data giving a more detailed look.
4. a filter that shows only the time-series whose names match the filter (examples use a regex filter)
5. themeable properties to change the look of the plots.


Please see [change history](changes.md) for a history of changes.

These charts are currently still under development.

## quick start
```shell script
$ npm install stream-charts
```

For the neuron raster chart (see [example](src/app/examples/StreamingRasterChart.tsx))

```typescript jsx
import RasterChart from "../charts/RasterChart";
.
.
.
<RasterChart
    width={plotWidth}
    height={seriesHeight}
    seriesList={seriesList}
    seriesObservable={observableRef.current}
    onSubscribe={subscription => subscriptionRef.current = subscription}
    onUpdateTime={(t: number) => {
        if(t > 1000) subscriptionRef.current!.unsubscribe()
    }}
    minTime={Math.max(0, currentTimeRef.current - timeWindow)}
    maxTime={Math.max(currentTimeRef.current, timeWindow)}
    timeWindow={timeWindow}
    margin={{top: 30, right: 20, bottom: 30, left: 75}}
    tooltip={{visible: visibility.tooltip}}
    magnifier={{visible: visibility.magnifier, magnification: 5}}
    tracker={{visible: visibility.tracker}}
    filter={filter}
/>

```
and for the scatter chart  (see [example](src/app/examples/StreamingScatterChart.tsx))
```typescript jsx
import ScatterChart from "../charts/ScatterChart";
.
.
.
<ScatterChart
    width={plotWidth}
    height={plotHeight}
    seriesList={seriesList}
    seriesObservable={observableRef.current}
    onSubscribe={subscription => subscriptionRef.current = subscription}
    onUpdateTime={(t: number) => {
        if(t > 1000) subscriptionRef.current!.unsubscribe()
    }}
    minTime={Math.max(0, currentTimeRef.current - timeWindow)}
    maxTime={Math.max(currentTimeRef.current, timeWindow)}
    timeWindow={timeWindow}
    margin={{top: 30, right: 20, bottom: 30, left: 75}}
    tooltip={{visible: visibility.tooltip}}
    tooltipValueLabel='weight'
    magnifier={{visible: visibility.magnifier, magnification: magnification, radius: 150}}
    tracker={{visible: visibility.tracker}}
    filter={filter}
/>
```

## intro
`stream-charts` are high-performance charts for displaying large amounts of data in real-time. The charts are wrapped in [react](https://reactjs.org) and fed data using [rxjs](https://rxjs-dev.firebaseapp.com) `Observable`s. The goal `stream-charts` is to display large amounts of time-series data at high frequencies while providing tools to understand the time-series.

There are currently two chart types available: a raster chart for display neuron spikes as a function of time, and a scatter chart. The chart below shows the raster chart with the bar magnifier enabled. The controls at the top of the chart are part of the example. These controls allow filtering time-series by their assigned names in real-time, displaying a tooltip when the mouse pointer is on top of a datum, displaying a tracker that show a vertical line and the current time of the mouse, and a bar magnifier, as shown in the image.

![raster-chart](docs/images/raster-magnifier.png)

A scatter plot is shown below. In this plot, the neurons' weights are plotted as a function of time. In this plot, the magnifier is enabled, and magnifies the data near the mouse pointer.

![scatter-chart](docs/images/scatter.png)  

Another example of a scatter plot is shown below. In this plot, a tooltip shows the weight updates that came just before the mouse cursor and just after, as well as the time and weight changes.

![scatter-chart-tooltip](docs/images/scatter-tooltip.png)

In both cases the plots were updated in real-time with an average update time interval of 25 ms. 

## usage

The [examples](src/app/examples) directory has example code that was used to generate the charts in the images above. The [`StreamingRasterChart`](src/app/examples/StreamingRasterChart.tsx) provides an example of using the raster chart. The [`StreamingScatterChart`](src/app/examples/StreamingScatterChart.tsx) provides an example of using the scatter chart. Both of these examples provide controls for enabling the filtering, tooltip, tracker, and magnifier enhancements.

Each chart accepts a number of required and optional properties. The properties are divided into 
1. style, 
2. data, 
3. enhancement visibility, and
4. state. 

#### styles
Except for the plot height and width, *style* properties are optional. Style properties define how the plot will look. For example, the *margin* property defines the space between the rectangle defined by the *height* and *width* property and the plot area. 

All the optional *style* properties have defaults (the defaults look like the example charts above). The defaults can be overridden by specifying the properties you would like to change. For example, if you would like to change only the size of the font used for the axes labels, then you can specify the property as,
```typescript jsx
<ScatterChart
    .
    .
    .
    axisLabelFont={{color: 'blue'}}
    .
    .
    .
/>
``` 
In this case, the size, family, and weight of the axis labels will remain at their default values, and only the color will change from its default value to the one specified, which in this case is "blue".

The *style* properties common to all plots are listed in the table below.

| Name |  | Type | Description | Example |
| ---- | --- | -------- | ----------- | ------- |
| width | required | number | The width of the chart in pixels | 450 |
| height | required | number | The height of the chart in pixels | 300 |
| margin | optional | [Margin](src/app/charts/margins.ts) | The plot margin | `{top: 10, left: 10}` |
| axesLabelFont | optional | `{size: number, color: string, family: string, weight: number}` | The font used to display the labels for the axes and ticks | `{size: 14, color: '#fff'}` |
| backgroundColor | optional | string | The background color of the plot. Technically, this property is carried over to the SVG element holding the entire plot | `'#202020'` |
| tooltip | optional | [TooltipStyle](src/app/charts/TooltipStyle.ts) | Styling for the tooltip control when it is active | `{visible: false, fontSize: 12, fontColor: '#d2933f'}`|
| magnifier | optional | [RadialMagnifier](src/app/charts/ScatterChart.tsx) or [BarMagnifier](src/app/charts/RasterChart.tsx) | Defines the style of the radial magnifier used for the scatter chart and the bar magnifier used for the raster chart | `{visible: true}` |
| tracker | optional | [TrackerStyle](src/app/charts/TrackerStyle.ts) | Style of the tracker line that draws a vertical line at the time represented by the current mouse position and shows that time, when the mouse is in the plot area. | `{visible: false, timeWindow: 50}` |



```typescript
interface Props {
    width: number;
    height: number;
    margin?: Partial<Margin>;
    axisLabelFont?: Partial<{ size: number, color: string, family: string, weight: number }>;
    axisStyle?: Partial<{ color: string }>;
    backgroundColor?: string;
    plotGridLines?: Partial<{ visible: boolean, color: string }>;
    tooltip?: Partial<TooltipStyle>;
    magnifier?: Partial<RadialMagnifierStyle>;
    tracker?: Partial<TrackerStyle>;

    minWeight?: number;
    maxWeight?: number;

    // data to plot: min-time is the earliest time for which to plot the data; max-time is the latest
    // and series list is a list of time-series to plot
    minTime: number;
    maxTime: number;
    timeWindow: number;
    seriesList: Array<Series>;

    // data stream
    seriesObservable: Observable<ChartData>;
    windowingTime?: number;
    onSubscribe?: (subscription: Subscription) => void;
    onUpdateData?: (seriesName: string, t: number, y: number) => void;
    onUpdateTime?: (time: number) => void;

    // regex filter used to select which series are displayed
    filter?: RegExp;

    // a map that holds the series name and it's associated cooler
    seriesColors?: Map<string, string>;
}
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

    visible: false,
    timeWindow: 50,
    magnification: 1,
    color: '#d2933f',
    lineWidth: 2,


### raster chart
The raster chart component has the following properties.

| Name |  | Type | Description | Example |
| ---- | --- | -------- | ----------- | ------- |
| width | Required | number | The width of the chart in pixels | 450 |
| height | Required | number | The height of the chart in pixels | 300 |
| margin | Optional | [Margin](src/app/charts/margins.ts) | The plot margin | `{top: 10, right: 10, left: 10}` |

```typescript
interface Props {
    width: number;
    height: number;
    margin?: Partial<Margin>;
    spikesStyle?: Partial<{ margin: number, color: string, lineWidth: number, highlightColor: string, highlightWidth: number }>;
    axisLabelFont?: Partial<{ size: number, color: string, family: string, weight: number }>;
    axisStyle?: Partial<{ color: string }>;
    backgroundColor?: string;
    plotGridLines?: Partial<{ visible: boolean, color: string }>;
    tooltip?: Partial<TooltipStyle>;
    magnifier?: Partial<LineMagnifierStyle>;
    tracker?: Partial<TrackerStyle>;

    // data to plot: min-time is the earliest time for which to plot the data; max-time is the latest
    // and series list is a list of time-series to plot
    minTime: number;
    maxTime: number;
    timeWindow: number;
    seriesList: Array<Series>;

    // regex filter used to select which series are displayed
    filter?: RegExp;

    seriesObservable: Observable<ChartData>;
    windowingTime?: number;
    onSubscribe?: (subscription: Subscription) => void;
    onUpdateData?: (seriesName: string, t: number, y: number) => void;
    onUpdateTime?: (time: number) => void;
}
```
```typescript
interface Margin {
    top: number;
    right: number;
    bottom: number;
    left: number;
}
```

```typescript
interface Series {
    readonly name: string;
    data: Datum[];
    readonly last: () => Option<Datum>;
    readonly length: () => number;
    readonly isEmpty: () => boolean;
}
```

## running examples

Install the dependencies.

```shell script
$ npm install
```

Run the development server, which should fire up a browser and load the example app.
```shell script
$ npm start
```

##

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).