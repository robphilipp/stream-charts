### what is stream-charts?

[stream-charts](https://www.npmjs.com/package/stream-charts) is a react-based library for building real-time time-series charts for viewing high-frequency data. The [stream-charts](https://www.npmjs.com/package/stream-charts) library is designed to ingest data from an [RxJs](https://rxjs.dev) [Observable](https://rxjs.dev/api/index/class/Observable) and plot the data as it arrives. Buffering is recommended and available. [stream-charts](https://www.npmjs.com/package/stream-charts) can generally handle plotting new data for about 100 time-series with data arriving every few milliseconds using a 25 ms buffer.

For managing a chart's memory usage, the data have a configurable time-to-live, after which the data is dropped. And because the ingestion is from an [RxJs](https://rxjs.dev) stream, if you are so inclined, you can build the ingestion stream to offload data to a desired location. 

[stream-charts](https://www.npmjs.com/package/stream-charts) support standard charting capabilities such as themes, zoom, pan, legends, scrolling time-axes, tooltips, and trackers. Themes can be customized. Tooltips can be customized or replaced wholesale with custom implementations. Legends can be configured to reside inside the chart as SVG components, or externally as a React portal.

See the [stream-charts](https://www.npmjs.com/package/stream-charts) documentation for more information.

### what is this application?

This application contains example uses of the [stream-charts](https://www.npmjs.com/package/stream-charts) library. In particular, the source code for these examples is intended to serve as a reference for how to use the library and its available options. This application allows you to explore [stream-charts'](https://www.npmjs.com/package/stream-charts) many features and get a sense of its performance and limitations so that you can use the [stream-charts](https://www.npmjs.com/package/stream-charts) library effectively.

This application is not a complete implementation of all the ways to create stream-charts. Rather, it provides an example implementation for each of the available chart types. Each implementation is merely an example, intended to show off all the features of the chart type so that you can select the features you like and have a reference implementation for them.

### how to use the intro

For reference, you're in the **Intro** tab, which provides a series of pages describing the examples presented in this application. 

You use the navigation bar to navigate between these pages. Yeah, the navigation looks like this, and you can see it up there **&#x2197;**.

<figure>
    <img src="./images/navigation-bar.png" alt="Navigation Bar" width="350px">
    <figcaption>
        <b>Figure 1</b> The navigation bar. If it gets in the way, you can move it.
    </figcaption>
</figure>

If the navigation bar gets in the way, you can move it by dragging it. The buttons on the navigation bar allow you to navigate to the next page, previous page, and to the first and last pages – should be pretty obvious &#x1F60A;. 

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
