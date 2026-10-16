import type {CSSProperties, ReactElement} from "react";
import {useEffect, useMemo, useState, useRef} from "react";
import {createPortal} from "react-dom";
import * as d3 from "d3";
import {type Series} from "../plots/plot";
import {
    autocorrelation,
    boundingPoints,
    defaultTooltipStyle,
    type Sparkline,
    sparklineFor,
    type SeriesStatistics,
    seriesStatistics,
    valueOrMissing,
    type ScatterTooltipMetadata,
    type ScatterTooltipPoints,
    type TooltipDimensions,
    type TooltipStyle
} from "./tooltipUtils";
import {tooltipAnchorFor, type TooltipAnchor, useTooltipPlacement} from "./useTooltipPlacement"
import {withAlpha} from "../styling/canvasStyle";
import {formatNumber, formatTime, formatTimeChange, formatValue, formatValueChange} from "../utils";
import {useChart} from "../hooks/useChart";
import {usePlotDimensions} from "../hooks/usePlotDimensions";
import type {ContinuousNumericAxis, SeriesLineStyle} from "../axes/axes";
import {type Datum, emptyDatum} from "../series/timeSeries";
import type {TooltipData} from "../hooks/useTooltip";
import {ContinuousAxisRange} from "../axes/ContinuousAxisRange";

/**
# Want to write your own tooltip-content component?

Here's how to write your own tooltip-content component.

To create your own tooltip content `<MyTooltipContent/>` you must do the following:
1. Create a React component for your tooltip content (see, for example, {@link ScatterPlotTooltipContent}
   as a reference.
2. Use the {@link useChart} hook to get the {@link registerTooltipContentProvider} registration function
   (it's `useChart().tooltip.registerTooltipContentProvider`).
3. When your tooltip content component (`<MyTooltipContent/>`) mounts, use the {@link registerTooltipContentProvider}
   function to register your tooltip content provider.
4. When the chart dimensions, margin, canvas, etc, change, register your tooltip content provider
   again (you can register as many times as you like because it only uses the last content provider
   registered).

That's it! A few more details are below.

The {@link registerTooltipContentProvider} function from the {@link useChart} hook allows you to register
one tooltip content provider. A second call to this function will cause the {@link useChart} hook to drop
the first one in favor of the second one.

The {@link registerTooltipContentProvider} function from the {@link useChart} hook accepts a function
that can close over content/chart-specific data. Specifically, you must hand the
{@link registerTooltipContentProvider} a function of the form:

`(seriesName: string, time: number, tooltipData: TooltipData<D, TM>, mouseCoords: [x: number, y: number], providerId?: string) => TooltipDimensions`

where the tooltip data holds the series (or the part of it the plot passes along) and the plot's
metadata, and the provider ID says which kind of element is hovered (for plots, like the bar plot,
that have several).

Your function to capture the actual content will be what this function calls whenever the plot's
mousemove hit-test finds the mouse hovering over one of the time-series in the chart. Tooltip
content itself is rendered declaratively as a React portal (see {@link ScatterPlotTooltipContent}
below for a full example) rather than drawn/appended directly -- the content-provider's job is
just to capture the data needed to render, via a bit of React state.

 */

/**
 * Options for displaying the tooltip content. These options are specific to this
 * particular implementation of a tooltip content. The options effect are applied
 * as shown below (over a segment; and over a point).
 * ```
 * series name
 *            headers.before       headers.after         headers.delta
 * labels.x   formatters.x.value   formatters.x.value    formatters.x.change
 * labels.y   formatters.y.value   formatters.y.value    formatters.y.change
 *
 * series name
 *            headers.before       headers.point         headers.after
 * labels.x   formatters.x.value   formatters.x.value    formatters.x.value
 * labels.y   formatters.y.value   formatters.y.value    formatters.y.value
 * ```
 */
interface TooltipOptions {
    labels: { x: string, y: string }
    headers: {before: string, point: string, after: string, delta: string}
    formatters: {
        x: { value: (value: number) => string, change: (value1: number, value2: number) => string },
        y: { value: (value: number) => string, change: (value1: number, value2: number) => string },
    }
}

