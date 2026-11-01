import {type JSX, useMemo, useRef, useState} from "react";
import {MouseContext, type TooltipMouseLeaveHandlerFn, type TooltipMouseOverHandlerFn, type UseMouseValues} from "./useMouse";
import {type TooltipContentProvider, TooltipContext, type UseTooltipValues} from "./useTooltip";
import {HoveredSeriesContext, type HoveredSeriesValues} from "./useHoveredSeries";

type Props = {
    children: JSX.Element | Array<JSX.Element>
}

/**
 * Provides the chart's interactions: the mouse-over and mouse-leave handlers (see {@link useMouse}),
 * the tooltip's content provider and visibility (see {@link useTooltip}), and the hovered series
 * (see {@link useHoveredSeries}).
 *
 * The plots hit-test the mouse, and call the mouse handlers: a mouse-over sets the hovered series,
 * and then calls every registered mouse-over handler (e.g. the tooltip's); a mouse-leave clears the
 * hovered series, and calls every registered mouse-leave handler.
 *
 * The handler registries live in refs, so the mouse and tooltip values never change identity (the
 * tooltip's changes only with its visibility), and registering a handler never re-renders anything.
 * @param props The children
 * @return The children, wrapped in the interaction contexts
 * @template D The type of the data object for the series
 * @template TM The type of the metadata object for the series
 */
export default function InteractionProvider<D, TM>(props: Props): JSX.Element {
    const {children} = props

    const mouseOverHandlersRef = useRef<Map<string, TooltipMouseOverHandlerFn<D, TM>>>(new Map())
    const mouseLeaveHandlersRef = useRef<Map<string, (seriesName: string, providerId?: string) => void>>(new Map())
    const tooltipContentProviderRef = useRef<TooltipContentProvider<D, TM>>(undefined)

    const [hoveredSeriesName, setHoveredSeriesName] = useState<string | null>(null)
    const [tooltipVisible, setTooltipVisible] = useState<boolean>(false)

    const mouse = useMemo<UseMouseValues<D, TM>>(
        () => ({
            registerMouseOverHandler: (handlerId, handler) => {
                mouseOverHandlersRef.current.set(handlerId, handler)
                return handlerId
            },
            unregisterMouseOverHandler: handlerId => mouseOverHandlersRef.current.delete(handlerId),
            mouseOverHandlerFor: (_handlerId, providerId) =>
                (seriesName, time, tooltipData, mouseCoords) => {
                    setHoveredSeriesName(seriesName)
                    mouseOverHandlersRef.current.forEach(handler => handler(seriesName, time, tooltipData, mouseCoords, providerId))
                },
            registerMouseLeaveHandler: (handlerId, handler: TooltipMouseLeaveHandlerFn) => {
                mouseLeaveHandlersRef.current.set(handlerId, handler)
                return handlerId
            },
            unregisterMouseLeaveHandler: handlerId => mouseLeaveHandlersRef.current.delete(handlerId),
            mouseLeaveHandlerFor: (_handlerId, providerId) =>
                seriesName => {
                    setHoveredSeriesName(null)
                    mouseLeaveHandlersRef.current.forEach(handler => handler(seriesName, providerId))
                },
        }),
        []
    )

    const tooltip = useMemo<UseTooltipValues<D, TM>>(
        () => ({
            registerTooltipContentProvider: provider => {
                tooltipContentProviderRef.current = provider
            },
            tooltipContentProvider: () => tooltipContentProviderRef.current,
            setVisibilityState: setTooltipVisible,
            visibilityState: tooltipVisible,
        }),
        [tooltipVisible]
    )

    const hovered = useMemo<HoveredSeriesValues>(
        () => ({hoveredSeriesName, setHoveredSeriesName}),
        [hoveredSeriesName]
    )

    return (
        <MouseContext.Provider value={mouse}>
            <TooltipContext.Provider value={tooltip}>
                <HoveredSeriesContext.Provider value={hovered}>
                    {children}
                </HoveredSeriesContext.Provider>
            </TooltipContext.Provider>
        </MouseContext.Provider>
    )
}
