import {AxesState} from "../axes/AxesState";
import type {BaseAxis} from "../axes/axes";
import type {AxesAssignment} from "../plots/plot";
import {createContext, useContext} from "react";
import type {Dimensions} from "../styling/margins";
import {BaseAxisRange} from "../axes/BaseAxisRange";
import {AxisInterval} from "../axes/AxisInterval";
import {Optional} from "result-fn";

/**
 * The values exposed by the hook
 * @template AR The type of the axis range (e.g. {@link ContinuousAxisRange} or {@link OrdinalAxisRange})
 * @template A The axis type
 */
export type UseAxesValues<AR extends BaseAxisRange, A extends BaseAxis> = {
    /**
     * The x-axes state holds the currently set x-axes, manipulation and accessor functions
     */
    xAxesState: AxesState<A>
    /**
     * Adds an x-axis to the axes and updates the internal state
     * @param axis The axis to add
     * @param id The ID of the axis to add
     * @param range The initial axis range (start, end)
     */
    addXAxis: (axis: A, id: string, range?: AR) => void
    /**
     * The y-axes state holds the currently set y-axes, manipulation and accessor functions
     */
    yAxesState: AxesState<A>
    /**
     * Adds a y-axis to the axes and updates the internal state
     * @param axis The axis to add
     * @param id The ID of the axis to add
     * @param range The initial axis range (start, end)
     */
    addYAxis: (axis: A, id: string, range?: AR) => void
    /**
     * Sets the axis assigned to each series. This should contain **all** the series used in
     * the chart.
     * @param assignments The assignment of the series to their axes
     */
    setAxisAssignments: (assignments: Map<string, AxesAssignment>) => void
    /**
     * Retrieves the axes assigned to the specified series (the default x- and y-axes, when the
     * series has no assignment)
     * @param seriesName The name of the series
     * @return The axes assigned to the specified series
     */
    axisAssignmentsFor: (seriesName: string) => AxesAssignment
    /**
     * Sets the axis ranges specified in the input map (without dispatching them to the update
     * handlers -- see {@link updateAxisRanges} for that)
     * @param ranges A map holding the axis ID to the axis range
     */
    setAxesRanges: (ranges: Map<string, AR>) => void
    /**
     * Sets the axis range for the specified axis ID (without dispatching it to the update handlers)
     * @param axisId The ID of the axis for which to set the range
     * @param range The new axis range
     */
    setAxisRangeFor: (axisId: string, range: AR) => void
    /**
     * Retrieves the current axis range for the specified axis ID
     * @param axisId The ID of the axis for which to retrieve the range
     * @return The current axis range for the specified axis ID wrapped
     * in an {@link Optional}, or an empty {@link Optional} if the axis
     * ID is not found
     */
    axisRangeFor: (axisId: string) => Optional<AR>
    /**
     * Sets the domain (interval) of the specified axis' current range, leaving its original range
     * as it is (does nothing when the axis has no range yet; doesn't dispatch the change to the
     * update handlers)
     * @param axisId The ID of the axis for which to set the range
     * @param domain The new domain
     */
    setAxisIntervalFor: (axisId: string, domain: AxisInterval) => void
    /**
     * Sets the original axis bounds for the specified axis ID to the specified range (does nothing
     * when the axis has no range yet)
     * @param axisId The ID of the axis for which to set the range
     * @param range The new original range
     */
    setOriginalAxisIntervalFor: (axisId: string, range: AxisInterval) => void
    /**
     * Updates the ranges of the specified axes, and dispatches the updates to every registered
     * update handler (see {@link addAxesRangesUpdateHandler}) -- e.g. the axes, which redraw with
     * their new domains. Called when the ranges change because of a zoom action, a pan action, or
     * as new data is streamed in.
     * @param domains A `map(axis_id -> domain)` that associates the axis ID with the
     * current time range.
     */
    updateAxisRanges: (domains: Map<string, AR>) => void
    /**
     * Retrieves the current ranges of all the axes
     * @return A copy of the current axis ranges, as a map(axis_id, range)
     */
    axesRanges: () => Map<string, AR>
    /**
     * Re-applies the specified axis' stored range: dispatches it, unchanged, to the update handlers
     * (so that the axis redraws with it). Note that, despite its name, this does *not* restore the
     * axis' original range, and the `<AxesProvider>`'s implementation ignores `axisBounds`.
     * @param axisId The ID of the axis
     * @param [axisBounds] Unused
     */
    resetAxisIntervalFor: (axisId: string, axisBounds?: AxisInterval) => void
    /**
     * Sets the ranges of the axes in the specified map, and dispatches them to the update handlers
     * (the same as {@link updateAxisRanges}). Axes that aren't in the map are left as they are, so
     * calling this without a map changes nothing -- despite its name, it doesn't restore the axes'
     * original ranges.
     * @param [axesBounds] An optional map holds the new bounds for specified axes. The map
     * associates an axis ID with the new bounds.
     */
    resetAxesRanges: (axesBounds?: Map<string, AR>) => void
    /**
     * Callback when the time range changes.
     * @param times The times (start, end) times for each axis in the plot. The `times` argument is a
     * map(axis_id -> (start, end)). Where start and end refer to the time-range for the
     * axis.
     * @return void
     */
    onUpdateAxesInterval?: (times: Map<string, AxisInterval>) => void
    /**
     * Adds a handler for when the axes are updated. An axis domain/range could change because of a zoom action,
     * a pan action, or as new data is streamed in.
     *
     * Throws if `handlerId` is already registered, rather than silently replacing or ignoring the
     * new one -- a custom axis/plot component that could ever remount (not just re-render) with
     * the same `handlerId` (e.g. one derived from a stable chart/axis ID) must call
     * {@link removeAxesRangesUpdateHandler} in its own unmount cleanup before this would ever be
     * called again for that ID, or the remount will throw here. See {@link ContinuousAxis}/
     * {@link OrdinalAxis} for the reference pattern: a `useEffect` whose only job is calling
     * `removeAxesRangesUpdateHandler` on unmount, kept separate from whatever other effect(s)
     * register the handler.
     * @param handlerId The unique ID of the handler to register/add
     * @param handler The handler function that accepts a map of updates and a plot dimension
     */
    addAxesRangesUpdateHandler: (handlerId: string, handler: (updates: Map<string, AR>, plotDim: Dimensions) => void) => void
    /**
     * Removes the axis-update handler with the specified ID
     * @param handlerId The ID of the handler to remove
     */
    removeAxesRangesUpdateHandler: (handlerId: string) => void
}

