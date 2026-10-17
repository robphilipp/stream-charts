import type {CSSProperties, ReactElement} from "react";
import {useEffect, useLayoutEffect, useMemo, useState, useRef} from "react";
import {createPortal} from "react-dom";
import {
    defaultTooltipStyle,
    findPointAndNeighbors,
    sparklineFor,
    type TooltipDimensions,
    type TooltipStyle,
} from "./tooltipUtils";
import {tooltipAnchorFor, type TooltipAnchor, useTooltipPlacement} from "./useTooltipPlacement"
import {withAlpha} from "../styling/canvasStyle";
import {formatTime, formatValue} from "../utils";
import {type NoTooltipMetadata, useChart} from "../hooks/useChart";
import {usePlotDimensions} from "../hooks/usePlotDimensions";
import {emptyIterateDatum, type IterateDatum} from "../series/iterateSeries";
import type {ContinuousNumericAxis, SeriesLineStyle} from "../axes/axes";
import type {TooltipData} from "../hooks/useTooltip";
import {ContinuousAxisRange} from "../axes/ContinuousAxisRange";

/**
 # Want to write your own tooltip-content component?

 Here's how to write your own tooltip-content component.

 To create your own tooltip content `<MyTooltipContent/>` you must do the following:
 1. Create a react component for your tooltip content (see for example, {@link PoincarePlotTooltipContent}
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
 mousemove hit-test finds the mouse hovering over one of the points in the chart. Tooltip content
 itself is rendered declaratively as a React portal (see {@link PoincarePlotTooltipContent} below
 for a full example) rather than drawn/appended directly.

 NOTE ON THIS FILE'S CONVERSION: like `BarPlotTooltipContent.tsx`, the original SVG version
 rendered its table using the third-party `svg-table` library (`createTable(...)`), which renders
 directly into an SVG container element. That has no canvas equivalent and no visibility into its
 internal cell-styling data shape for retargeting, so this version replaces it with a plain HTML
 `<table>` -- same data (previous/current/next iterate values), same "current" column highlight,
 just laid out with real HTML/CSS instead of an external SVG-table-rendering dependency.

 */

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
 * The data needed to render the tooltip's table content, captured at mouse-over time and read
 * back out during render. Replaces the old version's immediate SVG DOM manipulation (via
 * `svg-table`'s `createTable`).
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
    // where the tooltip is anchored (the mouse)
    anchor: TooltipAnchor
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
 * Registers the tooltip-content provider with the `ChartContext` so that when the plot's
 * mousemove hit-test finds the mouse over a point, this component's content is shown. On
 * mouse-over, the provider just captures the data needed to render (via `setTooltipContent`) and
 * returns off-screen {@link TooltipDimensions} so the parent {@link Tooltip}'s own background
 * element stays invisible -- this component renders its own, independent portal instead (see
 * {@link OutlierPlotHtmlTooltipContent} for the established pattern this follows).
 * @param props The properties describing the tooltip content
 * @return The tooltip's portal, or `null` when nothing is being hovered
 */
