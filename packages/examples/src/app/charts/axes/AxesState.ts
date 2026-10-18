import type {BaseAxis} from "./axes";
import {Optional} from "result-fn";

/**
 * Holds the information to allow mapping axes IDs to the underlying axes objects (of either the
 * x-axes or the y-axes). These objects hold the axis ID, its location on the chart (i.e. left,
 * right, bottom, top), its type, and (for the axis types that extend `BaseAxis`) its scale and the
 * functions for updating and drawing it.
 * @typeParam A The type of the axes (must extend `BaseAxis`)
 */
export class AxesState<A extends BaseAxis> {
    readonly axes: Map<string, A>

    /**
     * Use {@link from} or {@link empty} to create an axes state
     * @param axes Mapping of the axes IDs to the axes
     */
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
     * Adds an axis to this axes state's map of axes (in place), and returns a new axes state holding
     * that same map (a new object, so that React sees the change). This is an internal state
     * management function. This should generally not be used. Instead, use the {@link UseAxesValues.addXAxis}
     * and {@link UseAxesValues.addYAxis} functions to add axes.
     * @param axis The axis to add
     * @param id The ID of the axis to add
     * @return An updated axes state that has the new axis
     * @see UseAxesValues.addXAxis
     * @see UseAxesValues.addYAxis
     */
    addAxis(axis: A, id: string): AxesState<A> {
        const updatedAxes = this.axes.set(id, axis)
        return new AxesState<A>(updatedAxes)
    }

    /**
     * Attempts to retrieve the axis for the specified ID.
     * @param axisId The unique ID of the axis, or `""` to request the default axis (the
     * convention used throughout this library wherever a series has no explicit axis
     * assignment -- see e.g. each plot component's own `axesFor` helper).
     * @return The axis matching `axisId`; the default axis (see {@link defaultAxis}) if
     * `axisId` is `""` and at least one axis exists; otherwise an empty `Optional`. A non-empty
     * `axisId` that doesn't match any axis is deliberately treated as "not found" rather than
     * silently substituting an unrelated axis -- that used to happen for *any* unmatched ID,
     * which masked stale/mistyped axis IDs as if they'd resolved correctly.
     */
    axisFor(axisId: string): Optional<A> {
        const axis = this.axes.get(axisId)
        if (axis === undefined && axisId === "" && this.axes.size >= 1) {
            return this.defaultAxis()
        }
        return Optional.ofNullable(axis)
    }

    /**
     * Returns the default axis: the first axis added
     * @return The default axis, or an empty `Optional` when there are no axes
     * @see axisDefaultId
     */
    defaultAxis(): Optional<A> {
        const axes = Array.from(this.axes.values())
        return axes.length > 0 ?
            Optional.of(axes[0]) :
            Optional.empty()
    }

    /**
     * @return An array holding the IDs of all the axes
     */
    axisIds(): Array<string> {
        return Array.from(this.axes.keys())
    }

    /**
     * @return The ID of the default axis (the first axis added), or an empty `Optional` when there
     * are no axes
     */
    axisDefaultId(): Optional<string> {
        const ids = Array.from(this.axes.keys())
        return ids.length > 0 ?
            Optional.of(ids[0]) :
            Optional.empty()
    }
}
