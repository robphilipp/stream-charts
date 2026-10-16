import type {CSSProperties, ReactElement} from "react";
import {useEffect, useMemo, useState, useRef} from "react";
import {createPortal} from "react-dom";
import {
    categoryTooltipY,
    defaultTooltipStyle,
    type RasterTooltipMetadata,
    type Sparkline,
    sparklineFor,
    type SpikeStatistics,
    spikeStatistics,
    type TooltipDimensions,
    type TooltipStyle
} from "./tooltipUtils";
import {tooltipAnchorFor, type TooltipAnchor, useTooltipPlacement} from "./useTooltipPlacement"
import {withAlpha} from "../styling/canvasStyle";
import {formatNumber, formatTime, formatValue} from "../utils";
import {useChart} from "../hooks/useChart";
import type {OrdinalStringAxis, SeriesLineStyle} from "../axes/axes";
import {usePlotDimensions} from "../hooks/usePlotDimensions";
import type {Datum} from "../series/timeSeries";
import type {TooltipData} from "../hooks/useTooltip";
import {ContinuousAxisRange} from "../axes/ContinuousAxisRange";
import type {Dimensions, Margin} from "../styling/margins";
import type {Series} from "../plots/plot";

/**
 # Want to write your own tooltip-content component?

 Here's how to write your own tooltip-content component.

 To create your own tooltip content `<MyTooltipContent/>` you must do the following:
 1. Create a react component for your tooltip content (see for example, {@link ScatterPlotTooltipContent}
 as a reference.
 2. Use the {@link useChart} hook to get the {@link registerTooltipContentProvider} registration function.
 3. When your tooltip content component (`<MyTooltipContent/>`) mounts, use the {@link registerTooltipContentProvider}
 function to register your tooltip content provider.
 4. When the chart dimensions, margin, canvas, etc, change, register your tooltip content provider
 again (you can register as many times as you like because it only uses the last content provider
 registered).

 That's it! A bit more details below.

 The {@link registerTooltipContentProvider} function from the {@link useChart} hook allows you to register
 one tooltip content provider. A second call to this function will cause the {@link useChart} hook to drop
 the first one in favor of the second one.

 The {@link registerTooltipContentProvider} function from the {@link useChart} hook accepts a higher-order
 function that allowing a closure on content/chart-specific data. Specifically, you must hand the
 {@link registerTooltipContentProvider} a function of the form:

 `(seriesName: string, time: number, series: TimeSeries, mouseCoords: [x: number, y: number]) => TooltipDimensions`

 Your function to add that actual content will be what this function calls whenever the plot's
 mousemove hit-test finds the mouse hovering over one of the time-series in the chart.

 Tooltip content is rendered as a React portal into `document.body` (see
 {@link RasterPlotTooltipContent} for a full example) rather than appended as SVG/canvas-drawn
 text -- this keeps content fully declarative and lets the browser handle layout, measurement, and
 text wrapping for you.

 */

/**
 * Options for displaying the tooltip content. These options are specific to this
 * particular implementation of a tooltip content. The options effect are applied
 * as shown below.
 * ```
 * series name
 * formatters.x(x), formatters.y(y)
 * ```
 */
// interface TooltipOptions {
//     formatters: {
//         x: (value: number) => string,
//         y: (value: number) => string,
//     }
// }

/**
 * Properties for rendering the tooltip content. The properties are applied as
 * shown below.
 * ```
 * series name
 * xFormatter, yFormatter
 * ```
 */
export interface Props {
    xFormatter?: (value: number) => string
    yFormatter?: (value: number) => string
    style?: Partial<TooltipStyle>
}

/**
 * The data needed to render the tooltip's content, captured at mouse-over time and read back out
 * during render. Replaces the old version's immediate SVG DOM manipulation -- content is now
 * declarative React, driven by this piece of state.
 */
// the size of the tooltip's sparkline (of the spikes' values over the window)
const SPARKLINE_WIDTH = 180
const SPARKLINE_HEIGHT = 36

/**
 * Formats a value, or shows a dash when there isn't one (e.g. the standard deviation of a single
 * spike)
 * @param value The value, if there is one
 * @param formatter Formats the value
 * @return The formatted value, or a dash
 */
function valueOrMissing(value: number | undefined, formatter: (value: number) => string): string {
    return value === undefined ? '–' : formatter(value)
}

