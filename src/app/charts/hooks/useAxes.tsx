import {addAxisTo, AxesState, createAxesState} from "./AxesState";
import {BaseAxis} from "../axes/axes";
import {AxesAssignment} from "../plots/plot";
import {createContext, JSX, useContext, useRef} from "react";
import {ContinuousAxisRange, continuousAxisRangeFor} from "../axes/continuousAxisRangeFor";
import {Dimensions} from "../styling/margins";
import {usePlotDimensions} from "./usePlotDimensions";

/**
 * No operation function for use when a default function is needed
 */
const noop = () => {
    /* empty on purpose */
}

type AxisRange = [start: number, end: number]
const anEmptyRange: AxisRange = [NaN, NaN]
const copyRangeMap = (ranges: Map<string, AxisRange>): Map<string, AxisRange> =>
    new Map(Array.from(ranges.entries()).map(([id, [start, end]]) => [id, [start, end]]))

export type UseAxesValues = {
    /**
     * The x-axes state holds the currently set x-axes, manipulation and accessor functions
     */
    xAxesState: AxesState
    /**
     * Adds an x-axis to the axes and updates the internal state
     * @param axis The axis to add
     * @param id The ID of the axis to add
     * @param domain The initial axis range (start, end)
     */
    addXAxis: (axis: BaseAxis, id: string, range?: [start: number, end: number]) => void
    /**
     * The y-axes state holds the currently set x-axes, manipulation and accessor functions
     */
    yAxesState: AxesState
    /**
     * Adds a y-axis to the axes and updates the internal state
     * @param axis The axis to add
     * @param id The ID of the axis to add
     * @param domain The initial axis range (start, end)
     */
    addYAxis: (axis: BaseAxis, id: string, range?: [start: number, end: number]) => void
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
     * Retrieves the axis range for the specified axis ID
     * @param axisId The ID of the axis for which to retrieve the axis-range
     * @return The axis-range as a `[start, end]` tuple if the axis ID is found, `undefined` otherwise
     */
    axisBoundsFor: (axisId: string) => AxisRange
    /**
     * Retrieves the original axis range for the specified axis ID
     * @param axisId The ID of the axis for which to retrieve the axis-range
     * @return The axis-range as a `[start, end]` tuple if the axis ID is found, `undefined` otherwise
     */
    originalAxisBoundsFor: (axisId: string) => AxisRange
    /**
     * @return The original axis bounds as a map(axis_id, (start, end))
     */
    originalAxisBounds: () => Map<string, AxisRange>
    /**
     * Sets the time-range for the specified axis ID to the specified range
     * @param axisId The ID of the axis for which to set the range
     * @param timeRange The new time range as an `[t_start, t_end]` tuple
     */
    setAxisBoundsFor: (axisId: string, timeRange: [start: number, end: number]) => void
    /**
     * Callback function that is called when the time ranges change. The time ranges could
     * change because of a zoom action, a pan action, or as new data is streamed in.
     * @param times A `map(axis_id -> time_range)` that associates the axis ID with the
     * current time range.
     */
    updateAxesBounds: (times: Map<string, ContinuousAxisRange>) => void
    /**
     * Resets the axes bounds to their original bounds
     * @param axisId The ID of the axis
     * @param [axisBounds] An optional bounds that resets the original bounds
     */
    resetAxisBoundsFor: (axisId: string, axisBounds?: AxisRange) => void
    /**
     * Resets all the axes bound to the original bounds
     */
    resetAxesBounds: (axesBounds?: Map<string, AxisRange>) => void
    /**
     * Callback when the time range changes.
     * @param times The times (start, end) times for each axis in the plot. The times argument is a
     * map(axis_id -> (start, end)). Where start and end refer to the time-range for the
     * axis.
     * @return void
     */
    onUpdateAxesBounds?: (times: Map<string, AxisRange>) => void
    /**
     * Adds a handler for when the time is updated. The time could change because of a zoom action,
     * a pan action, or as new data is streamed in.
     * @param handlerId The unique ID of the handler to register/add
     * @param handler The handler function that accepts a map of updates and a plot dimension
     */
    addAxesBoundsUpdateHandler: (handlerId: string, handler: (updates: Map<string, ContinuousAxisRange>, plotDim: Dimensions) => void) => void
    /**
     * Removes the time-update handler with the specified ID
     * @param handlerId The ID of the handler to remove
     */
    removeAxesBoundsUpdateHandler: (handlerId: string) => void
}

