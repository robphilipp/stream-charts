import {createContext, useContext} from "react";
import type {TooltipData} from "./useTooltip";

/**
 * Called when the mouse moves over a series (e.g. to show the tooltip)
 * @param seriesName The name of the series under the mouse
 * @param time The time (x-value) under the mouse
 * @param tooltipData The data for the tooltip (the series, and the plot's metadata about it)
 * @param mouseCoords The mouse coordinates
 * @param [providerId] The ID of the tooltip content provider to use (e.g. for a plot whose
 * elements have different tooltips)
 */
export type TooltipMouseOverHandlerFn<D, TM> = (
    seriesName: string,
    time: number,
    tooltipData: TooltipData<D, TM>,
    mouseCoords: [x: number, y: number],
    providerId?: string
) => void

/**
 * Called when the mouse leaves a series (e.g. to hide the tooltip)
 * @param seriesName The name of the series the mouse left
 */
export type TooltipMouseLeaveHandlerFn = (seriesName: string) => void

/**
 * Type representing the values exposed through the {@link useMouse} react hook.
 * @template D The type of the data object for the series
 * @template TM The type of the metadata object for the series
 */
export type UseMouseValues<D, TM> = {
    /**
     * Adds a mouse-over-series handler with the specified ID and handler function (replacing any
     * handler already registered with that ID)
     * @param handlerId The handler ID
     * @param handler The handler function called when a mouse-over-series event occurs.
     * The handler function is handed the series name, the time (x-value), the tooltip data (the
     * series and its metadata), and the mouse coordinates.
     * @return The handler ID.
     */
    registerMouseOverHandler: (
        handlerId: string,
        handler: (seriesName: string, time: number, tooltipData: TooltipData<D, TM>, mouseCoords: [x: number, y: number]) => void
    ) => string
    /**
     * Removes the mouse-over-series handler with the specified ID
     * @param handlerId The ID of the handler to remove
     */
    unregisterMouseOverHandler: (handlerId: string) => void
    /**
     * Retrieves the mouse-over-series handler a plot calls when the mouse is over one of its
     * series: it sets the hovered series (see {@link useHoveredSeries}), and calls *every*
     * registered mouse-over-series handler, handing each the specified provider ID. (The
     * `handlerId` is accepted, but unused.)
     * @param handlerId The ID of the handler (unused)
     * @param [providerId] The ID of the tooltip content provider handed to the handlers
     * @return The mouse-over-series handler
     */
    mouseOverHandlerFor: (handlerId: string, providerId?: string) => TooltipMouseOverHandlerFn<D, TM>
    /**
     * Adds a mouse-leave-series handler with the specified ID and handler function (replacing any
     * handler already registered with that ID)
     * @param handlerId The handler ID
     * @param handler The handler function called when a mouse-leave-series event occurs
     * @return The handler ID
     */
    registerMouseLeaveHandler: (handlerId: string, handler: TooltipMouseLeaveHandlerFn) => string
    /**
     * Removes the mouse-leave-series handler with the specified ID
     * @param handlerId The ID of the handler to remove
     */
    unregisterMouseLeaveHandler: (handlerId: string) => void
    /**
     * Retrieves the mouse-leave-series handler a plot calls when the mouse leaves one of its
     * series: it clears the hovered series, and calls *every* registered mouse-leave-series
     * handler, handing each the specified provider ID. (The `handlerId` is accepted, but unused.)
     * @param handlerId The ID of the handler (unused)
     * @param [providerId] The ID of the tooltip content provider handed to the handlers
     * @return The mouse-leave-series handler
     */
    mouseLeaveHandlerFor: (handlerId: string, providerId?: string) => ((seriesName: string, providerId?: string) => void)
}

// the context is generic over the same type parameters as `UseMouseValues`, but a context
// object can't itself carry unbound generics -- `useMouse` below casts it back to the caller's
// concrete types, which is safe because `<InteractionProvider/>` is what actually supplies the value
export const MouseContext = createContext<unknown>(undefined)

/**
 * React hook for registering, and retrieving, the chart's mouse-over-series and
 * mouse-leave-series handlers. Must be used within a `<Chart>`.
 * @return The {@link UseMouseValues} held in the React context.
 * @throws Error when used outside a `<Chart>`
 * @template D The type of the data object for the series
 * @template TM The type of the metadata object for the series
 */
export function useMouse<D, TM>(): UseMouseValues<D, TM> {
    const context = useContext(MouseContext)
    if (context === undefined) {
        throw new Error("useMouse can only be used within a <Chart/>")
    }
    return context as UseMouseValues<D, TM>
}
