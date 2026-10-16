import {cloneElement, type JSX, useEffect, useMemo} from "react";
import {defaultTooltipStyle, removeTooltip, type TooltipStyle} from "./tooltipUtils";
import {useChart} from "../hooks/useChart";
import {usePlotDimensions} from "../hooks/usePlotDimensions";
import type {BaseAxis, SeriesStyle} from "../axes/axes";
import type {TooltipData} from "../hooks/useTooltip";
import {BaseAxisRange} from "../axes/BaseAxisRange";
import {withAlpha} from "../styling/canvasStyle";

/**
 * The properties of the {@link Tooltip}
 */
export interface Props {
    /** whether the tooltip is shown when the mouse is over a series */
    visible: boolean
    /** the style of the tooltip's box */
    style?: Partial<TooltipStyle>
    /** the tooltip content (e.g. a `<ScatterPlotTooltipContent>`) */
    children: JSX.Element
}

/**
 * Tooltip component triggered by mouse-over-series events. When mounted, the tooltip component
 * registers a mouse-over handler with the {@link useMouse} hook using the
 * {@link UseMouseValues.registerMouseOverHandler} function. The handler renders the tooltip
 * by adding it as an absolutely-positioned HTML overlay on top of the chart's canvas. However,
 * to remain general, this {@link Tooltip} also uses the {@link useTooltip}'s
 * {@link UseTooltipValues.tooltipContentProvider} to render the actual content of the tooltip.
 * The content provider is given the series' name on which the mouse-over event occurred, the plot
 * time associated with mouse-over event, the tooltip data (the series, and the plot's metadata
 * about the element under the mouse), the mouse coordinates, and the ID of the content provider
 * for the kind of element under the mouse (when the plot has several). The plot (for example {@link ScatterPlot}) is responsible for rendering the
 * tooltip, and it registers this tooltip-content provider with the {@link useTooltip} hook.
 *
 * The {@link useChart} hook allows the plots and this tooltip to register methods needed by their siblings.
 *
 * ## on mount
 * 1. The plot (for example {@link ScatterPlot}) hit-tests the mouse position against its drawn
 *    geometry on `mousemove` (canvas has no per-shape events), and when the mouse is over a
 *    series, calls the mouse-over event handler registered by the {@link Tooltip} via the
 *    {@link useMouse} hook.
 * 2. The plot (for example {@link ScatterPlot}) registers the tooltip-content provider with the {@link useTooltip}
 *    hook using the {@link UseTooltipValues.registerTooltipContentProvider} function.
 * 3. {@link Tooltip} registers the handler for mouse-over events. The handler accepts the series
 *    name, plot time, and time-series associated with the mouse-over event, and returns the tooltip
 *    dimensions. In order to create/render the tooltip, it uses the {@link UseTooltipValues.tooltipContentProvider}
 *    function that was registered via the {@link useTooltip} hook.
 *
 * ## on mouse-over event
 * When the plot's (for example {@link ScatterPlot}) `mousemove` hit-test finds a hovered series, the plot calls
 * this {@link Tooltip}'s mouse-over handler, which creates the tooltip's HTML background element, and calls the
 * {@link UseTooltipValues.tooltipContentProvider} registered by the plot to render the tooltip content, and get
 * the tooltip size. Content-provider components append their own HTML content as siblings of the background
 * element, within the same overlay wrapper (`canvas.parentElement`, set up by {@link Chart}), positioned using
 * the same coordinates.
 *
 * @param props The properties of the tooltip (i.e. visibility and style)
 * @return The tooltip content (the child), cloned with the tooltip's properties
 * @template D The type of the series' datum
 * @template S The type of the series style
 * @template TM The type of the tooltip metadata
 * @template AR The type of the axis range
 * @template A The type of the axis
 */
