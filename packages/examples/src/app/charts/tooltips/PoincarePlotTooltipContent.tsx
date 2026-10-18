import type {CSSProperties, ReactElement} from "react";
import {useLayoutEffect, useState, useRef} from "react";
import {findPointAndNeighbors, sparklineFor, type TooltipStyle} from "./tooltipUtils";
import {TooltipContent} from "./TooltipContent";
import {formatTime, formatValue} from "../utils";
import type {NoTooltipMetadata} from "../hooks/useChart";
import {emptyIterateDatum, type IterateDatum} from "../series/iterateSeries";
import type {TooltipData} from "../hooks/useTooltip";

/**
 * Properties for rendering the tooltip content. The properties are applied as
 * shown below.
 * ```
 * series name
 *          f[n-1](x)         f[n](x)            f[n+1](x)
 * xLabel   xValueFormatter   xValueFormatter    xValueFormatter
 * yLabel   yValueFormatter   yValueFormatter    yValueFormatter
 * ```
 * The column headers are always the `f[i](x)` form, built from the hovered point's index: the
 * `nMinusLagHeader`, `nHeader`, and `nPlusLagHeader` properties, and the `xChangeFormatter` and
 * `yChangeFormatter` properties, are accepted, but not (yet) used.
 */
export interface Props {
    // label for the x-values (x-value row header)
    xLabel: string
    // label for the y-values (y-value row header)
    yLabel: string
    nMinusLagHeader?: string
    nHeader?: string
    nPlusLagHeader?: string
    xValueFormatter?: (value: number) => string
    yValueFormatter?: (value: number) => string
    xChangeFormatter?: (value1: number, value2: number) => string,
    yChangeFormatter?: (value1: number, value2: number) => string,
    style?: Partial<TooltipStyle>
}

/**
 * The data needed to render the tooltip's content, captured when the mouse moves over an element
 */
interface PoincareTooltipContent {
    seriesName: string
    prevHeader: string
    currentHeader: string
    nextHeader: string
    xLabel: string
    xPrev: string
    xCurrent: string
    xNext: string
    yLabel: string
    yPrev: string
    yCurrent: string
    yNext: string
    // the series' values (each point's `f[n+1](x)`) over time, around the hovered point (see
    // `SPARKLINE_POINTS`), for the sparkline -- which is drawn once the tooltip's width is known
    sparklineValues: Array<{ time: number, value: number }>
    // the hovered point's time (marked on the sparkline)
    hoveredTime: number
}

// the height of the tooltip's sparkline (of the series' values over time); it's as wide as the
// tooltip's content (at least this wide)
const SPARKLINE_HEIGHT = 36
const MIN_SPARKLINE_WIDTH = 120
// the number of points (around the hovered point) the sparkline shows
const SPARKLINE_POINTS = 60

/**
 * Adds tooltip content as a table. The columns of the table are the previous, current, and next
 * iterate (relative to the hovered point). The rows of the table are the time values for the
 * first row, and the iterate values (each point's `f[n+1](x)`) for the second row. Below the
 * table, as wide as it, a sparkline of the series' values over time -- the 60 points around the
 * hovered point -- with the hovered point marked.
 * ```
 * series name
 *            f[n-1](x)     f[n](x)      f[n+1](x)
 * t (ms)       t_p            t_c          t_n
 * value        v_p            v_c          v_n
 * value over time
 * sparkline
 * ```
 *
 * Built on {@link TooltipContent}; put it inside a {@link Tooltip}.
 * @param props The properties describing the tooltip content
 * @return The tooltip's portal, or `null` when nothing is being hovered
 */
