### tutorial: writing your own tooltips

The tooltips page showed the tooltips that come with the library, and the formatters that tweak them. This tutorial goes further: we'll write tooltips from scratch, one for each of the five chart types. Along the way, you'll see exactly what each plot tells a tooltip about the thing under the mouse – which is most of what you need to know to show whatever you like.

As in the previous tutorial, the code is written as if it lives in `src/app/examples`. Every piece of it was tried out in place of the examples' own tooltips.

#### how a tooltip works

Three parts take part when the mouse moves over a chart:

1. **The plot** hit-tests the mouse against what it drew (a canvas has no per-shape mouse events, so the plot works it out). When the mouse is over something – a line, a spike, a point, a bar, or a band – it tells the `<Tooltip>`.
2. **The `<Tooltip>`** calls the *content provider* – a function that the tooltip's content registered with the chart.
3. **The content** (your component) turns what the provider is handed into something to show, and shows it.

The content provider is handed five things:

| argument      | what it is                                                                                     |
|---------------|------------------------------------------------------------------------------------------------|
| `seriesName`  | the name of the series under the mouse                                                         |
| `time`        | a number that depends on the plot – usually the time under the mouse (more on that below)     |
| `tooltipData` | `{series, metadata}`: the series' data, and extra information that depends on the plot        |
| `mouseCoords` | where the mouse is, relative to the chart's canvas                                             |
| `providerId`  | which *kind* of element is under the mouse, for a plot that has several (the bar plot)         |

When the mouse leaves the element, the chart calls the *mouse-leave handlers* that are registered with it, and the tooltip hides.

#### step 1: a reusable tooltip

All five tooltips need the same plumbing: register a content provider, hide on mouse-leave, and draw a box next to the mouse. So let's write that once. `CustomTooltip` takes a `capture` function, which turns what the plot hands over into your own *content* (any object you like), and a function that renders that content:

