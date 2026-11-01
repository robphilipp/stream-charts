### what do these pages cover?

Each of the tabs in the tabs presents an example of a particular chart type.

<figure>
    <img src="./images/tabs.png" alt="The example tabs" width="550px">
    <figcaption>
        <b>Figure 2</b> The "tabs" holding the example charts (and this introduction). The underlined tab is the currently active tab.
    </figcaption>
</figure>

Currently, there are five chart types available, each presented as an example in one of the tabs.

1. **Scatter** – Used for plotting multiple time-series. The data are connected by a line and can have markers.
2. **Raster** – Used for plotting time-events (such as the firing of a neuron).
3. **Poincare** – Used when looking for auto-correlations in a time-series. Accepts a time-series as input and plots `d[i+n]` (y-axis) against `d[i]` (x-axis) where `n` is the lag. Provides the Tent map, Gaussian map, and the Logistic map as examples.
4. **Bar** – Used for plotting multiple time-series as bars that show the current value, min/max, and mean values.
5. **Outlier** – Used for displaying a single time-series that is annotated with model bounds.


The next pages describe:
1. the anatomy of the example charts,
2. common control bar functions,
3. each chart type – what the chart represents, and the control bar functions specific to it (one page per chart type),
4. axes – the kinds of axes, their options, and which plots take which,
5. legends,
6. theming – how the charts change colors, how to add a theme, and what the limits are,
7. tooltips and trackers,
8. what's going on under the hood – which code is the example's and which is the library's, and how the data flows from one to the other, and
9. three tutorials: one that walks you through adding your own data source, from the RxJS observable to the chart, one on writing your own tooltips for each chart type, and one that builds a full-featured scatter chart from (simulated) sensor data.

Click on the `Next` button in the navigation bar to continue. Or, if you're the impatient type, jump ahead using the table of contents (the button on the left of the navigation bar).

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