interface RasterTooltipContent {
    seriesName: string
    spikeTime: number
    value: number
    // statistics of the series' spikes in the window (the data the chart holds)
    statistics: SpikeStatistics | undefined
    // the spikes' values over the window, when there are enough of them to draw
    sparkline: Sparkline | undefined
    // where the tooltip is anchored (the mouse, and the spike's row)
    anchor: TooltipAnchor
}

/**
 * Adds tooltip content that shows the series name and the (time, value) of the selected point.
 * ```
 * series name
 * time, value
 * ```
 *
 * Registers the tooltip-content provider with the `ChartContext` so that when the plot's
 * mousemove hit-test finds the mouse over a spike, this component's content is shown. On
 * mouse-over, the provider just captures the data needed to render (via `setTooltipContent`) and
 * returns off-screen {@link TooltipDimensions} so the parent {@link Tooltip}'s own background
 * element stays invisible -- this component renders its own, independent portal instead (see
 * {@link OutlierPlotHtmlTooltipContent} for the established pattern this follows).
 * @param props The properties describing the tooltip content
 * @return The tooltip's portal, or `null` when nothing is being hovered
 */
export function RasterPlotTooltipContent(props: Props): ReactElement | null {
    const {
        chartId,
        canvas,
        tooltip,
        mouse,
        axes
    } = useChart<Datum, SeriesLineStyle, Partial<RasterTooltipMetadata>, ContinuousAxisRange, OrdinalStringAxis>()

    const {registerTooltipContentProvider} = tooltip
    const {registerMouseLeaveHandler, unregisterMouseLeaveHandler} = mouse

    const {
        yAxesState,
        axisAssignmentsFor
    } = axes

    const {margin, plotDimensions} = usePlotDimensions()

    const {
        xFormatter = formatTime,
        yFormatter = formatValue,
        style,
    } = props

    const tooltipStyle = useMemo(() => ({...defaultTooltipStyle, ...style}), [style])

    const [tooltipContent, setTooltipContent] = useState<RasterTooltipContent | null>(null)
    // the tooltip (its portal), which is placed next to the mouse once rendered
    const tooltipRef = useRef<HTMLDivElement>(null)

    // register the tooltip content provider, which when called on mouse-over-series events
    // captures the data needed to render the tooltip (this plot holds all the information needed
    // to render it); the actual rendering happens declaratively below, via the portal.
    useEffect(
        () => {
            if (canvas) {
                // assemble the options for adding the tooltip
                // const options: TooltipOptions = {
                //     formatters: {
                //         x: xFormatter,
                //         y: yFormatter,
                //     }
                // }

                registerTooltipContentProvider(
                    /**
                     * @param seriesName The name of the series
                     * @param _time The mouse time (not used
                     * @param tooltipData The tooltip data holding the series and metadata (data about the series)
                     * @param mouseCoords The coordinates of the mouse, in canvas-local coordinates
                     * @return Off-screen dimensions, so the parent <Tooltip>'s own background stays invisible
                     */
                    (seriesName: string, _time: number, tooltipData: TooltipData<Datum, Partial<RasterTooltipMetadata>>, mouseCoords: [x: number, y: number]) => {
                        const yAxisId = axisAssignmentsFor(seriesName).yAxis
                        const assignedAxis = yAxesState
                            .axisFor(yAxisId)
                            .getOrThrow(() => new Error(`No assigned y-axis exists; axis_id: ${yAxisId}`))
                        return captureTooltipContent(
                            seriesName, tooltipData.series[0], tooltipData.metadata.spikes, mouseCoords,
                            canvas, margin, plotDimensions,
                            assignedAxis,// options,
                            setTooltipContent
                        )
                    }
                )
            }
        },
        [
            canvas, margin, plotDimensions, registerTooltipContentProvider,
            xFormatter,
            yFormatter,
            tooltipStyle,
            yAxesState, axisAssignmentsFor
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

    return createPortal(
        <div ref={tooltipRef} style={divStyle}>
            <div style={{fontSize: tooltipStyle.fontSize, fontWeight: tooltipStyle.fontWeight}}>
                {tooltipContent.seriesName}
            </div>
            <div style={{fontSize: tooltipStyle.fontSize + 2, fontWeight: tooltipStyle.fontWeight + 150}}>
                {xFormatter(tooltipContent.spikeTime)}, {yFormatter(tooltipContent.value)}
            </div>
            {/* the series' spikes over the window (the data the chart holds) */}
            {tooltipContent.statistics !== undefined && tooltipContent.statistics.count > 0 &&
                <table style={{fontSize: tooltipStyle.fontSize, borderCollapse: 'collapse', border: 'none', marginTop: 6}}>
                    <tbody>
                    {[
                        ['Spikes', formatNumber(tooltipContent.statistics.count, " ,.0f")],
                        ['Mean value', valueOrMissing(tooltipContent.statistics.meanValue, yFormatter)],
                        ['Std. deviation', valueOrMissing(tooltipContent.statistics.valueStandardDeviation, yFormatter)],
                        ['Mean interval', valueOrMissing(tooltipContent.statistics.meanInterval, xFormatter)],
                    ].map(([label, value]) => (
                        <tr key={label}>
                            <td style={{padding: '1px 12px 1px 0', textAlign: 'left', border: 'none'}}>{label}</td>
                            <td style={{padding: '1px 0', textAlign: 'right', border: 'none'}}>{value}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            }
            {/* the spikes' values over the window, ending in the latest spike (the dot) */}
            {tooltipContent.sparkline !== undefined &&
                <svg
                    width={SPARKLINE_WIDTH}
                    height={SPARKLINE_HEIGHT}
                    style={{display: 'block', marginTop: 8}}
                    aria-hidden="true"
                >
                    <path
                        d={tooltipContent.sparkline.path}
                        fill="none"
                        stroke={tooltipStyle.fontColor}
                        strokeWidth={1.25}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />
                    <circle
                        cx={tooltipContent.sparkline.end[0]}
                        cy={tooltipContent.sparkline.end[1]}
                        r={2.5}
                        fill={tooltipStyle.fontColor}
                    />
                </svg>
            }
        </div>,
        document.body
    )
}

/**
 * Captures the data needed to render the tooltip content, and computes its viewport-fixed
 * position. Replaces the old version, which measured and positioned SVG `<text>` elements
 * directly via `getBBox()`.
 * @param seriesName The name of the series (i.e. the neuron ID)
 * @param selected The selected datum (time, value)
 * @param mouseCoords The coordinates of the mouse when the event was fired, in canvas-local coordinates
 * @param canvas The chart's canvas element
 * @param margin The plot margins
 * @param plotDimensions The dimensions of the plot
 * @param axis The category axis to which the time-series is associated
 * @param setTooltipContent Setter that stashes the captured content for the component to render
 * @return Off-screen {@link TooltipDimensions}, so the parent <Tooltip>'s own background stays invisible
 */
function captureTooltipContent(
    seriesName: string,
    selected: Datum | undefined,
    spikes: Series<Datum> | undefined,
    mouseCoords: [x: number, y: number],
    canvas: HTMLCanvasElement,
    margin: Margin,
    plotDimensions: Dimensions,
    axis: OrdinalStringAxis,
    // options: TooltipOptions,
    setTooltipContent: (content: RasterTooltipContent | null) => void,
): TooltipDimensions {
    // `selected` comes from the caller's `tooltipData.series[0]` -- this component is a public,
    // independently-usable tooltip-content provider, and `TooltipData.series: Series<D>` permits
    // an empty array, so guard here rather than relying on every caller to have already checked
    // (RasterPlot.tsx's own mousemove handler does today, but that shouldn't be the only thing
    // standing between an empty series and a destructuring crash below)
    if (selected === undefined) {
        setTooltipContent(null)
        return {x: -99999, y: -99999, contentWidth: 0, contentHeight: 0}
    }

    const {x: spikeTime, y} = selected

    // the spikes' statistics, and their values over time, over the window (the data the chart holds)
    const spikeValues: Array<{ time: number, value: number }> = []
    if (spikes !== undefined) {
        for (let i = 0; i < spikes.length; i++) spikeValues.push({time: spikes[i].x, value: spikes[i].y})
    }

    setTooltipContent({
        seriesName,
        spikeTime,
        value: y,
        statistics: spikes !== undefined ? spikeStatistics(spikes) : undefined,
        sparkline: sparklineFor(spikeValues, SPARKLINE_WIDTH, SPARKLINE_HEIGHT),
        // (vertically, the tooltip is centered on the spike's row, rather than placed below the mouse)
        anchor: tooltipAnchorFor(
            mouseCoords, canvas,
            height => categoryTooltipY(seriesName, height, axis, margin, axis.scale.bandwidth(), plotDimensions)
        ),
    })

    // return off-screen coordinates so the Tooltip parent's background div is invisible
    return {x: -99999, y: -99999, contentWidth: 0, contentHeight: 0}
}