/**
 * Properties for rendering the tooltip content. The properties are applied as
 * shown below (over a segment; and over a point).
 * ```
 * series name
 *          beforeHeader      afterHeader        deltaHeader
 * xLabel   xValueFormatter   xValueFormatter    xChangeFormatter
 * yLabel   yValueFormatter   yValueFormatter    yChangeFormatter
 *
 * series name
 *          beforeHeader      pointHeader        afterHeader
 * xLabel   xValueFormatter   xValueFormatter    xValueFormatter
 * yLabel   yValueFormatter   yValueFormatter    yValueFormatter
 * ```
 */
export interface Props {
    // label for the x-values (x-value row header)
    xLabel: string
    // label for the y-values (y-value row header)
    yLabel: string
    // header of the column for the point before the mouse (or before the point under the mouse)
    beforeHeader?: string
    // header of the column for the point under the mouse (when the mouse is directly over a point)
    pointHeader?: string
    // header of the column for the point after the mouse (or after the point under the mouse)
    afterHeader?: string
    // header of the column for the change from the point before the mouse to the point after it
    deltaHeader?: string
    // formats the x-values
    xValueFormatter?: (value: number) => string
    // formats the y-values
    yValueFormatter?: (value: number) => string
    // formats the change in the x-values (from the first value to the second)
    xChangeFormatter?: (value1: number, value2: number) => string,
    // formats the change in the y-values (from the first value to the second)
    yChangeFormatter?: (value1: number, value2: number) => string,
    // the style of the tooltip
    style?: Partial<TooltipStyle>
}

/**
 * The data needed to render the tooltip's table content, captured at mouse-over time and read
 * back out during render. Replaces the old version's immediate SVG DOM manipulation (which
 * hand-positioned each table cell's SVG `<text>` element using a `spacesWidthFor` pixel-width
 * hack) -- an actual HTML `<table>` handles column alignment natively, so no equivalent hack is
 * needed here.
 */
// the size of the autocorrelation's sparkline (its plot area, without the axes' labels)
const SPARKLINE_WIDTH = 180
const SPARKLINE_HEIGHT = 48
// the space around the sparkline's line, within its plot area
const SPARKLINE_PADDING = 2
// the space around the sparkline's plot area for the axes: their ticks and labels (the y-axis'
// on the left, the x-axis' below)
const AXES_MARGIN = {left: 24, right: 6, top: 4, bottom: 14}
// the length of the axes' ticks
const TICK_LENGTH = 3
// the (most) ticks on the x-axis (the lags)
const LAG_TICK_COUNT = 5

interface ScatterTooltipContent {
    seriesName: string
    // the column headers (e.g. before, after, and the change between them)
    headers: Array<string>
    xLabel: string
    xValues: Array<string>
    yLabel: string
    yValues: Array<string>
    // the column to emphasize (the point under the mouse), if any
    emphasizedColumn?: number
    // statistics of the series' points in the window (the data the chart holds)
    statistics: SeriesStatistics
    // the autocorrelation of the series' values over the window (by lag, in points), when there
    // are enough points to calculate it
    autocorrelation: AutocorrelationSparkline | undefined
    // where the tooltip is anchored (the mouse)
    anchor: TooltipAnchor
}

/**
 * Adds tooltip content as a table, whose rows are the x-values and the y-values, and whose
 * columns depend on where the mouse is over the series (as the plot reports it, see
 * `ScatterTooltipMetadata` -- the plot also highlights the same points):
 *
 * When the mouse is over a line segment, the points before and after the mouse, and the
 * difference between them:
 * ```
 * series name
 *            before     after         ∆
 * x-label     x_tb      x_ta       x_ta - x_tb
 * y-label     y_tb      y_ta       y_ta - y_tb
 * ```
 *
 * When the mouse is directly over a data point, that point (in bold), and the points before and
 * after it:
 * ```
 * series name
 *            before     point     after
 * x-label     x_b        x_p       x_a
 * y-label     y_b        y_p       y_a
 * ```
 * A point that doesn't exist (e.g. before the series' first point) shows a dash.
 *
 * Below the table, the statistics of the series' points in the window of data the chart holds:
 * their count, the mean and (sample) standard deviation of their values, and the mean time
 * between consecutive points. And below that, a sparkline of the autocorrelation of their values,
 * by lag (in points, from 0 on the left), drawn from -1 (bottom) to 1 (top): with a y-axis (ticks
 * at -1, 0, and 1), and an x-axis along the (dashed) zero line, with ticks at round lags.
 *
 * Registers the tooltip-content provider with the `ChartContext` so that when the plot's
 * mousemove hit-test finds the mouse over a series, this component's content is shown. On
 * mouse-over, the provider just captures the data needed to render (via `setTooltipContent`) and
 * returns off-screen {@link TooltipDimensions} so the parent {@link Tooltip}'s own background
 * element stays invisible -- this component renders its own, independent portal instead (see
 * {@link OutlierPlotHtmlTooltipContent} for the established pattern this follows).
 * @param props The properties describing the tooltip content
 * @return The tooltip's portal, or `null` when nothing is being hovered
 */
