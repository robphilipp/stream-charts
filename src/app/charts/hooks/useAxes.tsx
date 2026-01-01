import {AxesState} from "../axes/AxesState";
import {BaseAxis} from "../axes/axes";
import {AxesAssignment} from "../plots/plot";
import {createContext, JSX, useContext, useRef} from "react";
import {Dimensions} from "../styling/margins";
import {usePlotDimensions} from "./usePlotDimensions";
import {BaseAxisRange} from "../axes/BaseAxisRange";
import {AxisInterval} from "../axes/AxisInterval";
import {Optional} from "result-fn";

/**
 * No operation function for use when a default function is needed
 */
const noop = () => {
    /* empty on purpose */
}

/**
 * The values exposed by the hook
 * @template AR The type of the axis range (e.g. {@link ContinuousAxisRange} or {@link OrdinalAxisRange})
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
     * @param domain The initial axis range (start, end)
     */
    addXAxis: (axis: A, id: string, range?: AR) => void
    /**
     * The y-axes state holds the currently set x-axes, manipulation and accessor functions
     */
    yAxesState: AxesState<A>
    /**
     * Adds a y-axis to the axes and updates the internal state
     * @param axis The axis to add
     * @param id The ID of the axis to add
     * @param domain The initial axis range (start, end)
     */
    addYAxis: (axis: A, id: string, range?: AR) => void
    /**
     * Sets the axis assigned to each series. This should contain **all** the series used in
     * the chart.
     * @param assignments The assignment of the series to their axes
     */
    setAxisAssignments: (assignments: Map<string, AxesAssignment>) => void
    /**
     * Retrieves the axis assigned to the specified series
     * @return The axes assigned to the specified series
     */
    axisAssignmentsFor: (seriesName: string) => AxesAssignment
    /**
     * Sets the axis ranges specified in the input map
     * @param ranges A map holding the axis ID to the axis range
     */
    setAxesRanges: (ranges: Map<string, AR>) => void
    /**
     * Sets the axis range for the specified axis ID
     * @param axisId The ID of the axis for which to set the range
     * @param range The new axis range
     */
    setAxisRangeFor: (axisId: string, range: AR) => void
    /**
     * Retrieves the current axis range for the specified axis ID
     * @param axisId The ID of the axis for which to retrieve the range
     * @return The current axis range for the specified axis ID wrapped
     * in a n {@link Optional}, or an empty {@link Optional} if the axis
     * ID is not found
     */
    axisRangeFor: (axisId: string) => Optional<AR>
    /**
     * Sets the domain (interval) for the specified axis ID to the specified range
     * @param axisId The ID of the axis for which to set the range
     * @param domain The new domain as a `[start: number, end: number]` tuple
     */
    setAxisIntervalFor: (axisId: string, domain: AxisInterval) => void
    /**
     * Sets the original axis bounds for the specified axis ID to the specified range
     * @param axisId The ID of the axis for which to set the range
     * @param range The new range as a `[start, end]` tuple
     */
    setOriginalAxisIntervalFor: (axisId: string, range: AxisInterval) => void
    /**
     * Callback function that is called when the time ranges change. The time ranges could
     * change because of a zoom action, a pan action, or as new data is streamed in.
     * @param domains A `map(axis_id -> domain)` that associates the axis ID with the
     * current time range.
     */
    updateAxisRanges: (domains: Map<string, AR>) => void
    /**
     * Retrieves the current axis bounds for the specified axis ID
     * @return The current axis bounds as a map(axis_id, (start, end))
     */
    axesRanges: () => Map<string, AR>
    /**
     * Resets the axis bounds to its original bounds
     * @param axisId The ID of the axis
     * @param [axisBounds] An optional bounds that resets the original bounds
     */
    resetAxisIntervalFor: (axisId: string, axisBounds?: AxisInterval) => void
    /**
     * Resets all the axes bound to the original bounds
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

export const defaultAxesValues = (): UseAxesValues<any, any> => ({
    xAxesState: AxesState.empty(),
    yAxesState: AxesState.empty(),
    addXAxis: noop,
    addYAxis: noop,
    setAxisAssignments: noop,
    axisAssignmentsFor: () => ({xAxis: "", yAxis: ""}),
    updateAxisRanges: noop,
    axesRanges: () => new Map<string, any>(),
    axisRangeFor: () => Optional.empty(),
    setAxesRanges: noop,
    setAxisRangeFor: noop,
    setAxisIntervalFor: noop,
    setOriginalAxisIntervalFor: noop,
    resetAxisIntervalFor: noop,
    resetAxesRanges: noop,
    addAxesRangesUpdateHandler: () => noop,
    removeAxesRangesUpdateHandler: () => noop,
})

// the context for axes
const AxesContext = createContext<UseAxesValues<any, any>>(defaultAxesValues())

type Props = {
    /**y
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
 * @constructor
 */