```tsx
import {type CSSProperties, type ReactElement, type ReactNode, useEffect, useMemo, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {useChart} from "../charts/hooks/useChart";
import {usePlotDimensions} from "../charts/hooks/usePlotDimensions";
import type {TooltipData} from "../charts/hooks/useTooltip";
import {defaultTooltipStyle, type TooltipStyle} from "../charts/tooltips/tooltipUtils";
import {tooltipAnchorFor, type TooltipAnchor, useTooltipPlacement} from "../charts/tooltips/useTooltipPlacement";
import {withAlpha} from "../charts/styling/canvasStyle";
import type {BaseAxis, SeriesStyle} from "../charts/axes/axes";
import type {BaseAxisRange} from "../charts/axes/BaseAxisRange";

/**
 * Turns what the plot hands the tooltip into the content to show (or `undefined` to show nothing)
 */
export type TooltipCapture<D, M, C> = (
    seriesName: string,
    time: number,
    tooltipData: TooltipData<D, M>,
    providerId?: string
) => C | undefined

type Props<D, M, C> = {
    // turns the hovered element's data into the tooltip's content
    capture: TooltipCapture<D, M, C>
    // the tooltip's style (the <Tooltip> passes its own style along)
    style?: Partial<TooltipStyle>
    // renders the content
    children: (content: C, style: TooltipStyle) => ReactNode
}

// what the provider returns to the <Tooltip>, so that its own box stays hidden (we draw our own)
const OFF_SCREEN = {x: -99999, y: -99999, contentWidth: 0, contentHeight: 0}

export function CustomTooltip<D, M, C>(props: Props<D, M, C>): ReactElement | null {
    const {capture, style, children} = props
    const {chartId, canvas, tooltip, mouse} = useChart<D, SeriesStyle, M, BaseAxisRange, BaseAxis>()
    const {registerTooltipContentProvider} = tooltip
    const {registerMouseLeaveHandler, unregisterMouseLeaveHandler} = mouse
    const {margin, plotDimensions} = usePlotDimensions()
    const tooltipStyle = useMemo(() => ({...defaultTooltipStyle, ...style}), [style])

    // what's shown, and where (null when nothing is hovered)
    const [shown, setShown] = useState<{content: C, anchor: TooltipAnchor} | null>(null)
    const tooltipRef = useRef<HTMLDivElement>(null)

    // the latest capture function, so the registered provider always uses the current one
    const captureRef = useRef(capture)
    useEffect(() => {
        captureRef.current = capture
    })

    // 1. register the content provider: the plot calls it whenever the mouse is over an element
    useEffect(
        () => {
            if (canvas === null) return
            registerTooltipContentProvider((seriesName, time, tooltipData, mouseCoords, providerId) => {
                const content = captureRef.current(seriesName, time, tooltipData, providerId)
                setShown(content === undefined ? null : {content, anchor: tooltipAnchorFor(mouseCoords, canvas)})
                return OFF_SCREEN
            })
        },
        [canvas, registerTooltipContentProvider]
    )

    // 2. hide the tooltip when the mouse leaves the element
    useEffect(
        () => {
            const handlerId = `custom-tooltip-leave-${chartId}`
            registerMouseLeaveHandler(handlerId, () => setShown(null))
            return () => unregisterMouseLeaveHandler(handlerId)
        },
        [chartId, registerMouseLeaveHandler, unregisterMouseLeaveHandler]
    )

    // 3. place the tooltip next to the mouse, once it's rendered (and so its size is known)
    useTooltipPlacement(tooltipRef, shown?.anchor ?? null, plotDimensions, margin, tooltipStyle)

    if (shown === null) return null

    const boxStyle: CSSProperties = {
        position: 'fixed',
        left: 0,
        top: 0,
        backgroundColor: withAlpha(tooltipStyle.backgroundColor, tooltipStyle.backgroundOpacity),
        border: `${tooltipStyle.borderWidth}px solid ${withAlpha(tooltipStyle.borderColor, tooltipStyle.borderOpacity)}`,
        borderRadius: tooltipStyle.borderRadius,
        padding: `${tooltipStyle.paddingTop}px ${tooltipStyle.paddingRight}px ${tooltipStyle.paddingBottom}px ${tooltipStyle.paddingLeft}px`,
        fontFamily: tooltipStyle.fontFamily,
        fontSize: tooltipStyle.fontSize,
        color: tooltipStyle.fontColor,
        pointerEvents: 'none',
        zIndex: 9999,
    }
    return createPortal(
        <div ref={tooltipRef} style={boxStyle}>{children(shown.content, tooltipStyle)}</div>,
        document.body
    )
}
```

Here's what it does:

