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

export type UseTooltipValues<D, M> = {
    /**
     * Registers the provider of the tooltip content (generally this will be registered by the plot).
     * When this function is called again, overwrites the previously registered provider with the
     * one specified. This function can be called repeatedly.
     * @param provider The function that provides the content when called.
     */
    registerTooltipContentProvider: (
        provider: (
            seriesName: string,
            time: number,
            tooltipData: TooltipData<D, M>,
            mouseCoords: [x: number, y: number]
        ) => TooltipDimensions) => void
    /**
     * @return The registered function that provides the tooltip content. If no function has been
     * registered, then returns `undefined`.
     */
    tooltipContentProvider: () =>
        ((seriesName: string, time: number, tooltipData: TooltipData<D, M>, mouseCoords: [x: number, y: number]) => TooltipDimensions) |
        undefined

    setVisibilityState: (visible: boolean) => void
    visibilityState: boolean
}

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

export default function TooltipProvider<D, M>(props: Props): JSX.Element {
    const {children} = props

    const tooltipContentProviderRef = useRef<((seriesName: string, time: number, tooltipData: TooltipData<D, M>, mouseCoords: [x: number, y: number]) => TooltipDimensions) | undefined>(undefined)
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