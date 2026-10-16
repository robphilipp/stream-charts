import type {CSSProperties, ReactElement} from "react";
import {useEffect, useMemo, useState, useRef} from "react";
import {createPortal} from "react-dom";
import {defaultTooltipStyle, type Sparkline, sparklineFor, type TooltipDimensions, type TooltipStyle} from "./tooltipUtils";
import {tooltipAnchorFor, type TooltipAnchor, useTooltipPlacement} from "./useTooltipPlacement"
import {withAlpha} from "../styling/canvasStyle";
import {formatNumber, formatTime, formatValue} from "../utils";
import {useChart} from "../hooks/useChart";
import type {ContinuousNumericAxis, SeriesLineStyle} from "../axes/axes";
import {usePlotDimensions} from "../hooks/usePlotDimensions";
import {emptyOrdinalDatum, type OrdinalDatum} from "../series/ordinalSeries";
import type {TooltipData} from "../hooks/useTooltip";
import type {WindowedOrdinalStats} from "../datasources/ordinalDataSource";
import {defaultOrdinalValueStats} from "../observables/ordinals";
import {ContinuousAxisRange} from "../axes/ContinuousAxisRange";
import {BAR_CHART_TOOLTIP_PROVIDER_IDS} from "../plots/constants.ts";

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

 Your function to capture the actual content will be what this function calls whenever the plot's
 mousemove hit-test finds the mouse hovering over one of the elements in the chart. Tooltip content
 itself is rendered declaratively as a React portal (see {@link BarPlotTooltipContent} below for a
 full example) rather than drawn/appended directly.

 NOTE ON THIS FILE'S CONVERSION: the original SVG version rendered its statistics table using the
 third-party `svg-table` library (`createTable(...)`), which renders directly into an SVG container
 element. That has no canvas equivalent and no visibility into its internal cell-styling data shape
 for retargeting, so this version replaces it with a plain HTML `<table>` -- same data, same
 per-cell highlight semantics (see `coordinatesForProviderId`), just laid out with real HTML/CSS
 instead of an external SVG-table-rendering dependency.

 */

/**
 * Properties for rendering the tooltip content. The properties are applied as
 * shown below.
 * ```
 * series name
 * xFormatter, yFormatter
 * ```
 */
export interface Props {
    ordinalUnits?: string
    style?: Partial<TooltipStyle>
}

/**
 * A single stats row's windowed/all values, already formatted for display.
 */
interface StatsRow {
    label: string
    windowed: string
    all: string
    /** whether the windowed or all-time cell (or neither) should be highlighted, based on which specific bar-chart element is hovered */
    highlight: 'windowed' | 'all' | 'none'
}

/**
 * The data needed to render the tooltip's table content, captured at mouse-over time and read
 * back out during render. Replaces the old version's immediate SVG DOM manipulation (via
 * `svg-table`'s `createTable`).
 */
// the size of the tooltip's sparkline (of the value over time)
const SPARKLINE_WIDTH = 180
const SPARKLINE_HEIGHT = 36

interface BarTooltipContent {
    seriesName: string
    headerLabel: string
    valueLine: string
    // the value over time (the data the chart holds), when there's enough of it to draw
    sparkline: Sparkline | undefined
    rows: Array<StatsRow>
    // where the tooltip is anchored (the mouse)
    anchor: TooltipAnchor
}

/**
 * Adds tooltip content that shows the series name, the current value, and a small stats table
 * (count/min/max/mean, windowed vs. all-time) for the bar-chart element being hovered.
 *
 * Registers the tooltip-content provider with the `ChartContext` so that when the plot's
 * mousemove hit-test finds the mouse over one of the bar-chart's five element types, this
 * component's content is shown. On mouse-over, the provider just captures the data needed to
 * render (via `setTooltipContent`) and returns off-screen {@link TooltipDimensions} so the parent
 * {@link Tooltip}'s own background element stays invisible -- this component renders its own,
 * independent portal instead (see {@link OutlierPlotHtmlTooltipContent} for the established
 * pattern this follows).
 * @param props The properties describing the tooltip content
 * @return The tooltip's portal, or `null` when nothing is being hovered
 */