- **It registers the content provider** (with `useChart().tooltip.registerTooltipContentProvider`). The provider calls your `capture`, and stores the content, along with where the mouse is, in state. There's one content provider per chart, so registering replaces whatever was there before. The provider calls `capture` through a ref, so it always uses the latest one, however often the component re-renders.
- **It returns off-screen dimensions.** The `<Tooltip>` can draw a box of its own, sized by what the provider returns. Returning a box far off the screen keeps it hidden, because we draw our own.
- **It hides on mouse-leave** (with `useChart().mouse.registerMouseLeaveHandler`).
- **It draws the box in a [React portal](https://react.dev/reference/react-dom/createPortal)** on the page's `body`, and `useTooltipPlacement` puts it next to the mouse. The placement happens after the box has rendered, when its size is known, so a tooltip near the right edge flips to the left of the mouse instead of running off the chart.
- **It uses the tooltip's style.** The `<Tooltip>` passes its own properties – including its `style` – on to the component inside it. So a tooltip component that takes a `style` property gets the colors and fonts you gave the `<Tooltip>` (and follows the theme) without any more wiring.

With that in place, each chart's tooltip is a `capture` function and a bit of JSX. To use one, put it inside the `<Tooltip>`, in place of the library's content:

```tsx
<Tooltip visible={visibility.tooltip} style={{fontColor: theme.color, backgroundColor: theme.backgroundColor, borderColor: theme.color}}>
    <MyScatterTooltip/>
</Tooltip>
```

#### the scatter chart

The scatter plot hands the tooltip:

- `series` – all of the series' data (that the chart holds), as `{x, y}` points
- `metadata.points` – the points the tooltip is about. When the mouse is right on a point, that's `{kind: 'point', before, point, after}`. Otherwise, it's on the line between two points, and it's `{kind: 'segment', before, after}`.
- `time` – the time under the mouse

Our scatter tooltip shows the point (or the two points around the mouse), and the range of the series' values:

```tsx
import type {ReactElement} from "react";
import {CustomTooltip} from "./CustomTooltip";
import type {Datum} from "../charts/series/timeSeries";
import type {ScatterTooltipMetadata, ScatterTooltipPoints, TooltipStyle} from "../charts/tooltips/tooltipUtils";

type ScatterContent = {
    seriesName: string
    points: ScatterTooltipPoints
    // the smallest and largest values the series holds
    range: [min: number, max: number]
}

const format = (datum: Datum | undefined) => datum === undefined ? '–' : `${datum.x.toFixed(0)} ms, ${datum.y.toFixed(1)}`

export function MyScatterTooltip(props: {style?: Partial<TooltipStyle>}): ReactElement | null {
    return (
        <CustomTooltip<Datum, ScatterTooltipMetadata, ScatterContent>
            style={props.style}
            capture={(seriesName, _time, {series, metadata}) => {
                let min = Infinity
                let max = -Infinity
                for (let i = 0; i < series.length; i++) {
                    min = Math.min(min, series[i].y)
                    max = Math.max(max, series[i].y)
                }
                return {seriesName, points: metadata.points, range: [min, max]}
            }}
        >
            {({seriesName, points, range}) => (
                <>
                    <div style={{fontWeight: 600}}>{seriesName}</div>
                    {points.kind === 'point' ?
                        <div>point: {format(points.point)}</div> :
                        <div>between {format(points.before)} and {format(points.after)}</div>
                    }
                    <div>range: {range[0].toFixed(1)} to {range[1].toFixed(1)}</div>
                </>
            )}
        </CustomTooltip>
    )
}
```

#### the raster chart

The raster plot hands the tooltip:

- `series` – just one datum: the spike under the mouse (`series[0]`)
- `metadata.spikes` – all of the neuron's spikes (that the chart holds)
- `time` – the time under the mouse

Our raster tooltip shows when the spike happened, and how many spikes the neuron fired in the second before it:

```tsx
import type {ReactElement} from "react";
import {CustomTooltip} from "./CustomTooltip";
import type {Datum} from "../charts/series/timeSeries";
import type {RasterTooltipMetadata, TooltipStyle} from "../charts/tooltips/tooltipUtils";

type RasterContent = {
    neuron: string
    spike: Datum
    // the number of the neuron's spikes in the second before this one
    spikesInLastSecond: number
}

export function MyRasterTooltip(props: {style?: Partial<TooltipStyle>}): ReactElement | null {
    return (
        <CustomTooltip<Datum, RasterTooltipMetadata, RasterContent>
            style={props.style}
            capture={(neuron, _time, {series, metadata}) => {
                const spike = series[0]
                if (spike === undefined) return undefined
                let spikesInLastSecond = 0
                for (let i = 0; i < metadata.spikes.length; i++) {
                    const t = metadata.spikes[i].x
                    if (t < spike.x && t >= spike.x - 1000) spikesInLastSecond++
                }
                return {neuron, spike, spikesInLastSecond}
            }}
        >
            {({neuron, spike, spikesInLastSecond}) => (
                <>
                    <div style={{fontWeight: 600}}>{neuron}</div>
                    <div>fired at {spike.x.toFixed(0)} ms ({spike.y.toFixed(1)} mV)</div>
                    <div>{spikesInLastSecond} spikes in the second before</div>
                </>
            )}
        </CustomTooltip>
    )
}
```

#### the Poincaré chart

The Poincaré plot hands the tooltip:

- `series` – all of the series' iterates, each `{time, iterateN, iterateN_1}` (that is, `x[n]` and `x[n+1]`)
- `time` – the time of the point under the mouse. This is how you find it in the series.
- `metadata` – nothing (an empty object)

Our Poincaré tooltip shows which iterate the point is, its values, and how far it is from the diagonal (where `x[n+1] = x[n]`):

```tsx
import type {ReactElement} from "react";
import {CustomTooltip} from "./CustomTooltip";
import type {IterateDatum} from "../charts/series/iterateSeries";
import type {NoTooltipMetadata} from "../charts/hooks/useChart";
import type {TooltipStyle} from "../charts/tooltips/tooltipUtils";

type PoincareContent = {
    seriesName: string
    n: number
    point: IterateDatum
}

export function MyPoincareTooltip(props: {style?: Partial<TooltipStyle>}): ReactElement | null {
    return (
        <CustomTooltip<IterateDatum, NoTooltipMetadata, PoincareContent>
            style={props.style}
            capture={(seriesName, time, {series}) => {
                // the hovered point is the one at the time the plot handed us
                const n = series.findIndex(point => point.time === time)
                return n < 0 ? undefined : {seriesName, n, point: series[n]}
            }}
        >
            {({seriesName, n, point}) => (
                <>
                    <div style={{fontWeight: 600}}>{seriesName}, iterate {n}</div>
                    <div>x[n] = {point.iterateN.toFixed(4)}</div>
                    <div>x[n+1] = {point.iterateN_1.toFixed(4)}</div>
                    <div>{point.iterateN_1 > point.iterateN ? 'above' : 'below'} the diagonal
                        by {Math.abs(point.iterateN_1 - point.iterateN).toFixed(4)}</div>
                </>
            )}
        </CustomTooltip>
    )
}
```

#### the bar chart

The bar plot is the one with several kinds of elements: the current value's line, the mean's line, the min/max bar, and the windowed versions of the last two. So it's the one that uses `providerId`. Each kind of element has its own ID, in `BAR_CHART_TOOLTIP_PROVIDER_IDS`. The bar plot hands the tooltip:

- `providerId` – the kind of element under the mouse
- `series` – all of the category's data (that the chart holds), as `{time, ordinal, value}`
- `metadata` – the data source's statistics, for every category: `valueStatsForSeries` (over all the data), and `windowedValueStatsForSeries` (over the window). Each has the `min`, `max`, `count`, `sum`, and `mean`.
- `time` – not a time at all, here: it's the *value* under the mouse (the bar chart's value axis)

