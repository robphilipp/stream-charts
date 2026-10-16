import {type JSX, useCallback, useRef, useState} from "react";
import {type TooltipContentProvider, TooltipContext, type UseTooltipValues} from "./useTooltip";

type Props = {
    children: JSX.Element | Array<JSX.Element>
}

/**
 * The tooltip context provider allows registering and retrieving the chart's tooltip content
 * provider (there's one at a time: registering another replaces it -- a content provider that
 * handles several kinds of elements is handed the provider ID of the element under the mouse
 * instead), and holds whether the tooltip is visible.
 * @param props The properties holding the children
 * @return A JSX element containing the children
 * @template D The type of the data object for the series
 * @template M The type of the metadata object for the series
 */
export default function TooltipProvider<D, M>(props: Props): JSX.Element {
    const {children} = props

    const tooltipContentProviderRef = useRef<TooltipContentProvider<D, M>>(undefined)
    const [visibilityState, setVisibilityState] = useState<boolean>(false)
    const visibility = useCallback((visible: boolean) => setVisibilityState(visible), [])

    // the context's `value` prop is typed as `unknown` (see `TooltipContext` in `useTooltip.tsx`),
    // so the object literal needs its own explicit type here to give the handler functions below
    // their parameter types -- otherwise they'd fall back to implicit `any`
    const value: UseTooltipValues<D, M> = {
        registerTooltipContentProvider: provider => tooltipContentProviderRef.current = provider,
        tooltipContentProvider: () => tooltipContentProviderRef.current,
        setVisibilityState: (visible: boolean) => visibility(visible),
        visibilityState: visibilityState
    }

    return <TooltipContext.Provider value={value}>
        {children}
    </TooltipContext.Provider>
}