// the context is generic over the same type parameters as `UseAxesValues`, but a context
// object can't itself carry unbound generics -- `useAxes` below casts it back to the caller's
// concrete types, which is safe because `<AxesProvider/>` is what actually supplies the value
//
// IMPORTANT: as with `ChartContext` (see its identical note in useChart.tsx), this is NOT
// statically enforced across the component tree -- each consumer casts to its own hardcoded
// AR/A, independent of whatever `<AxesProvider<AR, A>>` ancestor actually supplied. A mismatched
// axis-range/axis kind only fails at runtime, not at compile time.
export const AxesContext = createContext<unknown>(undefined)

/**
 * React hook for the chart's axes: their state, ranges, and the functions for updating them.
 * Must be used within an {@link AxesProvider} (i.e. within a `<Chart>`).
 * @return The {@link UseAxesValues} held in the React context.
 * @throws Error when used outside an `<AxesProvider>`
 * @template AR The type of the axis range (e.g. {@link ContinuousAxisRange} or {@link OrdinalAxisRange})
 * @template A The axis type
 */
export function useAxes<AR extends BaseAxisRange, A extends BaseAxis>(): UseAxesValues<AR, A> {
    const context = useContext(AxesContext)
    if (context === undefined) {
        throw new Error("useAxes can only be used when the parent is a <AxesProvider/>")
    }
    return context as UseAxesValues<AR, A>
}