Our bar tooltip says which element you're over, and shows the current value and the statistics:

```tsx
import type {ReactElement} from "react";
import {CustomTooltip} from "./CustomTooltip";
import type {OrdinalDatum} from "../charts/series/ordinalSeries";
import type {WindowedOrdinalStats} from "../charts/datasources/ordinalDataSource";
import type {OrdinalValueStats} from "../charts/observables/ordinals";
import {BAR_CHART_TOOLTIP_PROVIDER_IDS} from "../charts/plots/constants";
import type {TooltipStyle} from "../charts/tooltips/tooltipUtils";

// what each of the bar's elements is called, by its provider ID
const ELEMENT_NAMES = new Map<string, string>([
    [BAR_CHART_TOOLTIP_PROVIDER_IDS.currentValue, 'current value'],
    [BAR_CHART_TOOLTIP_PROVIDER_IDS.meanValue, 'mean'],
    [BAR_CHART_TOOLTIP_PROVIDER_IDS.minMax, 'min/max'],
    [BAR_CHART_TOOLTIP_PROVIDER_IDS.windowedMeanValue, 'windowed mean'],
    [BAR_CHART_TOOLTIP_PROVIDER_IDS.windowedMinMax, 'windowed min/max'],
])

type BarContent = {
    category: string
    element: string
    current: number | undefined
    all: OrdinalValueStats | undefined
    windowed: OrdinalValueStats | undefined
}

export function MyBarTooltip(props: {style?: Partial<TooltipStyle>}): ReactElement | null {
    return (
        <CustomTooltip<OrdinalDatum, WindowedOrdinalStats, BarContent>
            style={props.style}
            capture={(category, _value, {series, metadata}, providerId) => ({
                category,
                element: ELEMENT_NAMES.get(providerId ?? '') ?? 'bar',
                current: series.length > 0 ? series[series.length - 1].value : undefined,
                all: metadata.valueStatsForSeries.get(category),
                windowed: metadata.windowedValueStatsForSeries.get(category),
            })}
        >
            {({category, element, current, all, windowed}) => (
                <>
                    <div style={{fontWeight: 600}}>{category} – {element}</div>
                    {current !== undefined && <div>now: {current.toFixed(1)}</div>}
                    {all && <div>all: {all.min.value.toFixed(1)} to {all.max.value.toFixed(1)}, mean {all.mean.toFixed(1)}</div>}
                    {windowed && <div>window: {windowed.min.value.toFixed(1)} to {windowed.max.value.toFixed(1)}, mean {windowed.mean.toFixed(1)}</div>}
                </>
            )}
        </CustomTooltip>
    )
}
```

