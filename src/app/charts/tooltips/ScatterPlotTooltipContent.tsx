import type {CSSProperties, ReactElement} from "react";
import {useEffect, useMemo, useState, useRef} from "react";
import {createPortal} from "react-dom";
import {type Series} from "../plots/plot";
import {boundingPoints, defaultTooltipStyle, type TooltipDimensions, type TooltipStyle} from "./tooltipUtils";
import {tooltipAnchorFor, type TooltipAnchor, useTooltipPlacement} from "./useTooltipPlacement"
import {withAlpha} from "../styling/canvasStyle";
import {formatTime, formatTimeChange, formatValue, formatValueChange} from "../utils";
import {type NoTooltipMetadata, useChart} from "../hooks/useChart";
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
2. Use the {@link useChart} hook to get the {@link registerTooltipContentProvider} registration function.
3. When your tooltip content component (`<MyTooltipContent/>`) mounts, use the {@link registerTooltipContentProvider}
   function to register your tooltip content provider.
4. When the chart dimensions, margin, canvas, etc, change, register your tooltip content provider
   again (you can register as many times as you like because it only uses the last content provider
   registered).

That's it! A few more details are below.

The {@link registerTooltipContentProvider} function from the {@link useChart} hook allows you to register
one tooltip content provider. A second call to this function will cause the {@link useChart} hook to drop
the first one in favor of the second one.

The {@link registerTooltipContentProvider} function from the {@link useChart} hook accepts a higher-order
function that allowing a closure on content/chart-specific data. Specifically, you must hand the
{@link registerTooltipContentProvider} a function of the form:

`(seriesName: string, time: number, series: TimeSeries, mouseCoords: [x: number, y: number]) => TooltipDimensions`

Your function to capture the actual content will be what this function calls whenever the plot's
mousemove hit-test finds the mouse hovering over one of the time-series in the chart. Tooltip
content itself is rendered declaratively as a React portal (see {@link ScatterPlotTooltipContent}
below for a full example) rather than drawn/appended directly -- the content-provider's job is
just to capture the data needed to render, via a bit of React state.

 */

/**
 * Options for displaying the tooltip content. These options are specific to this
 * particular implementation of a tooltip content. The options effect are applied
 * as shown below.
 * ```
 * series name
 *            headers.before       headers.after         headers.delta
 * labels.x   formatters.x.value   formatters.x.value    formatters.x.change
 * labels.y   formatters.y.value   formatters.y.value    formatters.y.change
 * ```
 */
interface TooltipOptions {
    labels: { x: string, y: string }
    headers: {before: string, after: string, delta: string}
    formatters: {
        x: { value: (value: number) => string, change: (value1: number, value2: number) => string },
        y: { value: (value: number) => string, change: (value1: number, value2: number) => string },
    }
}

/**
 * Properties for rendering the tooltip content. The properties are applied as
 * shown below.
 * ```
 * series name
 *          beforeHeader      afterHeader        deltaHeader
 * xLabel   xValueFormatter   xValueFormatter    xChangeFormatter
 * yLabel   yValueFormatter   yValueFormatter    yChangeFormatter
 * ```
 */
export interface Props {
    // label for the x-values (x-value row header)
    xLabel: string
    yLabel: string
    beforeHeader?: string
    afterHeader?: string
    deltaHeader?: string
    xValueFormatter?: (value: number) => string
    yValueFormatter?: (value: number) => string
    xChangeFormatter?: (value1: number, value2: number) => string,
    yChangeFormatter?: (value1: number, value2: number) => string,
    style?: Partial<TooltipStyle>
}

/**
 * The data needed to render the tooltip's table content, captured at mouse-over time and read
 * back out during render. Replaces the old version's immediate SVG DOM manipulation (which
 * hand-positioned each table cell's SVG `<text>` element using a `spacesWidthFor` pixel-width
 * hack) -- an actual HTML `<table>` handles column alignment natively, so no equivalent hack is
 * needed here.
 */
interface ScatterTooltipContent {
    seriesName: string
    beforeHeader: string
    afterHeader: string
    deltaHeader: string
    xLabel: string
    xBefore: string
    xAfter: string
    xDelta: string
    yLabel: string
    yBefore: string
    yAfter: string
    yDelta: string
    // where the tooltip is anchored (the mouse)
    anchor: TooltipAnchor
}