export function ScatterPlotTooltipContent(props: Props): ReactElement | null {
    const {
        chartId,
        canvas,
        tooltip,
        mouse
    } = useChart<Datum, SeriesLineStyle, ScatterTooltipMetadata, ContinuousAxisRange, ContinuousNumericAxis>()

    const {registerTooltipContentProvider} = tooltip
    const {registerMouseLeaveHandler, unregisterMouseLeaveHandler} = mouse

    const {margin, plotDimensions} = usePlotDimensions()

    const {
        xLabel,
        yLabel,
        beforeHeader = 'before',
        pointHeader = 'point',
        afterHeader = 'after',
        deltaHeader = '∆',
        xValueFormatter = formatTime,
        yValueFormatter = formatValue,
        xChangeFormatter = formatTimeChange,
        yChangeFormatter = formatValueChange,
        style,
    } = props

    const tooltipStyle = useMemo(() => ({...defaultTooltipStyle, ...style}), [style])

    const [tooltipContent, setTooltipContent] = useState<ScatterTooltipContent | null>(null)
    // the tooltip (its portal), which is placed next to the mouse once rendered
    const tooltipRef = useRef<HTMLDivElement>(null)

    // register the tooltip content provider, which when called on mouse-over-series events
    // captures the data needed to render the tooltip (this plot holds all the information needed
    // to render it); the actual rendering happens declaratively below, via the portal.
    useEffect(
        () => {
            if (canvas) {
                const options: TooltipOptions = {
                    labels: {x: xLabel, y: yLabel},
                    headers: {before: beforeHeader, point: pointHeader, after: afterHeader, delta: deltaHeader},
                    formatters: {
                        x: {value: xValueFormatter, change: xChangeFormatter},
                        y: {value: yValueFormatter, change: yChangeFormatter},
                    }
                }

                registerTooltipContentProvider(
                    (seriesName: string, time: number, tooltipData: TooltipData<Datum, Partial<ScatterTooltipMetadata>>, mouseCoords: [x: number, y: number]) =>
                        captureTooltipContent(
                            seriesName, time, tooltipData.series, tooltipData.metadata.points, mouseCoords,
                            canvas,
                            options,
                            setTooltipContent
                        )
                )
            }
        },
        [
            canvas, margin, plotDimensions, registerTooltipContentProvider,
            xLabel, xChangeFormatter, xValueFormatter,
            yLabel, yChangeFormatter, yValueFormatter,
            beforeHeader, pointHeader, afterHeader, deltaHeader,
            tooltipStyle
        ]
    )

    // clears the captured content (and so unmounts the portal) when the mouse leaves the series
    useEffect(
        () => {
            const handlerId = `html-tooltip-leave-${chartId}`
            registerMouseLeaveHandler(handlerId, () => setTooltipContent(null))
            return () => unregisterMouseLeaveHandler(handlerId)
        },
        [chartId, registerMouseLeaveHandler, unregisterMouseLeaveHandler]
    )

    // positions the tooltip next to the mouse, based on its rendered size
    useTooltipPlacement(tooltipRef, tooltipContent?.anchor ?? null, plotDimensions, margin, tooltipStyle)

    if (tooltipContent === null) return null

    const divStyle: CSSProperties = {
        position: 'fixed',
        // (placed next to the mouse, based on its rendered size, by `useTooltipPlacement`, before
        // it's painted)
        left: 0,
        top: 0,
        backgroundColor: withAlpha(tooltipStyle.backgroundColor, tooltipStyle.backgroundOpacity),
        border: `${tooltipStyle.borderWidth}px solid ${withAlpha(tooltipStyle.borderColor, tooltipStyle.borderOpacity)}`,
        borderRadius: tooltipStyle.borderRadius,
        padding: `${tooltipStyle.paddingTop}px ${tooltipStyle.paddingRight}px ${tooltipStyle.paddingBottom}px ${tooltipStyle.paddingLeft}px`,
        fontFamily: tooltipStyle.fontFamily,
        color: tooltipStyle.fontColor,
        pointerEvents: 'none',
        zIndex: 9999,
    }

    const cellStyle: CSSProperties = {padding: '1px 8px', textAlign: 'right', border: 'none'}
    const rowLabelStyle: CSSProperties = {...cellStyle, textAlign: 'left', paddingLeft: 0}
    // the point under the mouse stands out (as it does on the plot)
    const cellStyleFor = (column: number): CSSProperties => column === tooltipContent.emphasizedColumn ?
        {...cellStyle, fontWeight: tooltipStyle.fontWeight + 650} :
        cellStyle

    return createPortal(
        <div ref={tooltipRef} style={divStyle}>
            <div style={{fontSize: tooltipStyle.fontSize, fontWeight: tooltipStyle.fontWeight, marginBottom: 4}}>
                {tooltipContent.seriesName}
            </div>
            <table style={{fontSize: tooltipStyle.fontSize + 2, fontWeight: tooltipStyle.fontWeight + 150, borderCollapse: 'collapse', border: 'none'}}>
                <thead>
                <tr style={{fontWeight: tooltipStyle.fontWeight + 550}}>
                    <td style={rowLabelStyle}/>
                    {tooltipContent.headers.map((header, column) => (
                        <td key={column} style={cellStyleFor(column)}>{header}</td>
                    ))}
                </tr>
                </thead>
                <tbody>
                <tr>
                    <td style={rowLabelStyle}>{tooltipContent.xLabel}</td>
                    {tooltipContent.xValues.map((value, column) => (
                        <td key={column} style={cellStyleFor(column)}>{value}</td>
                    ))}
                </tr>
                <tr>
                    <td style={rowLabelStyle}>{tooltipContent.yLabel}</td>
                    {tooltipContent.yValues.map((value, column) => (
                        <td key={column} style={cellStyleFor(column)}>{value}</td>
                    ))}
                </tr>
                </tbody>
            </table>
            {/* the series' points over the window (the data the chart holds) */}
            {tooltipContent.statistics.count > 0 &&
                <table style={{fontSize: tooltipStyle.fontSize, borderCollapse: 'collapse', border: 'none', marginTop: 6}}>
                    <tbody>
                    {[
                        ['Points', formatNumber(tooltipContent.statistics.count, " ,.0f")],
                        ['Mean value', valueOrMissing(tooltipContent.statistics.meanValue, yValueFormatter)],
                        ['Std. deviation', valueOrMissing(tooltipContent.statistics.valueStandardDeviation, yValueFormatter)],
                        ['Mean interval', valueOrMissing(tooltipContent.statistics.meanInterval, xValueFormatter)],
                    ].map(([label, value]) => (
                        <tr key={label}>
                            <td style={{padding: '1px 12px 1px 0', textAlign: 'left', border: 'none'}}>{label}</td>
                            <td style={{padding: '1px 0', textAlign: 'right', border: 'none'}}>{value}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            }
            {/* the autocorrelation of the series' values, by lag */}
            {tooltipContent.autocorrelation !== undefined && <>
                <div style={{fontSize: tooltipStyle.fontSize, marginTop: 8}}>
                    Autocorrelation
                </div>
                <AutocorrelationChart
                    autocorrelation={tooltipContent.autocorrelation}
                    color={tooltipStyle.fontColor}
                    fontSize={tooltipStyle.fontSize - 3}
                />
            </>}
        </div>,
        document.body
    )
}

/**
 * Captures the data needed to render the tooltip's table content, and where it's anchored (the
 * mouse -- the tooltip is placed next to it once it's rendered, see {@link useTooltipPlacement}).
 * Replaces the old version, which measured and hand-positioned each SVG `<text>` cell
 * via `getBBox()` and a `spacesWidthFor` pixel-width heuristic -- an HTML `<table>` (see the
 * component above) handles all of that alignment natively.
 * @param seriesName The name of the series (i.e. the neuron ID)
 * @param time The time (x-coordinate value) corresponding to the mouse location
 * @param series The series' data (the window of data the chart holds -- for the statistics too)
 * @param points The points to show, as the plot determined them (see {@link scatterTooltipPoints});
 * when `undefined`, the points on either side of the mouse's time are shown
 * @param mouseCoords The coordinates of the mouse when the event was fired, in canvas-local coordinates
 * @param canvas The chart's canvas element
 * @param options The options passed through the function that adds the tooltip content
 * @param setTooltipContent Setter that stashes the captured content for the component to render
 * @return Off-screen {@link TooltipDimensions}, so the parent <Tooltip>'s own background stays invisible
 */
function captureTooltipContent(
    seriesName: string,
    time: number,
    series: Series<Datum>,
    points: ScatterTooltipPoints | undefined,
    mouseCoords: [x: number, y: number],
    canvas: HTMLCanvasElement,
    options: TooltipOptions,
    setTooltipContent: (content: ScatterTooltipContent) => void,
): TooltipDimensions {
    const {labels, headers, formatters} = options
    // the points to show, as determined by the plot -- or, when the plot doesn't say, the points on
    // either side of the mouse's time
    const shown = points ?? segmentAround(series, time)

    // a value, or a dash for a point that doesn't exist (e.g. before the series' first point)
    const valueOf = (datum: Datum | undefined, formatter: (value: number) => string, value: (datum: Datum) => number): string =>
        datum === undefined ? MISSING_VALUE : formatter(value(datum))
    const changeOf = (formatter: (value1: number, value2: number) => string, value: (datum: Datum) => number): string =>
        shown.before === undefined || shown.after === undefined ?
            MISSING_VALUE :
            formatter(value(shown.before), value(shown.after))

    const xOf = (datum: Datum) => datum.x
    const yOf = (datum: Datum) => datum.y
    setTooltipContent({
        seriesName,
        xLabel: labels.x,
        yLabel: labels.y,
        statistics: seriesStatistics(series),
        autocorrelation: autocorrelationSparkline(series),
        anchor: tooltipAnchorFor(mouseCoords, canvas),
        ...(shown.kind === 'point' ?
            // directly over a point: the point before it, the point, and the point after it
            {
                headers: [headers.before, headers.point, headers.after],
                xValues: [shown.before, shown.point, shown.after].map(datum => valueOf(datum, formatters.x.value, xOf)),
                yValues: [shown.before, shown.point, shown.after].map(datum => valueOf(datum, formatters.y.value, yOf)),
                emphasizedColumn: 1,
            } :
            // over a segment: the points on either side of the mouse, and the change between them
            {
                headers: [headers.before, headers.after, headers.delta],
                xValues: [
                    valueOf(shown.before, formatters.x.value, xOf),
                    valueOf(shown.after, formatters.x.value, xOf),
                    changeOf(formatters.x.change, xOf)
                ],
                yValues: [
                    valueOf(shown.before, formatters.y.value, yOf),
                    valueOf(shown.after, formatters.y.value, yOf),
                    changeOf(formatters.y.change, yOf)
                ],
            })
    })

    // return off-screen coordinates so the Tooltip parent's background div is invisible
    return {x: -99999, y: -99999, contentWidth: 0, contentHeight: 0}
}

// shown in place of the values of a point that doesn't exist (e.g. before the series' first point)
const MISSING_VALUE = '–'

/**
 * The points on either side of the specified time (the segment it's on)
 * @param series The series' data
 * @param time The time
 * @return The points before and after the time (undefined where there's none)
 */
function segmentAround(series: Series<Datum>, time: number): ScatterTooltipPoints {
    const [before, after] = boundingPoints(series, time, value => value.x, () => emptyDatum())
    const orUndefined = (datum: Datum) => isNaN(datum.x) ? undefined : datum
    return {kind: 'segment', before: orUndefined(before), after: orUndefined(after)}
}

/**
 * The sparkline of the autocorrelation of a series' values (see {@link autocorrelation}): the lags
 * run left to right across the width, and the correlations from -1 (at the bottom) to 1 (at the
 * top), so that the zero line is at the middle
 * @param series The series' data
 * @return The sparkline, or `undefined` when there are too few points (or
 * the values don't vary)
 */
function autocorrelationSparkline(series: Series<Datum>): AutocorrelationSparkline | undefined {
    const correlations = autocorrelation(series)
    if (correlations === undefined) return undefined
    const sparkline = sparklineFor(
        correlations.map((value, lag) => ({time: lag, value})),
        SPARKLINE_WIDTH, SPARKLINE_HEIGHT, SPARKLINE_PADDING, [-1, 1]
    )
    return sparkline === undefined ? undefined : {sparkline, maxLag: correlations.length - 1}
}

/**
 * The autocorrelation's sparkline, and its largest lag (for the x-axis' ticks)
 */
type AutocorrelationSparkline = {sparkline: Sparkline, maxLag: number}

/**
 * The autocorrelation's sparkline, with its axes: a y-axis on the left, with ticks (and labels) at
 * -1, 0, and 1; and an x-axis along the dashed zero line, with ticks at round lags (labelled below
 * the plot, out of the line's way)
 * @param props The autocorrelation's sparkline (and largest lag), the color of the line and the
 * axes, and the font size of the axes' labels
 * @return The sparkline, with its axes
 */
function AutocorrelationChart(props: {
    autocorrelation: AutocorrelationSparkline,
    color: string,
    fontSize: number
}): ReactElement {
    const {autocorrelation: {sparkline, maxLag}, color, fontSize} = props
    // where a lag, and a correlation, are within the plot area (as `sparklineFor` places them)
    const innerWidth = SPARKLINE_WIDTH - 2 * SPARKLINE_PADDING
    const innerHeight = SPARKLINE_HEIGHT - 2 * SPARKLINE_PADDING
    const xOf = (lag: number) => SPARKLINE_PADDING + lag / maxLag * innerWidth
    const yOf = (correlation: number) => SPARKLINE_PADDING + (1 - correlation) / 2 * innerHeight
    // (the y-axis sits just left of lag 0, so it doesn't cover the line's start)
    const yAxisX = SPARKLINE_PADDING - TICK_LENGTH
    const lagTicks = d3.ticks(0, maxLag, Math.min(LAG_TICK_COUNT, maxLag)).filter(Number.isInteger)
    const axisStyle = {stroke: color, strokeOpacity: 0.6, strokeWidth: 1}
    const labelStyle = {fill: color, fillOpacity: 0.8, fontSize}

    return (
        <svg
            width={AXES_MARGIN.left + SPARKLINE_WIDTH + AXES_MARGIN.right}
            height={AXES_MARGIN.top + SPARKLINE_HEIGHT + AXES_MARGIN.bottom}
            style={{display: 'block', marginTop: 2}}
            aria-hidden="true"
        >
            <g transform={`translate(${AXES_MARGIN.left}, ${AXES_MARGIN.top})`}>
                {/* the y-axis: -1 (bottom) to 1 (top) */}
                <line x1={yAxisX} y1={yOf(1)} x2={yAxisX} y2={yOf(-1)} {...axisStyle}/>
                {[-1, 0, 1].map(correlation => (
                    <g key={correlation}>
                        <line
                            x1={yAxisX - TICK_LENGTH} y1={yOf(correlation)}
                            x2={yAxisX} y2={yOf(correlation)}
                            {...axisStyle}
                        />
                        <text
                            x={yAxisX - TICK_LENGTH - 2} y={yOf(correlation)}
                            textAnchor="end" dominantBaseline="middle"
                            {...labelStyle}
                        >
                            {correlation}
                        </text>
                    </g>
                ))}
                {/* the x-axis: the (dashed) zero line, with ticks at round lags */}
                <line
                    x1={yAxisX} y1={yOf(0)} x2={xOf(maxLag)} y2={yOf(0)}
                    {...axisStyle} strokeOpacity={0.35} strokeDasharray="2 2"
                />
                {lagTicks.map(lag => (
                    <g key={lag}>
                        <line
                            x1={xOf(lag)} y1={yOf(0) - TICK_LENGTH / 2}
                            x2={xOf(lag)} y2={yOf(0) + TICK_LENGTH / 2}
                            {...axisStyle}
                        />
                        <text
                            x={xOf(lag)} y={SPARKLINE_HEIGHT + AXES_MARGIN.bottom - 3}
                            textAnchor="middle"
                            {...labelStyle}
                        >
                            {lag}
                        </text>
                    </g>
                ))}
                <path
                    d={sparkline.path}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.25}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />
            </g>
        </svg>
    )
}
