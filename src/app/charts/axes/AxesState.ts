import {BaseAxis} from "./axes";
import {Optional} from "result-fn";

/**
 * Holds the information to allow mapping axes names to the underlying axes objects.
 * These objects hold the axis ID, its location on the chart (i.e. left, right, bottom, upper)
 * and the underlying d3 selection objects for managing the axes. Axis objects that extend
 * the `BaseAxis` class may have additional properties.
 * @typeParam A The type of the axes (must extend `BaseAxis`)
 */
export class AxesState<A extends BaseAxis> {
    readonly axes: Map<string, A>

    private constructor(axes: Map<string, A>) {
        this.axes = axes
    }

    /**
     * Creates a new axes state from the specified map of axes.
     * @param axes Mapping of the axes ID's to the axes.
     * @return A new axes-state object.
     */
    static from<A extends BaseAxis>(axes: Map<string, A>): AxesState<A> {
        return new AxesState<A>(axes)
    }

    /**
     * Creates an empty axes-state object.
     * @return A new axes-state object.
     */
    static empty<A extends BaseAxis>(): AxesState<A> {
        return new AxesState<A>(new Map<string, A>())
    }

    /**
     * @return `true` if the axes state is empty, `false` otherwise.
     */
    isEmpty(): boolean {
        return this.axes.size === 0
    }

    /**
     * Creates a deep copy of the current axes state.
     * @return A deep copy of the current axes state.
     */
    copy(): AxesState<A> {
        return new AxesState<A>(
            new Map<string, A>(Array.from(this.axes.entries())
                .map(([id, axis]) => [id, {...axis}])
            )
        )
    }

    /**
     * Adds an axis to the current axis state and returns a new axis state. This is an internal state
     * management function. This should generally not be used. Instead, use the {@link UseChartValues.addXAxis}
     * and {@link UseChartValues.addYAxis} functions to add axes.
     * @param axis The axis to add
     * @param id The ID of the axis to add
     * @return An updated axes state that has the new axis
     * @see UseChartValues.addXAxis
     * @see UseChartValues.addYAxis
     */
    addAxis(axis: A, id: string): AxesState<A> {
        const updatedAxes = this.axes.set(id, axis)
        return new AxesState<A>(updatedAxes)
    }

    /**
     * Attempts to retrieve the x-axis for the specified ID
     * @param axisId The unique ID of the axis
     * @return The axis, or undefined if no axis with the specified ID is found
     */
    axisFor(axisId: string): Optional<A> {
        const axis = this.axes.get(axisId)
        // when there is no axis for the specified ID and there is at least
        // one axis, then just use that...it is the default axis
        if (axis === undefined && this.axes.size >= 1) {
            return Optional.of(Array.from(this.axes.values())[0])
        }
        return Optional.ofNullable(axis)
    }

    /**
     * Returns the default axis
     * @return The default axis
     * @see axisDefaultId
     */
    defaultAxis(): Optional<A> {
        const axes = Array.from(this.axes.values())
        return axes.length > 0 ?
            Optional.of(axes[0]) :
            Optional.empty()
    }

    /**
     * @return An array holding all existing the x-axis IDs
     */
    axisIds(): Array<string> {
        return Array.from(this.axes.keys())
    }

    /**
     * @return The default name of the x-axis (in case only on default axis was added)
     */
    axisDefaultId(): Optional<string> {
        const ids = Array.from(this.axes.keys())
        return ids.length > 0 ?
            Optional.of(ids[0]) :
            Optional.empty()
    }
}