export const defaultAxesValues = (): UseAxesValues => ({
    xAxesState: createAxesState(),
    yAxesState: createAxesState(),
    addXAxis: noop,
    addYAxis: noop,
    setAxisAssignments: noop,
    axisAssignmentsFor: () => ({xAxis: "", yAxis: ""}),
    axisBoundsFor: () => anEmptyRange,
    originalAxisBoundsFor: () => anEmptyRange,
    originalAxisBounds: () => new Map<string, AxisRange>(),
    setAxisBoundsFor: noop,
    updateAxesBounds: noop,
    resetAxisBoundsFor: noop,
    resetAxesBounds: noop,
    addAxesBoundsUpdateHandler: () => noop,
    removeAxesBoundsUpdateHandler: () => noop,
})

// the context for axes
const AxesContext = createContext<UseAxesValues>(defaultAxesValues())

type Props = {
    /**
     * Callback when the axes bounds change.
     * @param ranges The ranges (start, end) for each axis in the plot
     */
    onUpdateAxesBounds?: (ranges: Map<string, [start: number, end: number]>) => void

    children: JSX.Element | Array<JSX.Element>
}

/**
 * The React context provider for the {@link UseAxesValues}
 * @param props The properties
 * @return The children wrapped in this provider
 * @constructor
 */
