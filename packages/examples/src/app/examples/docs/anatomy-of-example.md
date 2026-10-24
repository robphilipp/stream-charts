### anatomy of an example chart

Before we dive into the details of the each example chart, let's take a look at one of the tabs in the example application. In this particular example, we're looking at the "Scatter" chart. And figure 3 breaks down what you see.

<figure>
    <img src="./images/intro-example-parts.png" alt="Anatomy of an example chart: the tabs, the control bar and its expand button, the chart, and its external legend">
    <figcaption>
        <b>Figure 3</b> The anatomy of an example chart. The parts outlined with orange dashes are the example application's, and aren't distributed in the library: the "Tabs" hold this introduction and one example for each chart type, and the "Control bar" holds the example's controls – its "Expand" button opens the panel with the rest of the settings and controls. The parts outlined in solid green are the <a href="https://www.npmjs.com/package/stream-charts">stream-charts</a> library's: the "Chart" (in this case, a scatter chart), and its "External legend", which the library draws into a container that the application provides.
    </figcaption>
</figure>

The "Tabs" are at the top of the page and allow you to navigate to the different chart types available in the library. Enough said.

The next two items, "Control bar" and "Chart" represent the example. The "Chart" is the [stream-charts](https://www.npmjs.com/package/stream-charts) library at work. The "Control bar" is all example application – the library doesn't ship a control bar. It's there so that you can poke at the library's features and see what they do.

The control bar comes in two parts. 

1. The **header** is always visible. It holds the expand button (on the far left), the **Run**/**Pause** and **Reset** buttons, and a row of small status icons that light up when a feature is on – for example, the filter icon lights up when a filter is set, and the tooltip icon when tooltips are enabled. The lag icon turns red when the chart falls behind the data (more on lag on the next page). That way you can tell how the chart is set up without opening anything.
2. The **panel** holds the rest of the controls. Click the expand button to open it, and click it again (or just move the mouse off the control bar) to tuck it away.

Some of the controls in the panel are common to all (well, most) examples, such as the "regex filter", the tooltip and tracker checkboxes, the buffering settings, and the "lag" display. The remaining controls are specific to each chart. For example, for the scatter chart, we can interpolate the lines between the points in different ways, and so there is a drop-down that allows you to select the interpolation. Similarly, markers make sense for a scatter chart, but less so for a bar chart. 

We'll talk in more detail about the common controls on the next page. And we'll discuss the controls specific to each chart type in the pages after that.

#### zooming and panning

One more thing before we move on: every chart can be zoomed and panned, and it works the same way in all of them.

- **zoom** – hold down `shift` (or `ctrl`) and scroll the mouse wheel (or use two fingers on a track pad) over the chart. Requiring the modifier key is an option the examples turn on (`zoomKeyModifiersRequired`), so that scrolling the page doesn't accidentally zoom the chart.
- **pan** – click and drag the chart.

You can zoom and pan while the data is streaming, and the chart keeps your zoom when you switch tabs and come back. The **Reset** button sets the zoom back to where it started.