export function PoincarePlotTooltipContent(props: Props): ReactElement | null {
    const {
        xLabel,
        yLabel,
        // (the `nMinusLagHeader`, `nHeader`, and `nPlusLagHeader` properties aren't used: the
        // column headers are always the `f[i](x)` form, built from the point's index)
        xValueFormatter = formatTime,
        yValueFormatter = formatValue,
        style,
    } = props

    return (
        <TooltipContent<IterateDatum, NoTooltipMetadata, PoincareTooltipContent>
            style={style}
            capture={(seriesName, time, tooltipData) =>
                captureTooltipContent(seriesName, time, tooltipData, {xLabel, yLabel, xValueFormatter, yValueFormatter})
            }
        >
            {(tooltipContent, tooltipStyle) =>
                // (a fresh body for each point, so its sparkline starts out narrower than the
                // tooltip, and the tooltip's size is right when it's placed)
                <PoincareTooltipBody key={tooltipContent.hoveredTime} tooltipContent={tooltipContent} tooltipStyle={tooltipStyle}/>
            }
        </TooltipContent>
    )
}

/**
 * The Poincaré tooltip's content: the series' name, the table of the hovered iterate and its
 * neighbors, and, as wide as the table (or the name, when that's wider), the sparkline of the
 * series' values around the hovered point
 * @param props The captured content, and the tooltip's style
 * @return The tooltip's content
 */
function PoincareTooltipBody(props: {tooltipContent: PoincareTooltipContent, tooltipStyle: TooltipStyle}): ReactElement {
    const {tooltipContent, tooltipStyle} = props

    // the sparkline is as wide as the tooltip's content: its table, or its title when that's wider.
    // Both are measured at their natural widths (rather than the sparkline-stretched width of the
    // tooltip itself), before the tooltip is painted.
    const titleRef = useRef<HTMLDivElement>(null)
    const tableRef = useRef<HTMLTableElement>(null)
    const [sparklineWidth, setSparklineWidth] = useState<number>(MIN_SPARKLINE_WIDTH)
    useLayoutEffect(
        () => {
            const contentWidth = Math.max(
                MIN_SPARKLINE_WIDTH,
                tableRef.current?.offsetWidth ?? 0,
                titleRef.current?.offsetWidth ?? 0
            )
            if (contentWidth !== sparklineWidth) setSparklineWidth(contentWidth)
        },
        [tooltipContent, sparklineWidth]
    )

    const cellStyle: CSSProperties = {padding: '1px 8px', textAlign: 'right', border: 'none'}
    const rowLabelStyle: CSSProperties = {...cellStyle, textAlign: 'left', paddingLeft: 0}
    const headerCellStyle: CSSProperties = {...cellStyle, fontWeight: tooltipStyle.fontWeight + 550}
    // the "current" (middle) column stands out
    const currentColumnStyle: CSSProperties = {...cellStyle, fontWeight: tooltipStyle.fontWeight + 300}

    // the series' values around the hovered point, over time, with the hovered point marked (when
    // there are enough values to draw)
    const sparkline = sparklineFor(
        tooltipContent.sparklineValues, sparklineWidth, SPARKLINE_HEIGHT, 2, undefined, tooltipContent.hoveredTime
    )

    return <>
                <div
                    ref={titleRef}
                    style={{fontSize: tooltipStyle.fontSize, fontWeight: tooltipStyle.fontWeight, marginBottom: 4, width: 'fit-content'}}
                >
                    {tooltipContent.seriesName}
                </div>
                {/* (at its natural width, rather than the app's default full-width tables, so that it
                    can be measured for the sparkline's width) */}
                <table ref={tableRef} style={{fontSize: tooltipStyle.fontSize, borderCollapse: 'collapse', border: 'none', width: 'auto'}}>
                    <thead>
                    <tr>
                        <td style={rowLabelStyle}/>
                        <td style={headerCellStyle}>{tooltipContent.prevHeader}</td>
                        <td style={{...headerCellStyle, ...currentColumnStyle}}>{tooltipContent.currentHeader}</td>
                        <td style={headerCellStyle}>{tooltipContent.nextHeader}</td>
                    </tr>
                    </thead>
                    <tbody>
                    <tr>
                        <td style={rowLabelStyle}>{tooltipContent.xLabel}</td>
                        <td style={cellStyle}>{tooltipContent.xPrev}</td>
                        <td style={currentColumnStyle}>{tooltipContent.xCurrent}</td>
                        <td style={cellStyle}>{tooltipContent.xNext}</td>
                    </tr>
                    <tr>
                        <td style={rowLabelStyle}>{tooltipContent.yLabel}</td>
                        <td style={cellStyle}>{tooltipContent.yPrev}</td>
                        <td style={currentColumnStyle}>{tooltipContent.yCurrent}</td>
                        <td style={cellStyle}>{tooltipContent.yNext}</td>
                    </tr>
                    </tbody>
                </table>
                {/* the series' values over time, with the hovered point marked (the dot) */}
                {sparkline !== undefined && <>
                    <div style={{fontSize: tooltipStyle.fontSize, marginTop: 8}}>
                        {tooltipContent.yLabel} over time
                    </div>
                    <svg
                        width={sparklineWidth}
                        height={SPARKLINE_HEIGHT}
                        style={{display: 'block', marginTop: 4}}
                        aria-hidden="true"
                    >
                        <path
                            d={sparkline.path}
                            fill="none"
                            stroke={tooltipStyle.fontColor}
                            strokeWidth={1}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                        />
                        {sparkline.mark !== undefined &&
                            <circle
                                cx={sparkline.mark[0]}
                                cy={sparkline.mark[1]}
                                r={2.5}
                                fill={tooltipStyle.fontColor}
                            />
                        }
                    </svg>
                </>}
    </>
}

