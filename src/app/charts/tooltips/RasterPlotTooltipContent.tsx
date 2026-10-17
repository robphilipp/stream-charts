import type {ReactElement} from "react";
import {
    categoryTooltipY,
    type RasterTooltipMetadata,
    type Sparkline,
    sparklineFor,
    type SeriesStatistics,
    seriesStatistics,
    type TooltipStyle,
    valueOrMissing
} from "./tooltipUtils";
import {TooltipContent} from "./TooltipContent";
import {formatNumber, formatTime, formatValue} from "../utils";
import {useChart} from "../hooks/useChart";
import type {OrdinalStringAxis, SeriesLineStyle} from "../axes/axes";
import {usePlotDimensions} from "../hooks/usePlotDimensions";
import type {Datum} from "../series/timeSeries";
import {ContinuousAxisRange} from "../axes/ContinuousAxisRange";
import type {Series} from "../plots/plot";

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
    /** formats the times (the spike's time, and the mean time between spikes) */
    xFormatter?: (value: number) => string
    /** formats the values (the spike's value, and the mean and standard deviation of the values) */
    yFormatter?: (value: number) => string
    /** the style of the tooltip */
    style?: Partial<TooltipStyle>
}

// the size of the tooltip's sparkline (of the spikes' values over the window)
const SPARKLINE_WIDTH = 180
const SPARKLINE_HEIGHT = 36

/**
 * The data needed to render the tooltip's content, captured when the mouse moves over an element
 */
interface RasterTooltipContent {
    seriesName: string
    spikeTime: number
    value: number
    // statistics of the series' spikes in the window (the data the chart holds)
    statistics: SeriesStatistics | undefined
    // the spikes' values over the window, when there are enough of them to draw
    sparkline: Sparkline | undefined
    // the spike's row's axis (the tooltip is centered on the row)
    axis: OrdinalStringAxis
}

/**
 * Adds tooltip content that shows the series name, the (time, value) of the selected spike, the
 * statistics of the series' spikes in the window of data the chart holds (their count, the mean
 * and standard deviation of their values, and the mean time between them), and a sparkline of
 * their values over the window.
 * ```
 * series name
 * time, value
 * statistics
 * sparkline
 * ```
 *
 * Built on {@link TooltipContent}; put it inside a {@link Tooltip}.
 * @param props The properties describing the tooltip content
 * @return The tooltip's portal, or `null` when nothing is being hovered
 */
export function RasterPlotTooltipContent(props: Props): ReactElement | null {
    const {axes} = useChart<Datum, SeriesLineStyle, Partial<RasterTooltipMetadata>, ContinuousAxisRange, OrdinalStringAxis>()
    const {yAxesState, axisAssignmentsFor} = axes
    const {margin, plotDimensions} = usePlotDimensions()

    const {
        xFormatter = formatTime,
        yFormatter = formatValue,
        style,
    } = props

    return (
        <TooltipContent<Datum, Partial<RasterTooltipMetadata>, RasterTooltipContent>
            style={style}
            capture={(seriesName, _time, tooltipData) => {
                const yAxisId = axisAssignmentsFor(seriesName).yAxis
                const axis = yAxesState
                    .axisFor(yAxisId)
                    .getOrThrow(() => new Error(`No assigned y-axis exists; axis_id: ${yAxisId}`))
                return captureTooltipContent(seriesName, tooltipData.series[0], tooltipData.metadata.spikes, axis)
            }}
            // (vertically, the tooltip is centered on the spike's row, rather than placed below the mouse)
            topFor={(content, height) =>
                categoryTooltipY(content.seriesName, height, content.axis, margin, content.axis.scale.bandwidth(), plotDimensions)
            }
        >
            {(tooltipContent, tooltipStyle) => <>
                    <div style={{fontSize: tooltipStyle.fontSize, fontWeight: tooltipStyle.fontWeight}}>
                        {tooltipContent.seriesName}
                    </div>
                    <div style={{fontSize: tooltipStyle.fontSize + 2, fontWeight: tooltipStyle.fontWeight + 150}}>
                        {xFormatter(tooltipContent.spikeTime)}, {yFormatter(tooltipContent.value)}
                    </div>
                    {/* the series' spikes over the window (the data the chart holds) */}
                    {tooltipContent.statistics !== undefined && tooltipContent.statistics.count > 0 &&
                        // (sized to its content, rather than the app's default full-width tables, so that
                        // the values sit next to their labels)
                        <table style={{fontSize: tooltipStyle.fontSize, borderCollapse: 'collapse', border: 'none', marginTop: 6, width: 'auto'}}>
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
            </>}
        </TooltipContent>
    )
}

/**
 * Captures the data needed to render the tooltip content: the selected spike, and the statistics
 * and sparkline of the series' spikes
 * @param seriesName The name of the series (i.e. the neuron ID)
 * @param selected The selected datum (time, value), or `undefined` (in which case there's no tooltip)
 * @param spikes All the series' spikes in the window (for the statistics and the sparkline), when known
 * @param axis The category axis to which the time-series is associated
 * @return The tooltip's content, or `undefined` when there's no selected spike
 */
function captureTooltipContent(
    seriesName: string,
    selected: Datum | undefined,
    spikes: Series<Datum> | undefined,
    axis: OrdinalStringAxis,
): RasterTooltipContent | undefined {
    // `selected` comes from the caller's `tooltipData.series[0]` -- this component is a public,
    // independently-usable tooltip-content provider, and `TooltipData.series: Series<D>` permits
    // an empty array, so guard here rather than relying on every caller to have already checked
    // (RasterPlot.tsx's own mousemove handler does today, but that shouldn't be the only thing
    // standing between an empty series and a destructuring crash below)
    if (selected === undefined) return undefined

    const {x: spikeTime, y} = selected

    // the spikes' statistics, and their values over time, over the window (the data the chart holds)
    const spikeValues: Array<{ time: number, value: number }> = []
    if (spikes !== undefined) {
        for (let i = 0; i < spikes.length; i++) spikeValues.push({time: spikes[i].x, value: spikes[i].y})
    }

    return {
        seriesName,
        spikeTime,
        value: y,
        statistics: spikes !== undefined ? seriesStatistics(spikes) : undefined,
        sparkline: sparklineFor(spikeValues, SPARKLINE_WIDTH, SPARKLINE_HEIGHT),
        axis,
    }
}