/**
 * Adds tooltip content as a table. The columns of the table are the "label", the value before
 * the mouse cursor, then value after the mouse cursor, and the difference between the two values.
 * The rows of the table are x-values for the first row, and the y-values for the second row.
 * The table has the following form.
 * ```
 * series name
 *            before     after         ∆
 * x-label     x_tb      x_ta       x_ta - x_tb
 * y-label     y_tb      y_ta       y_ta - y_tb
 * ```
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
    } = useChart<Datum, SeriesLineStyle, NoTooltipMetadata, ContinuousAxisRange, ContinuousNumericAxis>()

    const {registerTooltipContentProvider} = tooltip
    const {registerMouseLeaveHandler, unregisterMouseLeaveHandler} = mouse

    const {margin, plotDimensions} = usePlotDimensions()

    const {
        xLabel,
        yLabel,
        beforeHeader = 'before',
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
                    headers: {before: beforeHeader, after: afterHeader, delta: deltaHeader},
                    formatters: {
                        x: {value: xValueFormatter, change: xChangeFormatter},
                        y: {value: yValueFormatter, change: yChangeFormatter},
                    }
                }

                registerTooltipContentProvider(
                    (seriesName: string, time: number, tooltipData: TooltipData<Datum, NoTooltipMetadata>, mouseCoords: [x: number, y: number]) =>
                        captureTooltipContent(
                            seriesName, time, tooltipData.series, mouseCoords,
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
            beforeHeader, afterHeader, deltaHeader,
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

    return createPortal(
        <div ref={tooltipRef} style={divStyle}>
            <div style={{fontSize: tooltipStyle.fontSize, fontWeight: tooltipStyle.fontWeight, marginBottom: 4}}>
                {tooltipContent.seriesName}
            </div>
            <table style={{fontSize: tooltipStyle.fontSize + 2, fontWeight: tooltipStyle.fontWeight + 150, borderCollapse: 'collapse', border: 'none'}}>
                <thead>
                <tr style={{fontWeight: tooltipStyle.fontWeight + 550}}>
                    <td style={rowLabelStyle}/>
                    <td style={cellStyle}>{tooltipContent.beforeHeader}</td>
                    <td style={cellStyle}>{tooltipContent.afterHeader}</td>
                    <td style={cellStyle}>{tooltipContent.deltaHeader}</td>
                </tr>
                </thead>
                <tbody>
                <tr>
                    <td style={rowLabelStyle}>{tooltipContent.xLabel}</td>
                    <td style={cellStyle}>{tooltipContent.xBefore}</td>
                    <td style={cellStyle}>{tooltipContent.xAfter}</td>
                    <td style={cellStyle}>{tooltipContent.xDelta}</td>
                </tr>
                <tr>
                    <td style={rowLabelStyle}>{tooltipContent.yLabel}</td>
                    <td style={cellStyle}>{tooltipContent.yBefore}</td>
                    <td style={cellStyle}>{tooltipContent.yAfter}</td>
                    <td style={cellStyle}>{tooltipContent.yDelta}</td>
                </tr>
                </tbody>
            </table>
        </div>,
        document.body
    )
}

/**
 * Captures the data needed to render the tooltip's table content, and computes its viewport-fixed
 * position. Replaces the old version, which measured and hand-positioned each SVG `<text>` cell
 * via `getBBox()` and a `spacesWidthFor` pixel-width heuristic -- an HTML `<table>` (see the
 * component above) handles all of that alignment natively.
 * @param seriesName The name of the series (i.e. the neuron ID)
 * @param time The time (x-coordinate value) corresponding to the mouse location
 * @param series The datum (t ms, s mV)
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
    mouseCoords: [x: number, y: number],
    canvas: HTMLCanvasElement,
    options: TooltipOptions,
    setTooltipContent: (content: ScatterTooltipContent) => void,
): TooltipDimensions {
    const {labels, headers, formatters} = options
    const [lower, upper] = boundingPoints(series, time, value => value.x, () => emptyDatum())

    setTooltipContent({
        seriesName,
        beforeHeader: headers.before,
        afterHeader: headers.after,
        deltaHeader: headers.delta,
        xLabel: labels.x,
        xBefore: formatters.x.value(lower.x),
        xAfter: formatters.x.value(upper.x),
        xDelta: formatters.x.change(lower.x, upper.x),
        yLabel: labels.y,
        yBefore: formatters.y.value(lower.y),
        yAfter: formatters.y.value(upper.y),
        yDelta: formatters.y.change(lower.y, upper.y),
        anchor: tooltipAnchorFor(mouseCoords, canvas),
    })

    // return off-screen coordinates so the Tooltip parent's background div is invisible
    return {x: -99999, y: -99999, contentWidth: 0, contentHeight: 0}
}
