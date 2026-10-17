import {type JSX, useEffect, useMemo} from "react";
import {defaultTooltipStyle, type TooltipStyle} from "./tooltipUtils";
import {useChart} from "../hooks/useChart";
import type {BaseAxis, SeriesStyle} from "../axes/axes";
import type {TooltipData} from "../hooks/useTooltip";
import {BaseAxisRange} from "../axes/BaseAxisRange";
import {TooltipStyleContext} from "./useTooltipStyle";

/**
 * The properties of the {@link Tooltip}
 */
export interface Props {
    /** whether the tooltip is shown when the mouse is over one of the plot's elements */
    visible: boolean
    /** the style of the tooltip (its box and text); its content can override parts of it */
    style?: Partial<TooltipStyle>
    /** the tooltip's content (e.g. a `<ScatterPlotTooltipContent>`, or your own, built on `<TooltipContent>`) */
    children: JSX.Element
}

/**
 * Shows a tooltip when the mouse is over one of the plot's elements (a series, a point, a spike, a
 * bar, a band, and so on), while `visible` is `true`. What the tooltip shows is up to its content
 * (its child -- for example, a `<ScatterPlotTooltipContent>`), which is built on
 * {@link TooltipContent}.
 *
 * The plot hit-tests the mouse against what it drew, and calls the mouse-over handler this
 * component registers (see {@link useMouse}), which hands what the plot knows about the element
 * under the mouse to the content's tooltip-content provider (see {@link useTooltip}). The content
 * shows itself, and hides itself again when the mouse leaves the element.
 *
 * The content gets this tooltip's style (its `style` over the default tooltip style) through
 * {@link useTooltipStyle}, and can override parts of it.
 * @param props Whether the tooltip is shown, its style, and its content
 * @return The content, while the tooltip is shown
 * @template D The type of the series' datum
 * @template S The type of the series style
 * @template TM The type of the tooltip metadata
 * @template AR The type of the axis range
 * @template A The type of the axis
 */
export function Tooltip<D, S extends SeriesStyle, TM, AR extends BaseAxisRange, A extends BaseAxis>(props: Props): JSX.Element {
    const {visible, style, children} = props

    const {chartId, tooltip, mouse} = useChart<D, S, TM, AR, A>()
    const {tooltipContentProvider, setVisibilityState} = tooltip
    const {registerMouseOverHandler, unregisterMouseOverHandler} = mouse

    const tooltipStyle = useMemo<TooltipStyle>(() => ({...defaultTooltipStyle, ...style}), [style])

    useEffect(
        () => {
            // let the tooltip context know whether the tooltip is visible
            setVisibilityState(visible)
            if (!visible) return

            // hands the element under the mouse to the content's provider (looked up on each call,
            // so it's always the one the content registered most recently)
            const handlerId = `tooltip-${chartId}`
            registerMouseOverHandler(
                handlerId,
                (
                    seriesName: string,
                    time: number,
                    tooltipData: TooltipData<D, TM>,
                    mouseCoords: [x: number, y: number],
                    providerId?: string
                ) => tooltipContentProvider()?.(seriesName, time, tooltipData, mouseCoords, providerId)
            )
            return () => unregisterMouseOverHandler(handlerId)
        },
        [chartId, visible, tooltipContentProvider, setVisibilityState, registerMouseOverHandler, unregisterMouseOverHandler]
    )

    // (the content is only mounted while the tooltip is visible, so hiding the tooltip also hides
    // any content that's showing)
    return (
        <TooltipStyleContext.Provider value={tooltipStyle}>
            {visible ? children : null}
        </TooltipStyleContext.Provider>
    )
}