export function Tooltip<D, S extends SeriesStyle, TM, AR extends BaseAxisRange, A extends BaseAxis>(props: Props): JSX.Element {
    const {
        chartId,
        canvas,
        tooltip,
        mouse
    } = useChart<D, S, TM, AR, A>()

    const {
        tooltipContentProvider,
        setVisibilityState,
    } = tooltip

    const {margin, plotDimensions} = usePlotDimensions()

    const {
        visible,
        style,
        children
    } = props

    const {
        registerMouseOverHandler,
        unregisterMouseOverHandler,
        registerMouseLeaveHandler,
        unregisterMouseLeaveHandler
    } = mouse

    const tooltipStyle = useMemo(() => ({...defaultTooltipStyle, ...style}), [style])

    useEffect(
        () => {
            // let the tooltip context know whether the tooltip is visible
            setVisibilityState(visible)

            const handlerId = `tooltip-${chartId}`
            // the overlay div Chart.tsx wraps the <canvas> in -- the tooltip background and its
            // content are appended here as absolutely-positioned HTML, replacing the old SVG
            // <rect>/<text> elements appended directly to the <svg> root
            const overlayContainer = canvas?.parentElement ?? null

            if (visible && overlayContainer) {
                const contentProvider = tooltipContentProvider()
                if (contentProvider) {
                    // register this tooltip's mouse-over event handler with the useCharts hook
                    // so that the plots can call it when mouse-enter events are triggered (for
                    // example, a mouse-over a time-series in the plot).
                    registerMouseOverHandler(
                        handlerId,
                        (
                            (
                                seriesName: string,
                                time: number,
                                tooltipData: TooltipData<D, TM>,
                                mouseCoords: [x: number, y: number],
                                providerId?: string
                            ) => {
                                // this handler fires on every mousemove over a hovered series (not
                                // just once on entry), so the tooltip keeps tracking the mouse as
                                // it moves -- remove the previous background element first so
                                // repeated calls update a single element instead of stacking a new
                                // one on the page every time.
                                removeTooltip(overlayContainer)

                                // create the rounded-rectangle background for the tooltip. This
                                // replaces the old SVG <rect>; border-radius/background/border are
                                // now plain CSS instead of SVG attributes. Background and border
                                // opacity are baked into their colors via `withAlpha` since CSS
                                // (unlike SVG's independent fill-opacity/stroke-opacity) has only
                                // one `opacity` for a whole element, which would also fade the
                                // content appended inside it.
                                const rect = document.createElement('div')
                                rect.id = `r${time}-${seriesName}-${chartId}`
                                rect.className = 'tooltip'
                                rect.style.position = 'absolute'
                                rect.style.pointerEvents = 'none'
                                rect.style.boxSizing = 'border-box'
                                rect.style.borderRadius = `${tooltipStyle.borderRadius}px`
                                rect.style.backgroundColor = withAlpha(tooltipStyle.backgroundColor, tooltipStyle.backgroundOpacity)
                                rect.style.border = `${tooltipStyle.borderWidth}px solid ${withAlpha(tooltipStyle.borderColor, tooltipStyle.borderOpacity)}`
                                overlayContainer.appendChild(rect)

                                // call the callback to add the content
                                const {
                                    x,
                                    y,
                                    contentWidth,
                                    contentHeight
                                } = contentProvider(seriesName, time, tooltipData, mouseCoords, providerId)

                                // set the position, width, and height of the tooltip rect based on the content's width and height and the padding
                                rect.style.left = `${x}px`
                                rect.style.top = `${y}px`
                                rect.style.width = `${contentWidth + tooltipStyle.paddingLeft + tooltipStyle.paddingRight}px`
                                rect.style.height = `${contentHeight + tooltipStyle.paddingTop + tooltipStyle.paddingBottom}px`
                            }
                        )
                    )

                    registerMouseLeaveHandler(handlerId, () => removeTooltip(overlayContainer))
                }
            }
            return () => {
                unregisterMouseOverHandler(handlerId)
                unregisterMouseLeaveHandler(handlerId)
                // overlayContainer may be null here if canvas became unavailable before this
                // cleanup ran (e.g. during unmount) -- fall back to document so a tooltip this
                // instance created still gets removed even in that edge case (matches H10's
                // "always clean up on unmount" guarantee); every other call site above always has
                // a real, non-null overlayContainer, so this is the only place this fallback fires
                removeTooltip(overlayContainer ?? document)
            }
        },
        [
            chartId, canvas, margin, plotDimensions, registerMouseOverHandler,
            tooltipContentProvider, tooltipStyle, unregisterMouseOverHandler, visible,
            registerMouseLeaveHandler, unregisterMouseLeaveHandler, setVisibilityState
        ]
    )

    return <>{cloneElement(children, props)}</>
}
