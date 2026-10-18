import {BaseAxisRange} from "../axes/BaseAxisRange";
import type {BaseAxis} from "../axes/axes";
import {AxesState} from "../axes/AxesState";
import {Optional} from "result-fn";
import type {UseAxesValues} from "./useAxes";

/**
 * No operation function for use when a default function is needed
 */
const noop = () => {
    /* empty on purpose */
}

/**
 * Default axes value
 * @return The default values for the {@link UseAxesValues}
 * @template AR The type of the axis range (e.g. {@link ContinuousAxisRange} or {@link OrdinalAxisRange})
 * @template A The axis type
 */
export function defaultAxesValues<AR extends BaseAxisRange, A extends BaseAxis>(): UseAxesValues<AR, A> {
    return ({
        xAxesState: AxesState.empty(),
        yAxesState: AxesState.empty(),
        addXAxis: noop,
        addYAxis: noop,
        setAxisAssignments: noop,
        axisAssignmentsFor: () => ({xAxis: "", yAxis: ""}),
        updateAxisRanges: noop,
        axesRanges: () => new Map<string, AR>(),
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
}