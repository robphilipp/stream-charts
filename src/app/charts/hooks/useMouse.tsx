import {createContext, JSX, useContext, useRef} from "react";
import {TooltipData} from "./useTooltip";

/**
 * No operation function for use when a default function is needed
 */
const noop = () => {
    /* empty on purpose */
}

export type UseMouseValues<D, TM> = {
    /**
     * Adds a mouse-over-series handler with the specified ID and handler function
     * @param handlerId The handler ID
     * @param handler The handler function called when a mouse-over-series event occurs.
     * The handler function is handed the series name, the time (x-value), the actual
     * series, and the mouse coordinates over which the mouse has moved over.
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
     * Attempts to retrieve the mouse-over-series handler for the specified ID
     * @param handlerId The ID of the handler
     * @return The mouse-over-series handler for the ID, or `undefined` if not found
     */
    mouseOverHandlerFor: (handlerId: string, providerId?: string) =>
        ((seriesName: string, time: number, tooltipData: TooltipData<D, TM>, mouseCoords: [x: number, y: number], providerId?: string) => void) | undefined
    /**
     * Adds a mouse-leave-series handler with the specified ID and handler function
     * @param handlerId The handler ID
     * @param handler The handler function called when a mouse-leave-series event occurs
     * @return The handler ID
     */
    registerMouseLeaveHandler: (handlerId: string, handler: (seriesName: string) => void) => string
    /**
     * Removes the mouse-leave-series handler with the specified ID
     * @param handlerId The ID of the handler to remove
     */
    unregisterMouseLeaveHandler: (handlerId: string) => void
    /**
     * Attempts to retrieve the mouse-leave-series handler for the specified ID
     * @param handlerId The ID of the handler
     * @return The mouse-leave-series handler for the ID, or `undefined` if not found
     */
    mouseLeaveHandlerFor: (handlerId: string, providerId?: string) => ((seriesName: string, providerId?: string) => void) | undefined
}

export const defaultMouseValues = (): UseMouseValues<any, any> => ({
    registerMouseOverHandler: () => '',
    unregisterMouseOverHandler: noop,
    mouseOverHandlerFor: () => undefined,
    registerMouseLeaveHandler: () => '',
    unregisterMouseLeaveHandler: noop,
    mouseLeaveHandlerFor: () => undefined,
})

const MouseContext = createContext<UseMouseValues<any, any>>(defaultMouseValues())

type Props = {
    children: JSX.Element | Array<JSX.Element>
}

export default function MouseProvider<D, TM>(props: Props): JSX.Element {
    const {children} = props

    const mouseOverHandlersRef = useRef<Map<string, (seriesName: string, time: number, tooltipData: TooltipData<D, TM>, mouseCoords: [x: number, y: number], providerId?: string) => void>>(new Map())
    const mouseLeaveHandlersRef = useRef<Map<string, (seriesName: string, providerId?: string) => void>>(new Map())

    return <MouseContext.Provider
        value={{
            registerMouseOverHandler: (handlerId, handler) => {
                mouseOverHandlersRef.current.set(handlerId, handler)
                return handlerId
            },
            unregisterMouseOverHandler: handlerId => mouseOverHandlersRef.current.delete(handlerId),
            mouseOverHandlerFor: (handlerId, providerId) => {
                const handlerHoc = mouseOverHandlersRef.current.get(handlerId)
                if (handlerHoc !== undefined) {
                    return (seriesName: string, time: number, tooltipData: TooltipData<D, TM>, mouseCoords: [x: number, y: number])=> {
                        handlerHoc(seriesName, time, tooltipData, mouseCoords, providerId)
                    }
                }
                return undefined
            },

            registerMouseLeaveHandler: (handlerId, handler) => {
                mouseLeaveHandlersRef.current.set(handlerId, handler)
                return handlerId
            },
            unregisterMouseLeaveHandler: handlerId => mouseLeaveHandlersRef.current.delete(handlerId),
            mouseLeaveHandlerFor: (handlerId, providerId) => {
                const handlerHoc = mouseLeaveHandlersRef.current.get(handlerId)
                if (handlerHoc !== undefined) {
                    return (seriesName: string)=> {
                        handlerHoc(seriesName, providerId)
                    }
                }
                return undefined
            },
        }}
    >
        {children}
    </MouseContext.Provider>
}

/**
 * React hook that sets up the React context for the mouse values.
 * @return The {@link UseMouseValues} held in the React context.
 */
export function useMouse<D, TM>(): UseMouseValues<D, TM> {
    const context = useContext<UseMouseValues<D, TM>>(MouseContext)
    const {mouseOverHandlerFor} = context
    if (mouseOverHandlerFor === undefined || mouseOverHandlerFor === null) {
        throw new Error("useMouse can only be used when the parent is a <MouseProvider/>")
    }
    return context
}
