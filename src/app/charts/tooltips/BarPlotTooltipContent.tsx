import {Dimensions, Margin} from "../styling/margins";
import {defaultTooltipStyle, TooltipDimensions, TooltipStyle, tooltipX, tooltipY} from "./tooltipUtils";
import * as d3 from "d3";
import {formatNumber, formatTime, formatValue} from "../utils";
import {useEffect, useMemo} from "react";
import {useChart} from "../hooks/useChart";
import {SeriesLineStyle} from "../axes/axes";
import {usePlotDimensions} from "../hooks/usePlotDimensions";
import {emptyOrdinalDatum, OrdinalDatum} from "../series/ordinalSeries";
import {TooltipData} from "../hooks/useTooltip";
import {WindowedOrdinalStats} from "../subscriptions/subscriptions";
import {DataFrame} from "data-frame-ts";
import {createTable, Padding, TableData, TableFont, TableFormatter, TableStyler} from "svg-table";
import {defaultOrdinalValueStats} from "../observables/ordinals";
import {Dimension} from "svg-table/stylings";

/**
 # Want to write your own tooltip-content component?

 Here's how to write your own tooltip-content component.

 To create your own tooltip content `<MyTooltipContent/>` you must do the following:
 1. Create a react component for your tooltip content (see for example, {@link ScatterPlotTooltipContent}
 as a reference.
 2. Use the {@link useChart} hook to get the {@link registerTooltipContentProvider} registration function.
 3. When your tooltip content component (`<MyTooltipContent/>`) mounts, use the {@link registerTooltipContentProvider}
 function to register your tooltip content provider.
 4. When the chart dimensions, margin, container, etc, change, register your tooltip content provider
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

 Your function to add that actual content will be what this function calls whenever d3 fires a mouse-over
 event on one you the time-series in the chart.

 The code snippet below is from the `useEffect` call in the {@link ScatterPlotTooltipContent}.
 Note that the first four arguments to the {@link addTooltipContent} function are those provided by the {@link useChart} hook
 when a d3 mouse-over event occurs on one of your series. The additional six arguments are from the closure formed
 on the variables in your component. The `chartId`, `container`, `margin`, and `plotDimensions` are from the
 {@link useChart} hook called by the {@link ScatterPlotTooltipContent} component. The last two
 arguments, `defaultTooltipStyle` and `options` are specific to the {@link ScatterPlotTooltipContent}.
 For example, the `options` property is set by the caller of the {@link ScatterPlotTooltipContent}
 component.

 ```typescript
 // register the tooltip content provider function with the chart hook (useChart) so that
 // it is visible to all children of the Chart (i.e. the <Tooltip>).
 registerTooltipContentProvider(
(seriesName: string,
     time: number,
     tooltipData: TooltipData<OrdinalDatum, WindowedOrdinalStats>,
     mouseCoords: [x: number, y: number]
) => {
        return addTooltipContent(
            seriesName, tooltipData, mouseCoords,
            chartId, container, margin, plotDimensions, tooltipStyle,
            ordinalUnits
        )
    }
)
 ```

 This pattern allows you to supplement that `useChart` mouse-over callback with information specific to your component.

 */

/**
 * Properties for rendering the tooltip content. The properties are applied as
 * shown below.
 * ```
 * series name
 * xFormatter, yFormatter
 * ```
 */
interface Props {
    ordinalUnits?: string
    style?: Partial<TooltipStyle>
}

/**
 * Adds tooltip content that shows the series name and the (time, value) of the selected point.
 * ```
 * series name
 * time, value
 * ```
 *
 * Registers the tooltip-content provider with the `ChartContext` so that when d3 fires a mouse-over
 * event on a series. The content provider is returns the {@link addTooltipContent} function
 * when called. And when called the {@link addTooltipContent} function adds the actual tooltip
 * content to the SVG element.
 * @param props The properties describing the tooltip content
 * @return null
 * @constructor
 */