export default function AxesProvider<AR extends BaseAxisRange, A extends BaseAxis>(props: Props): JSX.Element {
    const {onUpdateAxesInterval, children} = props

    const plotDimensions = usePlotDimensions()

    const xAxesStateRef = useRef<AxesState<A>>(AxesState.empty<A>())
    const yAxesStateRef = useRef<AxesState<A>>(AxesState.empty<A>())
    const axisAssignmentsRef = useRef<Map<string, AxesAssignment>>(new Map())
    const axesBoundsUpdateHandlersRef = useRef<Map<string, (updates: Map<string, AR>, plotDim: Dimensions) => void>>(new Map())
    const axesRangeRef = useRef<Map<string, AR>>(new Map())

    /**
     * Retrieves the x-axis and y-axis assignments for the specified series. If the axis does not have
     * an assignment, then we assume it is using the default x- and y-axes.
     * @param seriesName The name of the series for which to retrieve the axes assignments
     * @return An {@link AxesAssignment} for the specified axes.
     */
    function axisAssignmentsFor(seriesName: string): AxesAssignment {
        return axisAssignmentsRef.current.get(seriesName) || {
            xAxis: xAxesStateRef.current.axisDefaultId().getOrElse(""),
            yAxis: yAxesStateRef.current.axisDefaultId().getOrElse("")
        }
    }

    /**
     * Called when the domain/range is updated on one or more of the chart's axes (generally x-axes). In turn,
     * dispatches the update to all the internal domain/range update handlers.
     * @param updates A map holding the axis ID to the updated axis time-range (i.e., map(axis_id, axis_time_range))
     */
    function updateAxisRanges(updates: Map<string, AR>): void {
        // update the current time-ranges reference
        updates.forEach((range, id) => {
            axesRangeRef.current.set(id, range)
        })
        // dispatch the updates to all the registered handlers
        axesBoundsUpdateHandlersRef.current
            .forEach((handler, ) => handler(updates, plotDimensions.plotDimensions))
    }

    /**
     * Sets the axis ranges specified in the input map
     * @param ranges The ranges to set
     */
    function setAxesRanges(ranges: Map<string, AR>): void {
        ranges.forEach((range, id) => {
            axesRangeRef.current.set(id, range)
        })
    }

    /**
     * Sets the axis range for the specified axis ID
     * @param axisId The axis ID
     * @param range The range to set
     */
    function setAxisRangeFor(axisId: string, range: AR): void {
        axesRangeRef.current.set(axisId, range)
    }

    /**
     * Sets the axis bounds for the specified axis ID. Note that this does not
     * change the original axis interval
     * @param axisId The axis ID
     * @param interval The interval
     */
    function setAxisIntervalFor(axisId: string, interval: AxisInterval): void {
        Optional.ofNullable(axesRangeRef.current.get(axisId))
            .map(range => range.update(interval.start, interval.end) as AR)
            .ifPresent(updatedRange => axesRangeRef.current.set(axisId, updatedRange))
    }

    /**
     * Sets the original axis interval for the axis range
     * @param axisId The axis ID
     * @param interval The interval to which to set the origin interval
     */
    function setOriginalAxisIntervalFor(axisId: string, interval: AxisInterval): void {
        Optional.ofNullable(axesRangeRef.current.get(axisId))
            .map(range => range.updateOriginal(interval.start, interval.end) as AR)
            .ifPresent(updatedRange => axesRangeRef.current.set(axisId, updatedRange))
    }

    /**
     * Resets the bounds for the specified axis to the original range
     * @param axisId The ID of the axis
     */
    function resetAxisIntervalFor(axisId: string): void {
        Optional
            .ofNullable(axesRangeRef.current.get(axisId))
            .map(range => new Map<string, AR>([[axisId, range]]))
            .ifPresent(updates => updateAxisRanges(updates))
    }

    /**
     * Resets the bounds of all the axes to their original value or to the values specified
     * in the optional bounds map.
     * @param [axesRanges=new Map()] An optional map holds bounds for specified axes. The map
     * associates an axis ID with the new bounds.
     */
    function resetAxesRanges(axesRanges: Map<string, AR> = new Map()): void {
        updateAxisRanges(axesRanges)
    }

    /**
     * Adds a handler to deal with updates to the bounds of the axes
     * @param handlerId the unique ID of the handler
     * @param handler The handler function that accepts a map of updates and a plot dimension
     * @return A map with all the handlers
     */
    function addAxesRangesUpdateHandler(
        handlerId: string,
        handler: (updates: Map<string, AR>, plotDim: Dimensions) => void
    ): Map<string, (updates: Map<string, AR>, plotDim: Dimensions) => void> {
        if (axesBoundsUpdateHandlersRef.current.has(handlerId)) {
            throw new Error(
                `Handler with ID already exists, please remove it before adding it; ` +
                `handler_id: ${handlerId}; ` +
                `existing_handler_ids: [${Array.from(axesBoundsUpdateHandlersRef.current.keys()).join(", ")}]`
            )
        }
      return axesBoundsUpdateHandlersRef.current.set(handlerId, handler)
    }

    return <AxesContext.Provider
        value={{
            xAxesState: xAxesStateRef.current,
            yAxesState: yAxesStateRef.current,
            addXAxis: (axis, id, range: AR) => {
                xAxesStateRef.current = xAxesStateRef.current.addAxis(axis, id)
                if (range !== undefined) {
                    axesRangeRef.current.set(id, range)
                }
            },
            addYAxis: (axis, id, range: AR) => {
                yAxesStateRef.current = yAxesStateRef.current.addAxis(axis, id)
                if (range !== undefined) {
                    axesRangeRef.current.set(id, range)
                }
            },
            setAxisAssignments: assignments => axisAssignmentsRef.current = assignments,
            axisAssignmentsFor: seriesName => axisAssignmentsFor(seriesName),
            updateAxisRanges,
            axesRanges: () => new Map<string, AR>(axesRangeRef.current),
            axisRangeFor: axisId => Optional.ofNullable(axesRangeRef.current.get(axisId)),
            setAxesRanges,
            setAxisRangeFor,
            setAxisIntervalFor,
            setOriginalAxisIntervalFor,
            resetAxesRanges,
            resetAxisIntervalFor,
            onUpdateAxesInterval,
            addAxesRangesUpdateHandler,
            removeAxesRangesUpdateHandler: handlerId => axesBoundsUpdateHandlersRef.current.delete(handlerId),
        }}
    >
        {children}
    </AxesContext.Provider>
}

/**
 * React hook that sets up the React context for the chart values.
 * @return The {@link UseAxesValues} held in the React context.
 */
export function useAxes<AR extends BaseAxisRange, A extends BaseAxis>(): UseAxesValues<AR, A> {
    const context = useContext<UseAxesValues<AR, A>>(AxesContext)
    const {xAxesState} = context
    if (xAxesState === undefined || xAxesState === null) {
        throw new Error("useAxes can only be used when the parent is a <AxesProvider/>")
    }
    return context
}
