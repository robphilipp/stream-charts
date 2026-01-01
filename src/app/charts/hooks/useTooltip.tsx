import {Series} from "../plots/plot";
import {TooltipDimensions} from "../tooltips/tooltipUtils";
import {createContext, JSX, useContext, useRef} from "react";

/**
 * No operation function for use when a default function is needed
 */
const noop = () => {
    /* empty on purpose */
}

/**
 * Base interface for tooltip data that is passed through to the tooltip content provider
 */
export interface TooltipData<D, M> {
    series: Series<D>
    metadata: M
}

/**
 * A higher-order function that returns a function that provides the tooltip content or
 * `undefined` if no tooltip content is available.
 * @return The tooltip content, or `undefined` if no tooltip content is available.
 * @param seriesName The name of the series for which the tooltip content is being provided
 * @param time The time (x-value) for which the tooltip content is being provided
 * @param tooltipData The tooltip data
 * @param mouseCoords The mouse coordinates over which the mouse is hovering
 * @param providerId An optional ID of the tooltip content provider.
 */
type TooltipContentProvider<D, M> =
    (seriesName: string, time: number, tooltipData: TooltipData<D, M>, mouseCoords: [x: number, y: number], providerId?: string) => TooltipDimensions
// type TooltipContentProvider<D, M> =
//     (seriesName: string, time: number, tooltipData: TooltipData<D, M>, mouseCoords: [x: number, y: number]) => TooltipDimensions

/**
 * The functions and values exposed through the {@link useTooltip} react hook
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

    setVisibilityState: (visible: boolean) => void
    visibilityState: boolean
}

/**
 * The default values for the {@link UseTooltipValues}
 */
export const defaultTooltipValues = (): UseTooltipValues<any, any> => ({
    registerTooltipContentProvider: noop,
    tooltipContentProvider: () => undefined,
    setVisibilityState: noop,
    visibilityState: false,
})

const TooltipContext = createContext<UseTooltipValues<any, any>>(defaultTooltipValues())

type Props = {
    children: JSX.Element | Array<JSX.Element>
}

/**
 * The tooltip context provider allows registering and retrieving tooltip content providers. When
 * a tooltip content provider is registered with a provider ID, then it must be retrieved with that
 * same provider ID. This allows a chart to have multiple tooltip content providers, depending on
 * the context or types of objects being moused over. When a tooltip content provider is registered
 * without a provider ID, then the default provider ID is used.
 * @param props The properties holding the children
 * @constructor
 * @return A JSX element containing the children
 */
export default function TooltipProvider<D, M>(props: Props): JSX.Element {
    const {children} = props

    const tooltipContentProviderRef = useRef<TooltipContentProvider<D, M>>(undefined)
    const visibilityStateRef = useRef<boolean>(false)

    return <TooltipContext.Provider
        value={{
            registerTooltipContentProvider: provider => tooltipContentProviderRef.current = provider,
            tooltipContentProvider: () => tooltipContentProviderRef.current,
            setVisibilityState: (visible: boolean) => visibilityStateRef.current = visible,
            visibilityState: visibilityStateRef.current
        }}
    >
        {children}
    </TooltipContext.Provider>
}

/**
 * React hook that sets up the React context for the mouse values.
 * @return The {@link UseTooltipValues} held in the React context.
 */
export function useTooltip<D, M>(): UseTooltipValues<D, M> {
    const context = useContext<UseTooltipValues<D, M>>(TooltipContext)
    const {registerTooltipContentProvider} = context
    if (registerTooltipContentProvider === undefined || registerTooltipContentProvider === null) {
        throw new Error("useTooltip can only be used when the parent is a <TooltipProvider/>")
    }
    return context
}