export function PoincarePlotTooltipContent(props: Props): ReactElement | null {
    const {
        chartId,
        canvas,
        tooltip,
        mouse
    } = useChart<IterateDatum, SeriesLineStyle, NoTooltipMetadata, ContinuousAxisRange, ContinuousNumericAxis>()

    const {registerTooltipContentProvider} = tooltip
    const {registerMouseLeaveHandler, unregisterMouseLeaveHandler} = mouse

    const {
        margin,
        plotDimensions,
    } = usePlotDimensions()

    const {
        xLabel,
        yLabel,
        // NOTE: matches the original exactly -- these props are accepted but never actually used;
        // the real column headers are always the hard-coded `f[i](x)` form built in
        // captureTooltipContent from the point's index, regardless of what's passed here. This
        // looks like a latent bug in the original, but the goal here is a faithful port, not an
        // unrequested behavior change.
        // nMinusLagHeader: _nMinusLagHeader = 'f[n-1](x)',
        // nHeader: _nHeader = 'f[n](x)',
        // nPlusLagHeader: _nPlusLagHeader = 'f[n+1](x)',
        xValueFormatter = formatTime,
        yValueFormatter = formatValue,
        style,
    } = props

    const tooltipStyle = useMemo(
        () => ({...defaultTooltipStyle, ...style}), [style]
    )

    const [tooltipContent, setTooltipContent] = useState<PoincareTooltipContent | null>(null)
    // the tooltip (its portal), which is placed next to the mouse once rendered
    const tooltipRef = useRef<HTMLDivElement>(null)

    // register the tooltip content provider, which when called on mouse-over-point events
    // captures the data needed to render the tooltip; the actual rendering happens declaratively
    // below, via the portal.
    useEffect(
        () => {
            if (canvas) {
                registerTooltipContentProvider(
                    (seriesName: string, time: number, tooltipData: TooltipData<IterateDatum, NoTooltipMetadata>, mouseCoords: [x: number, y: number]) =>
                        captureTooltipContent(
                            seriesName, time, tooltipData, mouseCoords,
                            canvas,
                            {xLabel, yLabel, xValueFormatter, yValueFormatter},
                            setTooltipContent
                        )
                )
            }
        },
        [
            canvas, margin, plotDimensions, registerTooltipContentProvider,
            xLabel, xValueFormatter,
            yLabel, yValueFormatter,
            tooltipStyle
        ]
    )

    // clears the captured content (and so unmounts the portal) when the mouse leaves the point
    useEffect(
        () => {
            const handlerId = `html-tooltip-leave-${chartId}`
            registerMouseLeaveHandler(handlerId, () => setTooltipContent(null))
            return () => unregisterMouseLeaveHandler(handlerId)
        },
        [chartId, registerMouseLeaveHandler, unregisterMouseLeaveHandler]
    )

    // positions the tooltip next to the mouse, based on its rendered size
    // the sparkline is as wide as the tooltip's content: its table, or its title when that's wider.
    // Both are measured at their natural widths (rather than the sparkline-stretched width of the
    // tooltip itself), so the sparkline shrinks again for a narrower tooltip. Measured before the
    // tooltip is painted, and before it's placed (the placement below runs after this re-render).
    const titleRef = useRef<HTMLDivElement>(null)
    const tableRef = useRef<HTMLTableElement>(null)
    const [sparklineWidth, setSparklineWidth] = useState<number>(MIN_SPARKLINE_WIDTH)
    useLayoutEffect(
        () => {
            if (tooltipContent === null) return
            const contentWidth = Math.max(
                MIN_SPARKLINE_WIDTH,
                tableRef.current?.offsetWidth ?? 0,
                titleRef.current?.offsetWidth ?? 0
            )
            if (contentWidth !== sparklineWidth) setSparklineWidth(contentWidth)
        },
        [tooltipContent, sparklineWidth]
    )

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
    const headerCellStyle: CSSProperties = {...cellStyle, fontWeight: tooltipStyle.fontWeight + 550}
    // matches the old version's `currentIterateStyle`, applied to the "current" (middle) column
    const currentColumnStyle: CSSProperties = {...cellStyle, fontWeight: tooltipStyle.fontWeight + 300}

    // the series' values around the hovered point, over time, with the hovered point marked (when
    // there are enough values to draw)
    const sparkline = sparklineFor(
        tooltipContent.sparklineValues, sparklineWidth, SPARKLINE_HEIGHT, 2, undefined, tooltipContent.hoveredTime
    )

    return createPortal(
        <div ref={tooltipRef} style={divStyle}>
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
        </div>,
        document.body
    )
}

// the row labels and value formatters for the tooltip's table
interface CaptureOptions {
    xLabel: string
    yLabel: string
    xValueFormatter: (value: number) => string
    yValueFormatter: (value: number) => string
}

/**
 * Captures the data needed to render the tooltip's content -- the table (the hovered point, the
 * first point within 0.1 of the mouse's time, and its neighbors), and the series' values around
 * the hovered point, over time, for the sparkline -- and where it's anchored (the mouse -- the
 * tooltip is placed next to it once it's rendered, see {@link useTooltipPlacement}). Replaces the
 * old version, which built and positioned an SVG table via `svg-table`'s `createTable`.
 * @param seriesName The name of the series (i.e. the neuron ID)
 * @param time The time (x-coordinate value) corresponding to the mouse location
 * @param tooltipData The series data and metadata
 * @param mouseCoords The coordinates of the mouse when the event was fired, in canvas-local coordinates
 * @param canvas The chart's canvas element
 * @param options Header labels and value formatters
 * @param setTooltipContent Setter that stashes the captured content for the component to render
 * @return Off-screen {@link TooltipDimensions}, so the parent <Tooltip>'s own background stays invisible
 */
function captureTooltipContent(
    seriesName: string,
    time: number,
    tooltipData: TooltipData<IterateDatum, NoTooltipMetadata>,
    mouseCoords: [x: number, y: number],
    canvas: HTMLCanvasElement,
    options: CaptureOptions,
    setTooltipContent: (content: PoincareTooltipContent) => void,
): TooltipDimensions {
    const {series} = tooltipData
    const [lower, point, upper, index] = findPointAndNeighbors(
        series, time, 0.1, value => value.time, () => emptyIterateDatum
    )
    const {xLabel, yLabel, xValueFormatter, yValueFormatter} = options

    setTooltipContent({
        seriesName,
        // matches the original: the header props are accepted but unused; headers are always this
        // hard-coded f[i](x) form, built from the point's index
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
        anchor: tooltipAnchorFor(mouseCoords, canvas),
    })

    // return off-screen coordinates so the Tooltip parent's background div is invisible
    return {x: -99999, y: -99999, contentWidth: 0, contentHeight: 0}
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
