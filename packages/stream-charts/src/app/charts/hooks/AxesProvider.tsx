import {AxisInterval} from "../axes/AxisInterval";
import {type JSX, useCallback, useMemo, useRef, useState} from "react";
import {BaseAxisRange} from "../axes/BaseAxisRange";
import type {BaseAxis} from "../axes/axes";
import {usePlotDimensions} from "./usePlotDimensions";
import {AxesState} from "../axes/AxesState";
import type {AxesAssignment} from "../plots/plot";
import type {Dimensions} from "../styling/margins";
import {Optional} from "result-fn";
import {AxesContext, type UseAxesValues} from "./useAxes";

export type Props = {
    /**
     * Callback when axes bounds change.
     * @param ranges The ranges (start, end) for each axis in the plot
     */
    onUpdateAxesInterval?: (ranges: Map<string, AxisInterval>) => void

    children: JSX.Element | Array<JSX.Element>
}
/**
 * The React context provider for the {@link UseAxesValues}
 * @param props The properties
 * @return The children wrapped in this provider
 * @template AR The type of the axis range (e.g. {@link ContinuousAxisRange} or {@link OrdinalAxisRange})
 * @template A The axis type
 */
export default function AxesProvider<AR extends BaseAxisRange, A extends BaseAxis>(props: Props): JSX.Element {
    const {onUpdateAxesInterval, children} = props

    const plotDimensions = usePlotDimensions()

    const [xAxesState, setXAxesState] = useState<AxesState<A>>(AxesState.empty<A>())
    const [yAxesState, setYAxesState] = useState<AxesState<A>>(AxesState.empty<A>())
    const axisAssignmentsRef = useRef<Map<string, AxesAssignment>>(new Map())
    const axesBoundsUpdateHandlersRef = useRef<Map<string, (updates: Map<string, AR>, plotDim: Dimensions) => void>>(new Map())
    const axesRangeRef = useRef<Map<string, AR>>(new Map())

    /**
     * Retrieves the x-axis and y-axis assignments for the specified series. If the series does not
     * have an assignment, then we assume it is using the default x- and y-axes.
     * @param seriesName The name of the series for which to retrieve the axes assignments
     * @return An {@link AxesAssignment} for the specified axes.
     */
    const axisAssignmentsFor = useCallback(
        (seriesName: string): AxesAssignment =>
            axisAssignmentsRef.current.get(seriesName) || {
                xAxis: xAxesState.axisDefaultId().getOrElse(""),
                yAxis: yAxesState.axisDefaultId().getOrElse("")
            },
        [xAxesState, yAxesState]
    )

    /**
     * Called when the domain/range is updated on one or more of the chart's axes (generally x-axes). Stores
     * the updated ranges, and in turn, dispatches the update to all the registered domain/range update
     * handlers (e.g. the axes, which redraw themselves with their new domain).
     * @param updates A map holding the axis ID to the updated axis time-range (i.e., map(axis_id, axis_time_range))
     */
    const updateAxisRanges = useCallback(
        (updates: Map<string, AR>): void => {
            // update the current time-ranges reference
            updates.forEach((range, id) => {
                axesRangeRef.current.set(id, range)
            })
            // dispatch the updates to all the registered handlers
            axesBoundsUpdateHandlersRef.current
                .forEach((handler,) => handler(updates, plotDimensions.plotDimensions))
        },
        [plotDimensions.plotDimensions]
    )

    /**
     * Sets the axis ranges specified in the input map (without dispatching them to the update handlers)
     * @param ranges The ranges to set
     */
    const setAxesRanges = useCallback(
        (ranges: Map<string, AR>): void => {
            ranges.forEach((range, id) => {
                axesRangeRef.current.set(id, range)
            })
        },
        []
    )

    /**
     * Sets the axis range for the specified axis ID (without dispatching it to the update handlers)
     * @param axisId The axis ID
     * @param range The range to set
     */
    const setAxisRangeFor = useCallback(
        (axisId: string, range: AR): void => {
            axesRangeRef.current.set(axisId, range)
        },
        []
    )

    /**
     * Sets the axis bounds (the current range) for the specified axis ID. Note that this does not
     * change the original axis interval, doesn't dispatch the change to the update handlers, and
     * does nothing when the axis has no range yet.
     * @param axisId The axis ID
     * @param interval The interval
     */
    const setAxisIntervalFor = useCallback(
        (axisId: string, interval: AxisInterval): void => {
            Optional.ofNullable(axesRangeRef.current.get(axisId))
                .map(range => range.update(interval.start, interval.end) as AR)
                .ifPresent(updatedRange => axesRangeRef.current.set(axisId, updatedRange))
        },
        []
    )

    /**
     * Sets the original axis interval for the axis range (does nothing when the axis has no range yet)
     * @param axisId The axis ID
     * @param interval The interval to which to set the origin interval
     */
    const setOriginalAxisIntervalFor = useCallback(
        (axisId: string, interval: AxisInterval): void => {
            Optional.ofNullable(axesRangeRef.current.get(axisId))
                .map(range => range.updateOriginal(interval.start, interval.end) as AR)
                .ifPresent(updatedRange => axesRangeRef.current.set(axisId, updatedRange))
        },
        []
    )

    /**
     * Re-applies the specified axis' stored range: dispatches it, unchanged, to the update handlers
     * (so that the axis redraws with it). Note that this does *not* restore the axis' original
     * range. Does nothing when the axis has no range.
     * @param axisId The ID of the axis
     */
    const resetAxisIntervalFor = useCallback(
        (axisId: string): void => {
            Optional
                .ofNullable(axesRangeRef.current.get(axisId))
                .map(range => new Map<string, AR>([[axisId, range]]))
                .ifPresent(updates => updateAxisRanges(updates))
        },
        [updateAxisRanges]
    )

    /**
     * Sets the ranges of the axes in the specified map, and dispatches them to the update handlers
     * (the same as {@link updateAxisRanges}). Axes that aren't in the map are left as they are, so
     * the default (empty) map changes nothing.
     * @param [axesRanges=new Map()] An optional map holds bounds for specified axes. The map
     * associates an axis ID with the new bounds.
     */
    const resetAxesRanges = useCallback(
        (axesRanges: Map<string, AR> = new Map()): void => {
            updateAxisRanges(axesRanges)
        },
        [updateAxisRanges]
    )

    /**
     * Adds a handler to deal with updates to the bounds of the axes
     * @param handlerId the unique ID of the handler
     * @param handler The handler function that accepts a map of updates and a plot dimension
     * @return A map with all the handlers
     * @throws Error when a handler with the same ID is already registered
     */
    const addAxesRangesUpdateHandler = useCallback(
        (
            handlerId: string,
            handler: (updates: Map<string, AR>, plotDim: Dimensions) => void
        ): Map<string, (updates: Map<string, AR>, plotDim: Dimensions) => void> => {
            if (axesBoundsUpdateHandlersRef.current.has(handlerId)) {
                throw new Error(
                    `Handler with ID already exists, please remove it before adding it; ` +
                    `handler_id: ${handlerId}; ` +
                    `existing_handler_ids: [${Array.from(axesBoundsUpdateHandlersRef.current.keys()).join(", ")}]`
                )
            }
            return axesBoundsUpdateHandlersRef.current.set(handlerId, handler)
        },
        []
    )

    /**
     * Removes the axis-update handler with the specified ID
     * @param handlerId The ID of the handler to remove
     * @return `true` when the handler was registered (and has been removed); `false` otherwise
     */
    const removeAxesRangesUpdateHandler = useCallback(
        (handlerId: string): boolean => axesBoundsUpdateHandlersRef.current.delete(handlerId),
        []
    )

    /**
     * Adds an x-axis to the x-axes state (a new state object, so dependents re-render)
     * @param axis The axis to add
     * @param id The ID of the axis to add
     * @param [range] The initial axis range (when given, it's stored as the axis' range)
     */
    const addXAxis = useCallback(
        (axis: A, id: string, range?: AR): void => {
            setXAxesState(xAxesState.addAxis(axis, id))
            if (range !== undefined) {
                axesRangeRef.current.set(id, range)
            }
        },
        [xAxesState]
    )

    /**
     * Adds a y-axis to the y-axes state (a new state object, so dependents re-render)
     * @param axis The axis to add
     * @param id The ID of the axis to add
     * @param [range] The initial axis range (when given, it's stored as the axis' range)
     */
    const addYAxis = useCallback(
        (axis: A, id: string, range?: AR): void => {
            setYAxesState(yAxesState.addAxis(axis, id))
            if (range !== undefined) {
                axesRangeRef.current.set(id, range)
            }
        },
        [yAxesState]
    )

    /**
     * Sets the axes assigned to each series (replacing any earlier assignments)
     * @param assignments The assignment of the series to their axes
     */
    const setAxisAssignments = useCallback(
        (assignments: Map<string, AxesAssignment>): void => {
            axisAssignmentsRef.current = assignments
        },
        []
    )

    /**
     * @return A copy of the map of the axes' current ranges, by axis ID
     */
    const axesRanges = useCallback(
        (): Map<string, AR> => new Map<string, AR>(axesRangeRef.current),
        []
    )

    /**
     * Retrieves the current axis range for the specified axis ID
     * @param axisId The ID of the axis
     * @return The axis' range, or an empty `Optional` when the axis has no range
     */
    const axisRangeFor = useCallback(
        (axisId: string) => Optional.ofNullable(axesRangeRef.current.get(axisId)),
        []
    )

    // the context's `value` prop is typed as `unknown` (see `AxesContext` in `useAxes.tsx`), so
    // the object literal needs its own explicit type here to give the handler functions below
    // their parameter types -- otherwise they'd fall back to implicit `any`.
    //
    // Memoized so consumers relying on this context value's identity (e.g. a `useMemo`/effect
    // keyed on it) don't re-run on essentially every render of anything above this provider --
    // previously a fresh object literal every render, with every method inside it also a fresh
    // closure. This is the same class of bug already documented/worked around in ScatterPlot.tsx/
    // RasterPlot.tsx/OutlierPlot.tsx (their own comments on `axesRanges` never being memoized
    // here) -- those workarounds (refs populated imperatively instead of `useMemo([axesRanges])`)
    // are left in place; they're redundant once this is memoized, but harmless, and removing them
    // isn't part of this change.
    const value: UseAxesValues<AR, A> = useMemo(
        () => ({
            xAxesState,
            yAxesState,
            addXAxis,
            addYAxis,
            setAxisAssignments,
            axisAssignmentsFor,
            updateAxisRanges,
            axesRanges,
            axisRangeFor,
            setAxesRanges,
            setAxisRangeFor,
            setAxisIntervalFor,
            setOriginalAxisIntervalFor,
            resetAxesRanges,
            resetAxisIntervalFor,
            onUpdateAxesInterval,
            addAxesRangesUpdateHandler,
            removeAxesRangesUpdateHandler,
        }),
        [
            xAxesState, yAxesState,
            addXAxis, addYAxis,
            setAxisAssignments, axisAssignmentsFor,
            updateAxisRanges, axesRanges, axisRangeFor,
            setAxesRanges, setAxisRangeFor, setAxisIntervalFor, setOriginalAxisIntervalFor,
            resetAxesRanges, resetAxisIntervalFor,
            onUpdateAxesInterval,
            addAxesRangesUpdateHandler, removeAxesRangesUpdateHandler,
        ]
    )

    return <AxesContext.Provider value={value}>
        {children}
    </AxesContext.Provider>
}
