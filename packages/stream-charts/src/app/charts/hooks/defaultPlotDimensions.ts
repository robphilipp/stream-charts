import type {Margin} from "../styling/margins";
import type {UsePlotDimensionsValues} from "./usePlotDimensions";

/**
 * No operation function for use when a default function is needed
 */
const noop = () => {
    /* empty on purpose */
}

/**
 * The default values for the {@link UsePlotDimensionsValues}: zero-sized plot dimensions, the
 * {@link defaultMargin}, and no-op functions
 * @return The default plot-dimension values
 */
export const defaultPlotDimensions = (): UsePlotDimensionsValues => ({
    plotDimensions: {width: 0, height: 0},
    margin: defaultMargin,
    updateDimensions: noop,
    registerPlotDimensionChangeHandler: () => "",
    unregisterPlotDimensionChangeHandler: noop
})

/**
 * The default margins between the edges of the chart and the plot area
 */
export const defaultMargin: Margin = {top: 30, right: 20, bottom: 30, left: 50}
