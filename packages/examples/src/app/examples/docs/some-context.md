### some context

The application uses a few libraries that you don't need to use. But you may need to provide similar functionality for
some of them. The following sections describe the libraries, their use, and whether you need to provide similar
functionality for them if you choose not to use them.

The "demo" column says whether this example application uses the library, and the "library" column says whether the
[stream-charts](https://www.npmjs.com/package/stream-charts) library itself uses it. When a library is only used by the
app, it's your call – use it, use something else, or roll your own.

| library                                                                                  | demo | library | what for                                                     |
|------------------------------------------------------------------------------------------|-----|---------|--------------------------------------------------------------|
| [react](https://www.npmjs.com/package/react)                                             | ✓   | ✓       | well, everything                                             |
| [rxjs](https://www.npmjs.com/package/rxjs)                                               | ✓   | ✓       | the streams of data that feed the charts                     |
| [d3](https://www.npmjs.com/package/d3)                                                   | ✓   | ✓       | scales, axes, and curve interpolations                       |
| [result-fn](https://www.npmjs.com/package/result-fn)                                     | ✓   | ✓       | `Result` and `Optional` types for error handling             |
| [react-resizable-grid-layout](https://www.npmjs.com/package/react-resizable-grid-layout) | ✓   | ✗       | laying out the page, and telling the charts their size       |
| [zustand](https://www.npmjs.com/package/zustand)                                         | ✓   | ✗       | holding each example's state (and its data) across tabs      |
| [@tanstack/react-router](https://www.npmjs.com/package/@tanstack/react-router)           | ✓   | ✗       | the tabs, and the page you're on in these intro pages        |
| [react-markdown](https://www.npmjs.com/package/react-markdown)                           | ✓   | ✗       | rendering these intro pages (they're markdown files)         |

Of the app-only libraries, the one you'll most likely need a replacement for is the
[react-resizable-grid-layout](https://www.npmjs.com/package/react-resizable-grid-layout) library. Here's why.

#### charts need to know their size

A chart draws onto a canvas, and a canvas needs to know exactly how many pixels wide and tall it is. So the
`<Chart>` component requires a `width` and a `height` (in pixels) – it won't figure them out for itself.

The application's entry point is the `src/main.tsx` file. It wraps the whole application in a
[WindowDimensionsProvider](https://github.com/robphilipp/react-grid-layout/blob/main/src/WindowDimensionsProvider.tsx) from
the [react-resizable-grid-layout](https://www.npmjs.com/package/react-resizable-grid-layout) library, which keeps track
of the window's size. The page is then laid out as nested `<Grid>`s, and each `<GridItem>` knows its own size. An
example chart simply asks the grid cell it sits in how big it is, and hands that to the chart.

```tsx
<GridItem gridAreaName="chart">
    <Chart
        width={useGridCellWidth()}
        height={useGridCellHeight()}
        ...
    >
        ...
    </Chart>
</GridItem>
```

When you resize the window, the grid cells resize, and so do the charts. If you don't use the grid layout, you'll need
something else that tells your chart its size – for example, a `ResizeObserver` on the chart's container.

#### state that outlives the tab

Each example keeps its state – the settings in the control bar, the zoom, and, importantly, the data itself – in a
[zustand](https://www.npmjs.com/package/zustand) store. The stores live in `src/app/examples/appstate`. Because the
stores live outside the React components, you can start a chart, switch to another tab, and come back to find that
the chart kept streaming while you were away.

You don't need zustand to get that behavior. What you do need is to keep the chart's data source (more on that in the
"under the hood" pages at the end) somewhere that outlives the chart component. A store is a convenient place, but a
React context, or even a module-level variable, would do.
