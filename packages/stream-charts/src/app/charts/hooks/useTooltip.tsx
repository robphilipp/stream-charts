import type {Series} from "../plots/plot";
import {createContext, useContext} from "react";

/**
 * Base interface for tooltip data that is passed through to the tooltip content provider
 * @template D The type of the data object for the series
 * @template M The type of the metadata object for the series
 */
export interface TooltipData<D, M> {
    series: Series<D>
    metadata: M
}

/**
 * A function that provides (shows) the tooltip content for the element under the mouse (see
 * {@link TooltipContent}, which registers one)
 * @param seriesName The name of the series for which the tooltip content is being provided
 * @param time The time (x-value) for which the tooltip content is being provided
 * @param tooltipData The tooltip data
 * @param mouseCoords The mouse coordinates over which the mouse is hovering
 * @param providerId An optional ID of the tooltip content provider.
 * @template D The type of the data object for the series
 * @template M The type of the metadata object for the series
 */
export type TooltipContentProvider<D, M> =
    (seriesName: string, time: number, tooltipData: TooltipData<D, M>, mouseCoords: [x: number, y: number], providerId?: string) => void

/**
 * The functions and values exposed through the `useTooltip` react hook
 * @template D The type of the data object for the series
 * @template M The type of the metadata object for the series
 */
export type UseTooltipValues<D, M> = {
    /**
     * Registers the provider of the tooltip content (generally the plot will register this).
     * When this function is called again, overwrites the previously registered provider with the
     * one specified. This function can be called repeatedly.
     * @param provider The function that provides the content when called.
     */
    registerTooltipContentProvider: (provider: TooltipContentProvider<D, M>) => void

    /**
     * @return The registered function that provides the tooltip content. If no function has been
     * registered, then returns `undefined`.
     */
    tooltipContentProvider: () => (TooltipContentProvider<D, M> | undefined)

    /**
     * Callback that sets the visibility state of the tooltip. This is used to control whether the tooltip is
     * visible or not.
     * @param visible Whether the tooltip should be visible or not.
     */
    setVisibilityState: (visible: boolean) => void

    /**
     * @return Whether the tooltip is currently visible or not.
     */
    visibilityState: boolean
}

// the context is generic over the same type parameters as `UseTooltipValues`, but a context
// object can't itself carry unbound generics -- `useTooltip` below casts it back to the caller's
// concrete types, which is safe because `<InteractionProvider/>` is what actually supplies the value
export const TooltipContext = createContext<unknown>(undefined)

/**
 * React hook for registering, and retrieving, the chart's tooltip content provider, and for the
 * tooltip's visibility. Must be used within a `<Chart>`.
 * @return The {@link UseTooltipValues} held in the React context.
 * @throws Error when used outside a `<Chart>`
 * @template D The type of the data object for the series
 * @template M The type of the metadata object for the series
 */
export function useTooltip<D, M>(): UseTooltipValues<D, M> {
    const context = useContext(TooltipContext)
    if (context === undefined) {
        throw new Error("useTooltip can only be used within a <Chart/>")
    }
    return context as UseTooltipValues<D, M>
}