export function BarPlotTooltipContent(props: Props): ReactElement | null {
    const {
        chartId,
        canvas,
        tooltip,
        mouse
    } = useChart<OrdinalDatum, SeriesLineStyle, WindowedOrdinalStats, ContinuousAxisRange, ContinuousNumericAxis>()

    const {registerTooltipContentProvider} = tooltip
    const {registerMouseLeaveHandler, unregisterMouseLeaveHandler} = mouse
    const {margin, plotDimensions} = usePlotDimensions()
    const {style, ordinalUnits = ""} = props
    const tooltipStyle = useMemo(() => ({...defaultTooltipStyle, ...style}), [style])

    const [tooltipContent, setTooltipContent] = useState<BarTooltipContent | null>(null)
    // the tooltip (its portal), which is placed next to the mouse once rendered
    const tooltipRef = useRef<HTMLDivElement>(null)

    // register the tooltip content provider, which when called on mouse-over-element events
    // captures the data needed to render the tooltip; the actual rendering happens declaratively
    // below, via the portal.
    useEffect(
        () => {
            if (canvas) {
                registerTooltipContentProvider(
                    /**
                     * @param seriesName The name of the series
                     * @param _time The mouse time
                     * @param tooltipData The series data and metadata
                     * @param mouseCoords The coordinates of the mouse, in canvas-local coordinates
                     * @param providerId The ID of the tooltip content provider (identifies which of the five element types was hovered)
                     * @return Off-screen dimensions, so the parent <Tooltip>'s own background stays invisible
                     */
                    (seriesName: string,
                     _time: number,
                     tooltipData: TooltipData<OrdinalDatum, WindowedOrdinalStats>,
                     mouseCoords: [x: number, y: number],
                     providerId?: string
                    ) => {
                        if (providerId === undefined) {
                            return {x: -99999, y: -99999, contentWidth: 0, contentHeight: 0}
                        }
                        return captureTooltipContent(
                            seriesName, providerId, tooltipData, mouseCoords,
                            canvas,
                            ordinalUnits,
                            setTooltipContent
                        )
                    }
                )
            }
        },
        [
            canvas, margin, plotDimensions, registerTooltipContentProvider,
            tooltipStyle,
            ordinalUnits
        ]
    )

    // clears the captured content (and so unmounts the portal) when the mouse leaves the element
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

    const cellStyle: CSSProperties = {padding: '1px 10px', textAlign: 'right', border: 'none'}
    const rowLabelStyle: CSSProperties = {...cellStyle, textAlign: 'left', paddingLeft: 0}
    const headerCellStyle: CSSProperties = {...cellStyle, fontWeight: tooltipStyle.fontWeight + 550}
    const highlightStyle: CSSProperties = {fontWeight: tooltipStyle.fontWeight + 300}

    return createPortal(
        <div ref={tooltipRef} style={divStyle}>
            <div style={{fontSize: tooltipStyle.fontSize, fontWeight: tooltipStyle.fontWeight}}>
                {tooltipContent.seriesName} ({tooltipContent.headerLabel})
            </div>
            <div style={{fontSize: tooltipStyle.fontSize + 2, fontWeight: tooltipStyle.fontWeight + 150, marginBottom: 6}}>
                {tooltipContent.valueLine}
            </div>
            {/* the value over time, ending in the current value (the dot) */}
            {tooltipContent.sparkline !== undefined &&
                <svg
                    width={SPARKLINE_WIDTH}
                    height={SPARKLINE_HEIGHT}
                    style={{display: 'block', marginBottom: 6}}
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
            <table style={{fontSize: tooltipStyle.fontSize, borderCollapse: 'collapse', border: 'none'}}>
                <thead>
                <tr>
                    <td style={rowLabelStyle}/>
                    <td style={headerCellStyle}>Windowed</td>
                    <td style={headerCellStyle}>All</td>
                </tr>
                </thead>
                <tbody>
                {tooltipContent.rows.map(row => (
                    <tr key={row.label}>
                        <td style={rowLabelStyle}>{row.label}</td>
                        <td style={row.highlight === 'windowed' ? {...cellStyle, ...highlightStyle} : cellStyle}>{row.windowed}</td>
                        <td style={row.highlight === 'all' ? {...cellStyle, ...highlightStyle} : cellStyle}>{row.all}</td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>,
        document.body
    )
}

/**
 * Creates the label to display in the tooltip header
 * @param providerId The tooltip provider ID for which to create the label
 * @return The label to display in the tooltip header
 */
function labelForProviderId(providerId: string): string {
    switch (providerId) {
        case BAR_CHART_TOOLTIP_PROVIDER_IDS.currentValue:
            return 'current value'
        case BAR_CHART_TOOLTIP_PROVIDER_IDS.meanValue:
            return 'mean value'
        case BAR_CHART_TOOLTIP_PROVIDER_IDS.minMax:
            return 'min/max'
        case BAR_CHART_TOOLTIP_PROVIDER_IDS.windowedMeanValue:
            return 'windowed mean'
        case BAR_CHART_TOOLTIP_PROVIDER_IDS.windowedMinMax:
            return 'windowed min/max'

        default:
            return ''
    }
}

/**
 * Determines which stats-table cell (if any) should be highlighted for the given provider ID,
 * matching the original's `coordinatesForProviderId` (row 2/3/4 = Min/Max/Mean; column
 * 1/2 = Windowed/All).
 * @param providerId The tooltip provider ID for which the highlighted element (bar chart series
 * element) that is hovered
 * @return A function that, given a stats-row label, returns which column (if any) to highlight
 */
function highlightFor(providerId: string): (rowLabel: 'Count' | 'Min' | 'Max' | 'Mean') => 'windowed' | 'all' | 'none' {
    switch (providerId) {
        case BAR_CHART_TOOLTIP_PROVIDER_IDS.meanValue:
            return label => label === 'Mean' ? 'all' : 'none'
        case BAR_CHART_TOOLTIP_PROVIDER_IDS.minMax:
            return label => (label === 'Min' || label === 'Max') ? 'all' : 'none'
        case BAR_CHART_TOOLTIP_PROVIDER_IDS.windowedMeanValue:
            return label => label === 'Mean' ? 'windowed' : 'none'
        case BAR_CHART_TOOLTIP_PROVIDER_IDS.windowedMinMax:
            return label => (label === 'Min' || label === 'Max') ? 'windowed' : 'none'
        default:
            return () => 'none'
    }
}

/**
 * Captures the data needed to render the tooltip's table content, and computes its viewport-fixed
 * position. Replaces the old version, which built and positioned an SVG table via `svg-table`'s
 * `createTable`.
 * @param seriesName The name of the series (i.e. the neuron ID)
 * @param providerId The tooltip content provider ID (i.e. which bar-chart element is hovered)
 * @param tooltipData The series data and metadata
 * @param mouseCoords The coordinates of the mouse when the event was fired, in canvas-local coordinates
 * @param canvas The chart's canvas element
 * @param ordinalUnits The units of the ordinal data (i.e. "mV")
 * @param setTooltipContent Setter that stashes the captured content for the component to render
 * @return Off-screen {@link TooltipDimensions}, so the parent <Tooltip>'s own background stays invisible
 */
function captureTooltipContent(
    seriesName: string,
    providerId: string,
    tooltipData: TooltipData<OrdinalDatum, WindowedOrdinalStats>,
    mouseCoords: [x: number, y: number],
    canvas: HTMLCanvasElement,
    ordinalUnits: string,
    setTooltipContent: (content: BarTooltipContent) => void,
): TooltipDimensions {
    const {series, metadata: statistics} = tooltipData

    const currentDatum = series.length > 0 ? series[series.length - 1] : emptyOrdinalDatum
    const valueStats = statistics.valueStatsForSeries.get(seriesName) || defaultOrdinalValueStats()
    const windowedValueStats = statistics.windowedValueStatsForSeries.get(seriesName) || defaultOrdinalValueStats()
    const displayOrdinalUnits = ordinalUnits.length > 0 ? ` ${ordinalUnits}` : ""
    const unitsSuffix = ordinalUnits.length > 0 ? ` (${ordinalUnits})` : ""

    const highlight = highlightFor(providerId)
    const rows: Array<StatsRow> = [
        {label: 'Count', windowed: formatNumber(windowedValueStats.count, " ,.0f"), all: formatNumber(valueStats.count, " ,.0f"), highlight: highlight('Count')},
        {label: `Min${unitsSuffix}`, windowed: formatValue(windowedValueStats.min.value), all: formatValue(valueStats.min.value), highlight: highlight('Min')},
        {label: `Max${unitsSuffix}`, windowed: formatValue(windowedValueStats.max.value), all: formatValue(valueStats.max.value), highlight: highlight('Max')},
        {label: `Mean${unitsSuffix}`, windowed: formatValue(windowedValueStats.mean), all: formatValue(valueStats.mean), highlight: highlight('Mean')},
    ]

    setTooltipContent({
        seriesName,
        headerLabel: labelForProviderId(providerId),
        valueLine: `${formatValue(currentDatum.value)}${displayOrdinalUnits}  (${formatTime(currentDatum.time)} ms)`,
        sparkline: sparklineFor(series, SPARKLINE_WIDTH, SPARKLINE_HEIGHT),
        rows,
        anchor: tooltipAnchorFor(mouseCoords, canvas),
    })

    // return off-screen coordinates so the Tooltip parent's background div is invisible
    return {x: -99999, y: -99999, contentWidth: 0, contentHeight: 0}
}