export default function AxesProvider(props: Props): JSX.Element {
    const {onUpdateAxesBounds, children} = props

    const plotDimensions = usePlotDimensions()

    const xAxesRef = useRef<AxesState>(createAxesState())
    const yAxesRef = useRef<AxesState>(createAxesState())
    const axisAssignmentsRef = useRef<Map<string, AxesAssignment>>(new Map())
    // holds the current axis bounds, map(axis_id -> (start, end)
    const axesBoundsRef = useRef<Map<string, AxisRange>>(new Map())
    // holds the original axis bounds, map(axis_id -> (start, end)
    const originalAxesBoundsRef =  useRef<Map<string, AxisRange>>(new Map())
    const axesBoundsUpdateHandlersRef = useRef<Map<string, (updates: Map<string, ContinuousAxisRange>, plotDim: Dimensions) => void>>(new Map())

    /**
     * Retrieves the x-axis and y-axis assignments for the specified series. If the axes does not have
     * an assignment, then is assumed to be using the default x- and y-axes.
     * @param seriesName The name of the series for which to retrieve the axes assignments
     * @return An {@link AxesAssignment} for the specified axes.
     */
    function axisAssignmentsFor(seriesName: string): AxesAssignment {
        return axisAssignmentsRef.current.get(seriesName) || {
            xAxis: xAxesRef.current.axisDefaultId(),
            yAxis: yAxesRef.current.axisDefaultId()
        }
    }

    /**
     * Called when the time is updated on one or more of the chart's axes (generally x-axes). In turn,
     * dispatches the update to all the internal time update handlers.
     * @param updates A map holding the axis ID to the updated axis time-range (i.e. map(axis_id, axis_time_range))
     */
    function updateAxesBounds(updates: Map<string, ContinuousAxisRange>): void {
        // update the current time-ranges reference
        updates.forEach((range, id) => axesBoundsRef.current.set(id, [range.start, range.end]))
        // dispatch the updates to all the registered handlers
        axesBoundsUpdateHandlersRef.current.forEach((handler, ) => handler(updates, plotDimensions.plotDimensions))
    }

    /**
     * Resets the bounds for the specified axis to the original range, or if the optional
     * range is specified, then to the specified range. The optional range is helpful when
     * the axes ranges are changing in response to a domain change, and the original bounds
     * need to reflect that change.
     * @param axisId The ID of the axis
     * @param axisRange The optional range to which to set the axis
     */
    function resetAxisBoundsFor(axisId: string, axisRange?: AxisRange): void {
        if (axisRange !== undefined) {
            const [start, end] = axisRange
            const updates = new Map<string, ContinuousAxisRange>([[axisId, continuousAxisRangeFor(start, end)]])
            updateAxesBounds(updates)
        } else if (axesBoundsRef.current.has(axisId) && originalAxesBoundsRef.current.has(axisId)) {
            const [start, end] = originalAxesBoundsRef.current.get(axisId) || anEmptyRange
            const updates = new Map<string, ContinuousAxisRange>([[axisId, continuousAxisRangeFor(start, end)]])
            updateAxesBounds(updates)
        }
    }

    /**
     * Resets the bounds of all the axis to their original value, or to the values specified
     * in the optional bounds map.
     * @param [axisBounds=new Map()] An optional map holds bounds for specified axes. The map
     * associates an axis ID to a new bounds.
     */
    function resetAxesBounds(axisBounds: Map<string, AxisRange> = new Map()): void {
        const updates: Map<string, ContinuousAxisRange> = new Map(Array.from(axesBoundsRef.current.entries())
            .filter(([id, _]) => originalAxesBoundsRef.current.has(id) || axisBounds.has(id))
            .map(([id, _]) => {
                // because of the filter, this will never be an empty range
                if (axisBounds.has(id)) {
                    const [start, end] = axisBounds.get(id) || anEmptyRange
                    return [id, continuousAxisRangeFor(start, end)]
                }
                const [start, end] = originalAxesBoundsRef.current.get(id) || anEmptyRange
                return [id, continuousAxisRangeFor(start, end)]
            }))
        updateAxesBounds(updates)
    }

    return <AxesContext.Provider
        value={{
            xAxesState: xAxesRef.current,
            yAxesState: yAxesRef.current,
            addXAxis: (axis, id, range) => {
                xAxesRef.current = addAxisTo(xAxesRef.current, axis, id)
                if (range !== undefined) {
                    originalAxesBoundsRef.current.set(id, range)
                    axesBoundsRef.current.set(id, range)
                }
            },
            addYAxis: (axis, id, range) => {
                yAxesRef.current = addAxisTo(yAxesRef.current, axis, id)
                if (range !== undefined) {
                    originalAxesBoundsRef.current.set(id, range)
                    axesBoundsRef.current.set(id, range)
                }
            },
            setAxisAssignments: assignments => axisAssignmentsRef.current = assignments,
            axisAssignmentsFor: seriesName => axisAssignmentsFor(seriesName),
            axisBoundsFor: axisId => axesBoundsRef.current.get(axisId) || anEmptyRange,
            originalAxisBoundsFor: axisId => originalAxesBoundsRef.current.get(axisId) || anEmptyRange,
            originalAxisBounds: () => copyRangeMap(originalAxesBoundsRef.current),
            setAxisBoundsFor: ((axisId, range) => axesBoundsRef.current.set(axisId, range)),
            updateAxesBounds,
            resetAxisBoundsFor,
            resetAxesBounds,
            onUpdateAxesBounds,
            addAxesBoundsUpdateHandler: (handlerId, handler) => axesBoundsUpdateHandlersRef.current.set(handlerId, handler),
            removeAxesBoundsUpdateHandler: handlerId => axesBoundsUpdateHandlersRef.current.delete(handlerId),
        }}
    >
        {children}
    </AxesContext.Provider>
}

/**
 * React hook that sets up the React context for the chart values.
 * @return The {@link UseAxesValues} held in the React context.
 */
export function useAxes(): UseAxesValues {
    const context = useContext<UseAxesValues>(AxesContext)
    const {xAxesState} = context
    if (xAxesState === undefined || xAxesState === null) {
        throw new Error("useAxes can only be used when the parent is a <AxesProvider/>")
    }
    return context
}
