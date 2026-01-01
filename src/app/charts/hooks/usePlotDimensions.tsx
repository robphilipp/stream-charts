import {Dimensions, dimensionsNotEqual, Margin, plotDimensionsFrom} from "../styling/margins";
import {createContext, JSX, useContext, useEffect, useRef, useState} from "react";

/**
 * No operation function for use when a default function is needed
 */
const noop = () => {
    /* empty on purpose */
}

export const defaultMargin: Margin = {top: 30, right: 20, bottom: 30, left: 50}

export type PlotDimensionChangeHandler = (previousDimensions: Dimensions, newDimensions: Dimensions) => void

export type UsePlotDimensionsValues = {
    /**
     * The width and height (in pixels) of this chart
     */
    plotDimensions: Dimensions
    /**
     * The plot margins for the border of main G
     */
    margin: Margin
    /**
     * Update the plot dimensions (for example, on a window resize)
     * @param dimensions the new dimensions of the plot
     */
    updateDimensions: (dimensions: Dimensions) => void
    registerPlotDimensionChangeHandler: (handler: PlotDimensionChangeHandler) => string
    unregisterPlotDimensionChangeHandler: (handlerId: string) => void
}

export const defaultPlotDimensions = (): UsePlotDimensionsValues => ({
    plotDimensions: {width: 0, height: 0},
    margin: defaultMargin,
    updateDimensions: noop,
    registerPlotDimensionChangeHandler: () => "",
    unregisterPlotDimensionChangeHandler: noop
})

const PlotDimensionsContext = createContext<UsePlotDimensionsValues>(defaultPlotDimensions())

type Props = {
    containerDimensions: Dimensions
    margin: Margin
    children: JSX.Element | Array<JSX.Element>
}

export default function PlotDimensionsProvider(props: Props): JSX.Element {
    const {
        containerDimensions,
        margin,
        children
    } = props

    const [dimensions, setDimensions] = useState<Dimensions>(defaultPlotDimensions().plotDimensions)
    const plotDimensionChangeHandersRef = useRef<Map<string, PlotDimensionChangeHandler>>(new Map())

    // update the plot dimensions when the container size or margin change
    useEffect(
        () => {
            const newDimensions = plotDimensionsFrom(containerDimensions.width, containerDimensions.height, margin)
            setDimensions(prevDimensions => {
                if (dimensionsNotEqual(prevDimensions, newDimensions)) {
                    for(const handler of plotDimensionChangeHandersRef.current.values()) {
                        handler(prevDimensions, newDimensions)
                    }
                    return newDimensions
                }
                return prevDimensions
            })
        },
        [containerDimensions, margin]
    )

    function updateDimensions(newDimensions: Dimensions) {
        setDimensions(prevState => {
            for(const handler of plotDimensionChangeHandersRef.current.values()) {
                handler(prevState, newDimensions)
            }
            return newDimensions
        })
    }

    function registerPlotDimensionChangeHandler(handler: PlotDimensionChangeHandler) {
        const handlerId = crypto.randomUUID()
        plotDimensionChangeHandersRef.current.set(handlerId, handler)
        return handlerId
    }

    function unregisterPlotDimensionChangeHandler(handlerId: string): boolean {
        return plotDimensionChangeHandersRef.current.delete(handlerId)
    }

    return <PlotDimensionsContext.Provider
        value={{
            plotDimensions: dimensions,
            margin,
            updateDimensions,
            // updateDimensions: dimensions => setDimensions(dimensions),
            registerPlotDimensionChangeHandler,
            unregisterPlotDimensionChangeHandler
        }}
    >
        {children}
    </PlotDimensionsContext.Provider>
}

/**
 * React hook that sets up the React context for the plot-dimension values.
 * @return The {@link UsePlotDimensionsValues} held in the React context.
 */
export function usePlotDimensions(): UsePlotDimensionsValues {
    const context = useContext<UsePlotDimensionsValues>(PlotDimensionsContext)
    const {plotDimensions} = context
    if (plotDimensions === undefined || plotDimensions === null) {
        throw new Error("usePlotDimensions can only be used when the parent is a <PlotDimensionsProvider/>")
    }
    return context
}
