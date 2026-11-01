### what is stream-charts?

[stream-charts](https://www.npmjs.com/package/stream-charts) is a react-based library for building real-time time-series charts for viewing high-frequency data. The [stream-charts](https://www.npmjs.com/package/stream-charts) library is designed to ingest data from an [RxJs](https://rxjs.dev) [Observable](https://rxjs.dev/api/index/class/Observable) and plot the data as it arrives. Buffering is recommended and available. [stream-charts](https://www.npmjs.com/package/stream-charts) can generally handle plotting new data for about 100 time-series with data arriving every few milliseconds using a 25 ms buffer.

For managing a chart's memory usage, the data have a configurable time-to-live, after which the data is dropped. And because the ingestion is from an [RxJs](https://rxjs.dev) stream, if you are so inclined, you can build the ingestion stream to offload data to a desired location. 

[stream-charts](https://www.npmjs.com/package/stream-charts) support standard charting capabilities such as themes, zoom, pan, legends, scrolling time-axes, tooltips, and trackers. Themes can be customized. Tooltips can be customized or replaced wholesale with custom implementations. Legends can be configured to reside inside the chart, or externally as a React portal.

#### what sets stream-charts apart

Plenty of charting libraries handle static data beautifully. Some charting libraries also have support for real-time data. What [stream-charts](https://www.npmjs.com/package/stream-charts) adds is everything to handle large amounts of high-frequency data that never stop arriving:

- **Data that keeps streaming, even when the chart isn't on screen.** A chart's data lives in a *data source* that your application owns, rather than in the chart itself. So the data keeps coming in while the chart is hidden (say, on another tab), and the chart picks up right where it left off when it comes back.
- **Buffering that keeps up.** Incoming data is batched before each redraw, and you choose the batch size. And an optional *cadence* keeps the time axis scrolling smoothly between batches.
- **Time axes that move on their own.** As new data arrives past the end of the time window, the window *scrolls* along with it – or, for the scatter and outlier charts, if you'd rather, *squeezes* to fit it all in.
- **Zoom and pan while the data streams.** While a chart with a time axis runs, zooming keeps "now" fixed on screen, so the newest data never runs off the edge while you look at the past.
- **Up to four axes per chart.** Each series is assigned its own x- and y-axis (top or bottom, left or right), and each axis can be linear, logarithmic, or one of [d3](https://d3js.org)'s other continuous scales.
- **Auto-scaling y-axes.** A y-axis can grow to fit the data as it arrives, with limits on how far it may grow, and a little headroom so the data doesn't run up against the edge.
- **Charts for data with a story to tell.** Besides scatter charts, there are raster charts (for events, like neurons firing), Poincare charts (for spotting structure in a series), bar charts with both lifetime and recent-window statistics, and outlier charts that shade a model's bounds and flag the points outside them.
- **A filter that works mid-stream.** A regular expression picks which series to show, and you can change it while the data streams in. The legend follows along.
- **Legends and tooltips you can make your own.** Hovering over a legend entry highlights its series in the chart, and vice versa. Tooltips come in SVG or HTML flavors, take formatters for their values, and can be replaced with your own content altogether.
- **Fast drawing.** Each chart draws onto a single canvas, rather than juggling thousands of SVG elements, which is a big part of how it keeps up with high-frequency data.

#### the common features

And then there are the everyday features you'd expect from a charting library – all of which work while the data is streaming in:

- **Themeable.** The chart's colors and background, each series' color and line width (and its highlighted color and width), the axes' fonts, and the looks of the tooltips, legends, and trackers can all be set. Switch the theme while a chart is running, and it follows along.
- **Resizable.** A chart is as big as you tell it to be, and when you change its size, it redraws at the new size without missing a beat. It's crisp on high-resolution screens, too.
- **Friendly to scrolling.** Zooming can be set to need a modifier key (`shift` or `ctrl`), so the mouse wheel still scrolls the page when it happens to be over a chart.
- **Pause and resume.** Stop the data source, and start it again later. When it restarts, it hands your data generator the data it already has, so the stream can carry on from where it left off, rather than starting over (as all the examples' streams do).
- **Highlighting.** Hovering over a series highlights it, and, if you like, the axes it's plotted against.
- **Markers and lines.** Data points can have markers (which can be hidden while the data streams, to keep things calm), and the lines between them can use any of [d3](https://d3js.org)'s curves – or no line at all.
- **Trackers.** A tracker follows the mouse, vertically or horizontally, with a label showing where it is on the axis – formatted however you like. It can report the mouse's position to your code, too.
- **Axes that say what they mean.** Each axis gets a label and a font, and category axes can rotate their tick labels to fit them in.
- **Keeping your place.** The charts report their axes' ranges as they scroll and zoom, and accept them back – so your application can keep a chart's view (and its zoom) when the chart comes and goes. And a reset puts the zoom back where it started.

See the [stream-charts](https://www.npmjs.com/package/stream-charts) documentation for more information.

### what is this application?

This application is a demo of the [stream-charts](https://www.npmjs.com/package/stream-charts) library. It attempts to provide real-world usage of the chart library rather than just a few simple examples. The source code for these examples is intended to serve as a reference for how to use the library and its available options. This application allows you to explore [stream-charts'](https://www.npmjs.com/package/stream-charts) many features and get a sense of its performance and limitations so that you can use the [stream-charts](https://www.npmjs.com/package/stream-charts) library effectively.

This application is not a complete implementation of all the ways to create stream-charts. Rather, it provides an example implementation for each of the available chart types. Each implementation is merely an example, intended to show off all the features of the chart type so that you can select the features you like and have a reference implementation for them.

### how to use the intro

To state the obvious, you're in the **Intro** tab, which provides a series of pages describing the examples presented in this application. 

You use the navigation bar to navigate between these pages. You can see the navigation bar up there **&#x2191;**, and it is shown in figure 1. 

<figure>
    <img src="./images/navigation-bar.png" alt="Navigation Bar, with its drag handle and table-of-contents button highlighted" width="400px">
    <figcaption>
        <b>Figure 1</b> The navigation bar. Its table-of-contents button takes you straight to any page. And if the bar gets in the way, drag it by its handle to move it.
    </figcaption>
</figure>

If the navigation bar gets in the way, you can move it by dragging it. The buttons on the navigation bar allow you to navigate to any page, the next page, previous page, and to the first and last pages – should be pretty obvious &#x1F60A;. 

When the `First` or `Previous` buttons are disabled, that means you're on the first page. And similarly, when the `Next` and `Last` buttons are disabled, that means you're on the last page.

And if you know where you're headed, the button on the left of the navigation bar (the one that looks like a little list) opens the table of contents, right there in the navigation bar. It marks the page you're on, and clicking a page takes you straight there – no need to click `Next` a dozen times. Click the button again (or just move the mouse away) to put the table of contents away.

Try navigating to the next page by clicking the `Next` button (but not the one in the figure).


[//]: # (Each tab in this application contains an example chart for one of the available stream-charts plot types. Each of these)

[//]: # (example charts implements the full feature-set of the stream-charts library.)

[//]: # ()
[//]: # (The stream-charts library is designed to display real-time time-series data. Each chart has an [RxJS]&#40;https://rxjs.dev/&#41; Observer that receives data from an [RxJS]&#40;https://rxjs.dev/&#41; Observable. The data is displayed in real time as it streams into the chart. )

[//]: # ()
[//]: # (<figure>)

[//]: # (    <img src="./public/images/control-bar.png" alt="Example Controls">)

[//]: # (    <figcaption>)

[//]: # (        <b>Figure 1</b> Controls are part of the example application rather than part of the stream-charts library. The controls)

[//]: # (        shown here are part of the streaming scatter chart example.)

[//]: # (    </figcaption>)

[//]: # (</figure>)

[//]: # ()
[//]: # (<figure>)

[//]: # (    <video controls>)

[//]: # (        <source src="./public/images/poincare-video-orig.mov" type="video/mp4"/>)

[//]: # (        Your browser does not support the video tag.)

[//]: # (    </video>)

[//]: # (    <figcaption>)

[//]: # (        <b>Figure 2</b> )

[//]: # (    </figcaption>)

[//]: # (</figure>)

[//]: # ()
[//]: # (The example charts in this application provide a set of controls that can be used to adjust the chart's behavior. These controls are placed above the chart. For example, in the scatter chart example there is a checkbox that enables the tooltip when the user mouses over a series. There is also a marker checkbox that displays markers for each data point. A dropdown enables the user to select the interpolation method used to draw the lines between data points. And a legend checkbox enables you to toggle the visibility of the legend. When the legend is visible, you're presented with a legend dropdown that allows you to select the placement of the legend.)

[//]: # ()
[//]: # (These controls are part of this *example application* and are **not** part of the <em>stream-charts</em> library. )

[//]: # ()
[//]: # (When you use the stream-charts library, you can create interactive and customizable charts for your data visualization needs.)

[//]: # ()
[//]: # (The charts in the following tab are example usages of the [stream-charts]&#40;https://www.npmjs.com/package/stream-charts&#41; library.)
