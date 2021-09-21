import {BaseAxis} from "../axes";

export interface AxesState {
    /**
     * Attempts to retrieve the x-axis for the specified ID
     * @param axisId The unique ID of the axis
     * @return The axis, or undefined if no axis with the specified ID is found
     */
    readonly axisFor: (axisId: string) => BaseAxis | undefined
    /**
     * @return An array holding all existing the x-axis IDs
     */
    readonly axisIds: () => Array<string>
    /**
     * @return The default name of the x-axis (in case only on default axis was added)
     */
    readonly axisDefaultName: () => string
    /**
     * Mapping of the axis IDs to their axis objects
     */
    readonly axes: Map<string, BaseAxis>
}

/**
 * @return a new, empty {@link AxesState}
 */
export function createAxesState(): AxesState {
    return axesStateFrom(new Map<string, BaseAxis>())
}

/**
 * Adds an axis to the current axis state and returns a new axis state. This is an internal state
 * management function. This should generally not be used. Instead use the {@link UseChartValues.addXAxis}
 * and {@link UseChartValues.addYAxis} functions to add axes.
 * @param axesState The current axes state
 * @param axis The axis to add
 * @param id The ID of the axis to add
 * @return An updated axes state that has the new axis
 * @see UseChartValues.addXAxis
 * @see UseChartValues.addYAxis
 */
export function addAxisTo(axesState: AxesState, axis: BaseAxis, id: string): AxesState {
    const updatedAxes = axesState.axes.set(id, axis)
    return axesStateFrom(updatedAxes)
}

/**
 * Calculates the axes-state from the specified map. The map associates the axis ID
 * to the each axis
 * @param axes The map associating the axes IDs to their respective axes
 * @return An {@link AxesState}
 */
function axesStateFrom(axes: Map<string, BaseAxis>): AxesState {
    return {
        axisFor: id => {
            const axis = axes.get(id)
            // when there is no axis for the specified ID and there is at least
            // one axis, then just use that...it is the default axis
            if (axis === undefined && axes.size >= 1) {
                return Array.from(axes.values())[0]
            }
            return axis
        },
        axisIds: () => Array.from(axes.keys()),
        axisDefaultName: () => Array.from(axes.keys())[0],
        axes
    }
}