// the row labels and value formatters for the tooltip's table
interface CaptureOptions {
    xLabel: string
    yLabel: string
    xValueFormatter: (value: number) => string
    yValueFormatter: (value: number) => string
}

/**
 * Captures the data needed to render the tooltip's content: the table (the hovered point, the
 * first point within 0.1 of the plot's time, and its neighbors), and the series' values around
 * the hovered point, over time, for the sparkline
 * @param seriesName The name of the series
 * @param time The time of the hovered point
 * @param tooltipData The series data and metadata
 * @param options Header labels and value formatters
 * @return The tooltip's content
 */
function captureTooltipContent(
    seriesName: string,
    time: number,
    tooltipData: TooltipData<IterateDatum, NoTooltipMetadata>,
    options: CaptureOptions,
): PoincareTooltipContent {
    const {series} = tooltipData
    const [lower, point, upper, index] = findPointAndNeighbors(
        series, time, 0.1, value => value.time, () => emptyIterateDatum
    )
    const {xLabel, yLabel, xValueFormatter, yValueFormatter} = options

    return {
        seriesName,
        // (the headers are always the f[i](x) form, built from the point's index)
        prevHeader: index > 0 ? `f[${index - 1}](x)` : '- n/a -',
        currentHeader: `f[${index}](x)`,
        nextHeader: index < series.length - 1 ? `f[${index + 1}](x)` : '- n/a -',
        xLabel,
        xPrev: xValueFormatter(lower.time),
        xCurrent: xValueFormatter(point.time),
        xNext: xValueFormatter(upper.time),
        yLabel,
        yPrev: yValueFormatter(lower.iterateN_1),
        yCurrent: yValueFormatter(point.iterateN_1),
        yNext: yValueFormatter(upper.iterateN_1),
        sparklineValues: valuesAround(series, index, SPARKLINE_POINTS),
        hoveredTime: point.time,
    }
}

/**
 * The values (each point's `f[n+1](x)`) of (at most) the specified number of points around the
 * hovered point, over time: centered on the hovered point, or shifted to stay within the series
 * when the hovered point is near its start or end
 * @param series The series' iterates, ordered by time
 * @param index The index of the hovered point (or -1, when it wasn't found)
 * @param count The (largest) number of points
 * @return The points' times and values, in order
 */
function valuesAround(
    series: { length: number, [index: number]: IterateDatum },
    index: number,
    count: number
): Array<{ time: number, value: number }> {
    if (index < 0) return []
    const start = Math.max(0, Math.min(index - Math.floor(count / 2), series.length - count))
    const end = Math.min(series.length, start + count)
    const values: Array<{ time: number, value: number }> = []
    for (let i = start; i < end; i++) values.push({time: series[i].time, value: series[i].iterateN_1})
    return values
}
