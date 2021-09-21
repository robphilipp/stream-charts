import {cloneElement, useEffect, useMemo} from "react";
import {defaultTooltipStyle, removeTooltip, TooltipStyle} from "./tooltipUtils";
import * as d3 from "d3";
import {useChart} from "./hooks/useChart";

export interface Props {
    visible: boolean
    style?: Partial<TooltipStyle>
    children: JSX.Element
}

/**
 * Tooltip component triggered by mouse-over-series events. When mounted, the tooltip component
 * registers a mouse-over handler with the {@link useChart} hook using the
 * {@link UseChartValues.registerTooltipContentProvider} function. The handler renders the tooltip
 * by adding it to the SVG plot container. However, to remain general, this {@link Tooltip} also
 * uses the {@link useChart}'s {@link UseChartValues.tooltipContentProvider} to render the actual
 * content of the tooltip. The content provider is given the series' name on which the mouse-over
 * event occurred, the plot time associated with mouse-over event, and the {@link TimeSeries}
 * associated with the mouse-over event. The plot (for example {@link ScatterPlot}) is responsible
 * for rendering the tooltip, and it registers this tooltip-content provider with the {@link useChart}
 * hook.
 *
 * The {@link useChart} hook allows the plots and this tooltip to register methods needed its siblings.
 *
 * ## on mount
 * 1. The plot (for example {@link ScatterPlot}) adds a d3 mouse-enter and mouse-leave event handlers
 *    to each series. The mouse-enter event handler performs a few tasks and then calls the
 *    mouse-over event handler registered by the {@link Tooltip} via the {@link useChart} hook.
 * 2. The plot (for example {@link ScatterPlot}) registers the tooltip-content provider with the {@link useChart}
 *    hook using the {@link UseChartValues.registerTooltipContentProvider} function.
 * 3. {@link Tooltip} registers the handler for mouse-over events. The handler accepts the series
 *    name, plot time, and time-series associated with the mouse-over event, and returns the tooltip
 *    dimensions. In order to create/render the tooltip, it uses the {@link UseChartValues.tooltipContentProvider}
 *    function that was registered via the {@link useChart} hook.
 *
 * ## on mouse-over event
 * When the plot's (for example {@link ScatterPlot}) d3 mouse-enter event handler fires, the plot calls this
 * {@link Tooltip}'s mouse-over handler, which creates the tooltip, and calls the {@link UseChartValues.tooltipContentProvider}
 * registered by the plot to render the tooltip content, and get the tooltip size.
 *
 * @param props The properties of the tooltip (i.e. visibility and style)
 * @return null
 * @constructor
 */
export function Tooltip(props: Props): JSX.Element {
    const {
        chartId,
        container,
        margin,
        plotDimensions,
        registerMouseOverHandler,
        unregisterMouseOverHandler,
        tooltipContentProvider,
        registerMouseLeaveHandler,
        unregisterMouseLeaveHandler,
    } = useChart()

    const {
        visible,
        style,
        children
    } = props

    const tooltipStyle = useMemo(() => ({...defaultTooltipStyle, ...style}), [style])

    useEffect(
        () => {
            const handlerId = `tooltip-${chartId}`
            if (visible && container) {
                const contentProvider = tooltipContentProvider()
                if (contentProvider) {
                    // register this tooltip's mouse-over event handler with the useCharts hook
                    // so that the plots can call it when mouse-enter events are triggered (for
                    // example, a mouse-over a time-series in the plot).
                    registerMouseOverHandler(
                        handlerId,
                        ((seriesName, time, series, mouseCoords) => {
                                // create the rounded rectangle for the tooltip's background
                                const rect = d3.select<SVGSVGElement | null, any>(container)
                                    .append<SVGRectElement>('rect')
                                    .attr('id', `r${time}-${seriesName}-${chartId}`)
                                    .attr('class', 'tooltip')
                                    .attr('rx', tooltipStyle.borderRadius)
                                    .attr('fill', tooltipStyle.backgroundColor)
                                    .attr('fill-opacity', tooltipStyle.backgroundOpacity)
                                    .attr('stroke', tooltipStyle.borderColor)
                                    .attr('stroke-width', tooltipStyle.borderWidth)

                                // call the callback to add the content
                                const {x, y, contentWidth, contentHeight} = contentProvider(seriesName, time, series, mouseCoords)

                                // set the position, width, and height of the tooltip rect based on the text height and width and the padding
                                rect.attr('x', () => x)
                                    .attr('y', () => y)
                                    .attr('width', contentWidth + tooltipStyle.paddingLeft + tooltipStyle.paddingRight)
                                    .attr('height', contentHeight + tooltipStyle.paddingTop + tooltipStyle.paddingBottom)

                            }
                        )
                    )

                    registerMouseLeaveHandler(handlerId, () => removeTooltip())
                }
            }
            return () => {
                unregisterMouseOverHandler(handlerId)
                unregisterMouseLeaveHandler(handlerId)
            }
        },
        [
            chartId, container, margin, plotDimensions,
            registerMouseOverHandler, tooltipContentProvider, tooltipStyle,
            unregisterMouseOverHandler, visible, registerMouseLeaveHandler,
            unregisterMouseLeaveHandler
        ]
    )

    return <>{cloneElement(children, props)}</>
}
