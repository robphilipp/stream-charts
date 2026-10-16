import {type Dimensions, type Margin} from "../styling/margins";
import {createContext, useContext} from "react";

/**
 * Called when the plot's dimensions change
 * @param previousDimensions The plot's dimensions before the change
 * @param newDimensions The plot's new dimensions
 */
export type PlotDimensionChangeHandler = (previousDimensions: Dimensions, newDimensions: Dimensions) => void

/**
 * The values exposed through the {@link usePlotDimensions} react hook
 */
export type UsePlotDimensionsValues = {
    /**
     * The width and height (in pixels) of the plot area (the chart without its margins)
     */
    plotDimensions: Dimensions
    /**
     * The margins between the edges of the chart and the plot area (where the axes are drawn)
     */
    margin: Margin
    /**
     * Update the plot dimensions (for example, on a window resize)
     * @param dimensions the new dimensions of the plot
     */
    updateDimensions: (dimensions: Dimensions) => void
    /**
     * Registers a handler that's called whenever the plot dimensions change
     * @param handler The handler
     * @return The handler's ID (for unregistering it)
     */
    registerPlotDimensionChangeHandler: (handler: PlotDimensionChangeHandler) => string
    /**
     * Unregisters the plot-dimension change handler with the specified ID
     * @param handlerId The handler's ID (from {@link registerPlotDimensionChangeHandler})
     */
    unregisterPlotDimensionChangeHandler: (handlerId: string) => void
}

export const PlotDimensionsContext = createContext<UsePlotDimensionsValues | undefined>(undefined)

/**
 * React hook for the plot's dimensions and margins. Must be used within a
 * {@link PlotDimensionsProvider} (i.e. within a `<Chart>`).
 * @return The {@link UsePlotDimensionsValues} held in the React context.
 * @throws Error when used outside a `<PlotDimensionsProvider>`
 */
export function usePlotDimensions(): UsePlotDimensionsValues {
    const context = useContext(PlotDimensionsContext)
    if (context === undefined) {
        throw new Error("usePlotDimensions can only be used when the parent is a <PlotDimensionsProvider/>")
    }
    return context
}