#### the outlier chart

The outlier plot has two things to hover over: the bands, and the outliers (the points outside a band). It hands the tooltip:

- `metadata.datum` – the outlier under the mouse, as `{datum: {x, y}, bounds}`. It's only there for an outlier, not for a band.
- `metadata.upperMeasure` and `metadata.lowerMeasure` – the measures (for example, the probabilities) of the band's outer and inner edges. `upperMeasure` is missing for an outlier beyond the widest band.
- `metadata.bandIndex` and `metadata.pointsInBand` – which band it is (0 is the narrowest), and how many points are in it
- `series` – the series' data
- `time` – for an outlier, its time; for a band, the band's index

Our outlier tooltip tells you which band you're in, and, for an outlier, where it is:

```tsx
import type {ReactElement} from "react";
import {CustomTooltip} from "./CustomTooltip";
import type {OutlierDatum} from "../charts/series/outlierSeries";
import type {OutlierBandTooltipMetadata} from "../charts/plots/OutlierPlot";
import type {TooltipStyle} from "../charts/tooltips/tooltipUtils";

type OutlierContent = {
    seriesName: string
    metadata: OutlierBandTooltipMetadata
}

export function MyOutlierTooltip(props: {style?: Partial<TooltipStyle>}): ReactElement | null {
    return (
        <CustomTooltip<OutlierDatum<readonly number[]>, OutlierBandTooltipMetadata, OutlierContent>
            style={props.style}
            capture={(seriesName, _time, {metadata}) => ({seriesName, metadata})}
        >
            {({seriesName, metadata: {datum, upperMeasure, pointsInBand}}) => (
                <>
                    <div style={{fontWeight: 600}}>{seriesName}</div>
                    {/* (only an outlier's point comes with a datum; a band doesn't) */}
                    {datum !== undefined && <div>outlier at {datum.datum.x.toFixed(0)} ms: {datum.datum.y.toFixed(2)}</div>}
                    <div>{upperMeasure === undefined ? 'outside every band' : `in the ${(upperMeasure * 100).toFixed(1)}% band`}</div>
                    <div>{pointsInBand} points in this band</div>
                </>
            )}
        </CustomTooltip>
    )
}
```

The outlier chart also has a shortcut, which the tooltips page mentioned. `<OutlierPlotHtmlTooltipContent>` does the plumbing for you, and renders whatever you put inside it. Your component gets the content from the `useOutlierTooltip()` hook (see `MyOutlierHtmlTooltipContent` in `src/app/examples`).

#### things to know

- **Most tooltips only show while the chart is paused.** The scatter, raster, Poincaré, and bar plots don't hit-test while their data source is running, so there's nothing for a tooltip to do. (Chasing a moving line with the mouse isn't much fun anyway.) The outlier plot is the exception: its bands can be hovered while it streams, too.
- **The capture function runs on every mouse move.** Keep it quick. The series can hold thousands of points, so a loop over them is fine, but anything slower adds up.
- **Copy what you need out of the series.** The series is the data source's live data, which keeps changing as data arrives (and gets dropped). That's why the tooltips above pull out the values they show, rather than keeping the series around.
- **One tooltip per chart.** A chart has one content provider at a time, so put one tooltip component inside the `<Tooltip>`. When you need different content for different elements, switch on `providerId` (or on the metadata), as the bar and outlier tooltips do.
- **Don't give your tooltip component a `children` property.** The `<Tooltip>` passes its own properties to the component inside it, and that includes `children`.
- **The highlighting is the plot's job.** The hovered line, spike, or point is highlighted by the plot, whatever the tooltip shows.