export function BarPlotTooltipContent(props: Props): null {
    const {
        chartId,
        container,
        tooltip,
        axes
    } = useChart<OrdinalDatum, SeriesLineStyle, WindowedOrdinalStats>()

    const {registerTooltipContentProvider} = tooltip

    const {
        yAxesState,
        axisAssignmentsFor
    } = axes

    const {margin, plotDimensions} = usePlotDimensions()

    const {style, ordinalUnits = ""} = props

    const tooltipStyle = useMemo(() => ({...defaultTooltipStyle, ...style}), [style])

    // register the tooltip content provider, which when called on mouse-enter-series events
    // will render the tooltip container and then the tooltip content. recall that that the
    // tooltip content is generated in this plot (because this is the plot that holds all the
    // information needed to render it), and the container for the content is rendered by
    // the <Tooltip>, which this know nothing about.
    //
    // the 'registration function accepts a function of the form (seriesName, time, series) => TooltipDimensions.
    // and that function has a closure on the content-specific information needed to add the
    // actual content
    useEffect(
        () => {
            if (container) {
                // register the tooltip content provider function with the chart hook (useChart) so that
                // it is visible to all children of the Chart (i.e. the <Tooltip>).
                registerTooltipContentProvider(
                    /**
                     *
                     * @param seriesName The name of the series
                     * @param time The mouse time
                     * @param tooltipData The series data and metadata
                     * @param mouseCoords The coordinates of the mouse
                     * @return The tooltip contents
                     */
                    (seriesName: string,
                     time: number,
                     tooltipData: TooltipData<OrdinalDatum, WindowedOrdinalStats>,
                     mouseCoords: [x: number, y: number]
                    ) => {
                        return addTooltipContent(
                            seriesName, tooltipData, mouseCoords,
                            chartId, container, margin, plotDimensions, tooltipStyle,
                            ordinalUnits
                        )
                    }
                )
            }
        },
        [
            chartId, container, margin, plotDimensions, registerTooltipContentProvider,
            tooltipStyle,
            yAxesState, axisAssignmentsFor,
            ordinalUnits
        ]
    )

    return null
}

const dimension: Dimension = {
    width: 60,
    defaultWidth: 70,
    minWidth: 50,
    maxWidth: 100,

    height: 15,
    defaultHeight: 15,
    minHeight: 10,
    maxHeight: 50
}

/**
 * Callback function that adds tooltip content and returns the tooltip width and text height
 * @param seriesName The name of the series (i.e. the neuron ID)
 * @param tooltipData The series data and metadata
 * @param mouseCoords The coordinates of the mouse when the event was fired (relative to the plot container)
 * @param chartId The ID of this chart
 * @param container The plot container (SVGSVGElement)
 * @param margin The plot margins
 * @param tooltipStyle The style properties for the tooltip
 * @param plotDimensions The dimensions of the plot
 * @param ordinalUnits The units of the ordinal data (i.e. "mV")
 * @return The width and text height of the tooltip content
 */
