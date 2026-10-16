import {BaseAxisRange} from "./BaseAxisRange";

/**
 * An immutable continuous-axis range that holds the current range and the original (no zoom) range.
 * Create an instance using the {@link ContinuousAxisRange.from} factory method.
 */
export class ContinuousAxisRange extends BaseAxisRange {

    /**
     * Use {@link ContinuousAxisRange.from} to create an instance
     * @param start The start of the axis-range
     * @param end The end of the axis-range
     * @param [originalStart=start] The original start of the axis-range
     * @param [originalEnd=end] The original end of the axis-range
     */
    private constructor(start: number, end: number, originalStart: number = start, originalEnd: number = end) {
        super(start, end, originalStart, originalEnd)
    }

    /**
     * Factory function for creating a new continuous-axis range instance.
     * @param start The start of the axis-range.
     * @param end The end of the axis-range.
     * @param [originalStart=start] The optional original start of the axis-range (e.g. before any zooming or panning.
     * Defaults to the start value if not specified.)
     * @param [originalEnd=end] The optional original end of the axis-range (e.g. before any zooming or panning.
     * Defaults to the end value if not specified.)
     * @return A new continuous-axis range instance.
     */
    static from(start: number, end: number, originalStart: number = start, originalEnd: number = end): ContinuousAxisRange {
        return new ContinuousAxisRange(start, end, originalStart, originalEnd)
    }

    /**
     * Scales the axis-range by the specified *incremental* scale factor (relative to `.current`,
     * not `.original` -- see {@link BaseAxisRange.scaledRange}) from the specified value. The
     * equations are written so that the zooming (scaling) occurs at the specified value and
     * expands/contracts equally from that value.
     * @param factor The incremental scale factor
     * @param value The value from which to scale the interval
     * @return A new continuous-axis range with updated values
     */
    scale(factor: number, value: number): ContinuousAxisRange {
        const scaledInterval = this.scaledRange(factor, value)
        return new ContinuousAxisRange(scaledInterval.start, scaledInterval.end, this.original.start, this.original.end)
    }

    /**
     * Scales the axis-range by the specified *incremental* scale factor (relative to `.current`,
     * not `.original` -- see {@link BaseAxisRange.scaledRange}) from the specified value, while
     * keeping the range within the constraints (start, end). The equations are written so that the
     * zooming (scaling) occurs at the specified value, and expands/contracts equally from that value.
     *
     * Clamps the scaled result to stay *inside* `constraint` (shrinks toward it, never past it) --
     * `constraint` is a hard viewport edge (e.g. the data domain) that the visible range must not
     * scroll or zoom beyond. This is the opposite direction from
     * {@link OrdinalAxisRange.constrainedScale}, which *widens* its result to guarantee coverage
     * of `constraint` instead -- see that method's doc comment for why an ordinal axis needs the
     * opposite behavior. Do not "fix" this difference without reading both.
     * @param factor The incremental scale factor
     * @param value The value from which to scale the interval
     * @param constraint The minimum and maximum values that range bounds can be
     * @return A new continuous-axis range with updated values
     */
    constrainedScale(factor: number, value: number, constraint: [min: number, max: number]): BaseAxisRange {
        const scaledInterval = this.scaledRange(factor, value)
        const [min, max] = constraint
        return new ContinuousAxisRange(
            Math.max(min, scaledInterval.start),
            Math.min(max, scaledInterval.end),
            this.original.start,
            this.original.end
        )
    }

    /**
     * Translates the axis-range by the specified amount, unless that would take it outside the
     * constraint interval (when both ends of the constraint are infinite, there's no constraint)
     * @param amount The amount by which to translate the axis-range
     * @param [constraint=[-Infinity, Infinity]] Optional constraint interval in which the axis range must be within
     * @return An updated {@link ContinuousAxisRange} that has been translated by the specified amount (or an
     * unchanged copy, when the translation would leave the constraint interval)
     */
    translate(amount: number, constraint: [start: number, end: number] = [-Infinity, Infinity]): ContinuousAxisRange {
        const [cs, ce] = constraint
        // when both of the constraints are infinite, or the pan keeps the new axis range
        // within the origin axis range (i.e. zoomed in and the panned), then allow the pan,
        // otherwise don't update
        if ((!isFinite(cs) && !isFinite(ce)) || (this.current.start + amount >= cs && this.current.end + amount <= ce)) {
            return new ContinuousAxisRange(this.current.start + amount, this.current.end + amount, this.original.start, this.original.end)
        }
        return new ContinuousAxisRange(this.current.start, this.current.end, this.original.start, this.original.end)
    }

    /**
     * Updates the axis-range with the new start and end values, leaving the original range unchanged.
     * @param start The new start of the axis-range
     * @param end The new end of the axis range
     * @return The updated axis-range type, with all other values unchanged.
     */
    update(start: number, end: number): ContinuousAxisRange {
        return new ContinuousAxisRange(start, end, this.original.start, this.original.end)
    }

    /**
     * Updates the original range with the new start and end values.
     * @param start The new value for the start of the original range
     * @param end The new value for the end of the original range
     * @return The updated original range.
     */
    updateOriginal(start: number, end: number): BaseAxisRange {
        return new ContinuousAxisRange(this.current.start, this.current.end, start, end)
    }
}