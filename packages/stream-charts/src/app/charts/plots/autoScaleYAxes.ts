import {useEffect, useRef} from "react";
import type {Optional} from "result-fn";
import type {BaseAxis, ContinuousNumericAxis} from "../axes/axes";
import type {BaseAxisRange} from "../axes/BaseAxisRange";
import {ContinuousAxisRange} from "../axes/ContinuousAxisRange";
import {grownDomain} from "../axes/autoScale";

/**
 * What a plot needs from its chart's axes to auto-scale its y-axes (see `ContinuousAxis`'s
 * `autoScale` prop)
 */
export type AutoScaleAxes = {
    /**
     * The plot's y-axes, by their IDs
     */
    yAxes: Map<string, BaseAxis>
    /**
     * The (current and original) range of the specified axis
     */
    axisRangeFor: (axisId: string) => Optional<BaseAxisRange>
    /**
     * Updates the specified axes' ranges (which updates the axes)
     */
    updateAxisRanges: (ranges: Map<string, ContinuousAxisRange>) => void
}

/**
 * The axis' range, updated to the specified domain (or a new range for it, when the axis has none)
 * @param axisId The axis' ID
 * @param domain The domain
 * @param axisRangeFor The (current and original) range of the specified axis
 * @return The updated range
 */
function rangeFor(
    axisId: string,
    [min, max]: [min: number, max: number],
    axisRangeFor: AutoScaleAxes['axisRangeFor']
): ContinuousAxisRange {
    return axisRangeFor(axisId)
        .map(range => range.update(min, max) as ContinuousAxisRange)
        .getOrElse(ContinuousAxisRange.from(min, max))
}

/**
 * Grows the auto-scaling y-axes to fit the specified extents of the data plotted against them
 * (within their limits, and with their padding -- see `grownDomain`). Meant to be called from a
 * draw function registered to run before the axes draw (they're at z-index 0), so that the axes
 * and the data are drawn with the grown domain in the same frame.
 * @param extents The extent of the (visible) data plotted against each y-axis, by axis ID
 * @param axes The plot's y-axes, and their ranges
 */
export function growAutoScaledYAxes(
    extents: Map<string, [min: number, max: number]>,
    axes: AutoScaleAxes
): void {
    const {yAxes, axisRangeFor, updateAxisRanges} = axes
    const updates = new Map<string, ContinuousAxisRange>()
    extents.forEach((extent, axisId) => {
        const axis = yAxes.get(axisId) as ContinuousNumericAxis | undefined
        if (axis?.autoScale === undefined) return
        const [currentMin, currentMax] = axis.scale.domain()
        const [min, max] = grownDomain([currentMin, currentMax], extent, axis.autoScale, axis.scale)
        if (min !== currentMin || max !== currentMax) {
            updates.set(axisId, rangeFor(axisId, [min, max], axisRangeFor))
        }
    })
    if (updates.size > 0) updateAxisRanges(updates)
}

/**
 * New data, new scale: when the plot's data source is replaced (e.g. on a reset, or a change to
 * the number of series), restarts the auto-scaling y-axes from their starts (and they then grow
 * to fit the new data). Only on a *change* of data source -- not when the plot mounts with its
 * data source, which would throw away an axis' kept growth (see `ContinuousAxis`'s
 * `autoScaledDomain`). The axes are read through a ref, so that this only acts when the data
 * source changes -- not, say, when an axis is added.
 * @param dataSource The plot's data source
 * @param axes The plot's y-axes, and their ranges
 */
export function useAutoScaleRestart(dataSource: unknown, axes: AutoScaleAxes): void {
    const axesRef = useRef(axes)
    useEffect(() => {
        axesRef.current = axes
    })

    const dataSourceRef = useRef(dataSource)
    useEffect(
        () => {
            if (dataSourceRef.current === dataSource) return
            dataSourceRef.current = dataSource

            const {yAxes, axisRangeFor, updateAxisRanges} = axesRef.current
            const updates = new Map<string, ContinuousAxisRange>()
            yAxes.forEach((axis, axisId) => {
                const {autoScale} = axis as ContinuousNumericAxis
                if (autoScale !== undefined) updates.set(axisId, rangeFor(axisId, autoScale.domain, axisRangeFor))
            })
            if (updates.size > 0) updateAxisRanges(updates)
        },
        [dataSource]
    )
}