function addTooltipContent(
    seriesName: string,
    tooltipData: TooltipData<OrdinalDatum, WindowedOrdinalStats>,
    mouseCoords: [x: number, y: number],
    chartId: number,
    container: SVGSVGElement,
    margin: Margin,
    plotDimensions: Dimensions,
    tooltipStyle: TooltipStyle,
    ordinalUnits: string
): TooltipDimensions {
    const [x, y] = mouseCoords
    const {series, metadata: statistics} = tooltipData
    const currentDatum = series.length > 0 ? series[series.length - 1] : emptyOrdinalDatum
    const valueStats = statistics.valueStatsForSeries.get(seriesName) || defaultOrdinalValueStats()
    const windowedValueStats = statistics.windowedValueStatsForSeries.get(seriesName) || defaultOrdinalValueStats()
    const displayOrdinalUnits = ordinalUnits.length > 0 ? ` ${ordinalUnits}` : ""

    // display the neuron ID in the tooltip
    const header = d3.select<SVGSVGElement | null, any>(container)
        .append<SVGTextElement>("text")
        .attr('id', `tn${currentDatum.time}-${seriesName}-${chartId}`)
        .attr('class', 'tooltip')
        .attr('fill', tooltipStyle.fontColor)
        .attr('font-family', 'sans-serif')
        .attr('font-size', tooltipStyle.fontSize)
        .attr('font-weight', tooltipStyle.fontWeight)
        .text(() => seriesName)


    // display the series name and the current value
    const text = d3.select<SVGSVGElement | null, any>(container)
        .append<SVGTextElement>("text")
        .attr('id', `t${currentDatum.time}-${seriesName}-${chartId}`)
        .attr('class', 'tooltip')
        .attr('fill', tooltipStyle.fontColor)
        .attr('font-family', 'sans-serif')
        .attr('font-size', tooltipStyle.fontSize + 2)
        .attr('font-weight', tooltipStyle.fontWeight + 150)
        .text(() => `${formatValue(currentDatum.value)}${displayOrdinalUnits}  (${formatTime(currentDatum.time)} ms)`)

    // calculate the max width and height of the text
    const tooltipWidth = Math.max(header.node()?.getBBox()?.width || 0, text.node()?.getBBox()?.width || 0);
    const headerTextHeight = header.node()?.getBBox()?.height || 0;
    const idHeight = text.node()?.getBBox()?.height || 0;
    const textHeight = headerTextHeight + idHeight;

    // set the header text location
    const xCoord = tooltipX(x, tooltipWidth, plotDimensions, tooltipStyle, margin)
    const yCoord = tooltipY(y, textHeight, plotDimensions, tooltipStyle, margin)
    const xTooltip = xCoord + tooltipStyle.paddingLeft
    const yTooltip = yCoord + tooltipStyle.paddingTop
    header
        .attr('x', () => xTooltip)
        .attr('y', () => yTooltip - idHeight + textHeight)

    // set the tooltip text (i.e. series name) location
    text
        .attr('x', () => xTooltip)
        .attr('y', () => yTooltip + textHeight)

    const font: TableFont = {
        size: tooltipStyle.fontSize,
        family: tooltipStyle.fontFamily,
        color: tooltipStyle.fontColor,
        weight: tooltipStyle.fontWeight
    }

    const padding: Padding = {
        top: tooltipStyle.paddingTop,
        bottom: tooltipStyle.paddingBottom,
        right: tooltipStyle.paddingRight,
        left: tooltipStyle.paddingLeft
    }

    const units = ordinalUnits.length > 0 ? ` (${ordinalUnits})` : ""
    return DataFrame
        .from<number | string>([
            [windowedValueStats.count, valueStats.count],
            [windowedValueStats.min.value, valueStats.min.value],
            [windowedValueStats.max.value, valueStats.max.value],
            [windowedValueStats.mean, valueStats.mean],
        ])
        // create the table data that has the column headers
        .flatMap(df => TableData
            .fromDataFrame(df)
            .withColumnHeader(["Windowed", "All"])
            .flatMap(td => td.withRowHeader(["Count", `Min${units}`, `Max${units}`, `Mean${units}`]))
        )
        // add the data formatters for statistics
        .flatMap(tableData => TableFormatter.fromTableData(tableData)
            .addRowFormatters([2, 3, 4], value => formatValue(value as number))
            .flatMap(tf => tf.addRowFormatter(1, value => formatNumber(value as number, " ,.0f")))
            .flatMap(tf => tf.formatTable())
        )
        .map(tableData => TableStyler.fromTableData(tableData)
            .withTableFont(font)
            .withPadding(padding)
            .withColumnHeaderStyle({
                font: {...font, weight: 650},
                padding: {top: 15, bottom: 0},
                dimension: {...dimension, maxHeight: 70},
                alignText: 'right',
            })
            .withRowHeaderStyle({
                font: {...font, weight: 650},
                padding: {left: 0, right: 10},
                dimension: dimension,
                alignText: 'left',
            })
            .withColumnStyles([], {
                padding: {left: 10, right: 10},
                alignText: 'right',
            })
            .withRowStyles([], {
                font,
                dimension: {...dimension, maxHeight: 20},
                padding: {top: 0, bottom: 0}}
            )
            .styleTable()
        )
        .flatMap(styledTable =>
            createTable(styledTable, container, `t${currentDatum.time}-${seriesName}-header-${chartId}`, tooltipCoordinates)
        )
        .map(renderingInfo => {
            const {tableX: x, tableY: y, tableWidth: contentWidth, tableHeight: contentHeight} = renderingInfo
            return {x, y: y - textHeight, contentWidth, contentHeight: contentHeight + textHeight + padding.top}
        })
        .getOrThrow()


    /**
     * Calculates the coordinates of the tooltip based on the width and height of the SVG
     * table. This is needed because the tooltip needs to be adjusted relative mouse location
     * when the mouse coordinates are too close to an edge.
     * @param width The SVG table width
     * @param height The SVG table height
     * @return The updated tooltip coordinates
     */
    function tooltipCoordinates(width: number, height: number): [x: number, y: number] {
        return [
            tooltipX(x, width, plotDimensions, tooltipStyle, margin),
            tooltipY(y + textHeight + padding.top, height, plotDimensions, tooltipStyle, margin)
        ]
    }

}
