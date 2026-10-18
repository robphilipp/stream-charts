import type {CSSProperties, ReactElement} from "react";
import {type Sparkline, sparklineFor, type TooltipStyle} from "./tooltipUtils";
import {TooltipContent} from "./TooltipContent";
import {formatNumber, formatTime, formatValue} from "../utils";
import {emptyOrdinalDatum, type OrdinalDatum} from "../series/ordinalSeries";
import type {TooltipData} from "../hooks/useTooltip";
import type {WindowedOrdinalStats} from "../datasources/ordinalDataSource";
import {defaultOrdinalValueStats} from "../observables/ordinals";
import {BAR_CHART_TOOLTIP_PROVIDER_IDS} from "../plots/constants";

/**
 * Properties for rendering the tooltip content
 */
export interface Props {
    /** the units of the values (e.g. "mV"), shown after the values (none by default) */
    ordinalUnits?: string
    /** the style of the tooltip */
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

// the size of the tooltip's sparkline (of the value over time)
const SPARKLINE_WIDTH = 180
const SPARKLINE_HEIGHT = 36

/**
 * The data needed to render the tooltip's content, captured when the mouse moves over an element
 */
interface BarTooltipContent {
    seriesName: string
    headerLabel: string
    valueLine: string
    // the value over time (the data the chart holds), when there's enough of it to draw
    sparkline: Sparkline | undefined
    rows: Array<StatsRow>
}

/**
 * Adds tooltip content that shows the series name, the current value, a small stats table
 * (count/min/max/mean, windowed vs. all-time) for the bar-chart element being hovered, and a
 * sparkline of the value over the data the chart holds.
 *
 * Built on {@link TooltipContent}; put it inside a {@link Tooltip}.
 * @param props The properties describing the tooltip content
 * @return The tooltip's portal, or `null` when nothing is being hovered
 */
export function BarPlotTooltipContent(props: Props): ReactElement | null {
    const {style, ordinalUnits = ""} = props

    return (
        <TooltipContent<OrdinalDatum, WindowedOrdinalStats, BarTooltipContent>
            style={style}
            capture={(seriesName, _value, tooltipData, providerId) =>
                // (the provider ID says which of the bar's elements is hovered)
                providerId === undefined ?
                    undefined :
                    captureTooltipContent(seriesName, providerId, tooltipData, ordinalUnits)
            }
        >
            {(tooltipContent, tooltipStyle) => {
                const cellStyle: CSSProperties = {padding: '1px 10px', textAlign: 'right', border: 'none'}
                const rowLabelStyle: CSSProperties = {...cellStyle, textAlign: 'left', paddingLeft: 0}
                const headerCellStyle: CSSProperties = {...cellStyle, fontWeight: tooltipStyle.fontWeight + 550}
                const highlightStyle: CSSProperties = {fontWeight: tooltipStyle.fontWeight + 300}

                return <>
                    <div style={{fontSize: tooltipStyle.fontSize, fontWeight: tooltipStyle.fontWeight}}>
                        {tooltipContent.seriesName} ({tooltipContent.headerLabel})
                    </div>
                    <div style={{fontSize: tooltipStyle.fontSize + 2, fontWeight: tooltipStyle.fontWeight + 150, marginBottom: 6}}>
                        {tooltipContent.valueLine}
                    </div>
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
                    {/* the value over time, ending in the current value (the dot) */}
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
                </>
            }}
        </TooltipContent>
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
 * Captures the data needed to render the tooltip's content (its header, value, stats table, and
 * sparkline)
 * @param seriesName The name of the series (i.e. the neuron ID)
 * @param providerId The tooltip content provider ID (i.e. which bar-chart element is hovered)
 * @param tooltipData The series data and metadata
 * @param ordinalUnits The units of the ordinal data (i.e. "mV")
 * @return The tooltip's content
 */
function captureTooltipContent(
    seriesName: string,
    providerId: string,
    tooltipData: TooltipData<OrdinalDatum, WindowedOrdinalStats>,
    ordinalUnits: string,
): BarTooltipContent {
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

    return {
        seriesName,
        headerLabel: labelForProviderId(providerId),
        valueLine: `${formatValue(currentDatum.value)}${displayOrdinalUnits}  (${formatTime(currentDatum.time)} ms)`,
        sparkline: sparklineFor(series, SPARKLINE_WIDTH, SPARKLINE_HEIGHT),
        rows,
    }
}
