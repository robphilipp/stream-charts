import {BaseAxisRange} from "./BaseAxisRange";

/**
 * An immutable ordinal-axis range that holds the current range and the original (no zoom) range.
 * Create an instance using the {@link OrdinalAxisRange.from} factory method.
 */
export class OrdinalAxisRange extends BaseAxisRange {

    /**
     * Use {@link OrdinalAxisRange.from} to create an instance
     * @param start The start of the axis-range
     * @param end The end of the axis-range
     * @param [originalStart=start] The original start of the axis-range
     * @param [originalEnd=end] The original end of the axis-range
     */
    private constructor(start: number, end: number, originalStart: number = start, originalEnd: number = end) {
        super(start, end, originalStart, originalEnd)
    }

    /**
     * Factory function for creating a new ordinal-axis range instance.
     * @param start The start of the axis-range.
     * @param end The end of the axis-range.
     * @param [originalStart=start] The optional original start of the axis-range (e.g. before any zooming or panning.
     * Defaults to the start value if not specified.)
     * @param [originalEnd=end] The optional original end of the axis-range (e.g. before any zooming or panning.
     * Defaults to the end value if not specified.)
     * @return A new ordinal-axis range instance.
     */
    static from(start: number, end: number, originalStart: number = start, originalEnd: number = end): OrdinalAxisRange {
        return new OrdinalAxisRange(start, end, originalStart, originalEnd)
    }

    /**
     * Scales the axis-range by the specified *cumulative* scale factor (d3-zoom's own
     * `event.transform.k`, taken as-is -- NOT converted to an incremental, relative-to-the-
     * previous-event factor), pivoting on `value`.
     *
     * Two cases, because neither a purely incremental nor a purely cumulative-from-`.original`
     * formula is correct on its own for a bounded ordinal domain:
     *
     * - `factor === 1` (fully zoomed out): returns `.original` directly, bypassing the pivot math
     *   entirely. An ordinal axis's domain (the fixed set of categories) is bounded, so "zoomed all
     *   the way back out" has exactly one correct answer -- `.current` must equal `.original`
     *   *exactly*, regardless of how many different pivots were used to get there. d3-zoom's own
     *   `.scaleExtent` clamps `k` to *exactly* 1 at the zoom floor (not just asymptotically close),
     *   so this equality check reliably detects that boundary.
     * - Otherwise: scales from `.current` using the *incremental* step implied by the cumulative
     *   factor (`factor` divided by the range's own current/original width ratio) -- the same
     *   pivot-preserving composition `ContinuousAxisRange` uses (see `BaseAxisRange.scaledRange`).
     *   This composes correctly across any sequence of differing pivots without jumping.
     *
     * Why not just always scale from `.original` by the cumulative factor (a prior version of this
     * method did exactly that)? Composing pivot-preserving zooms at *different* pivots is not
     * itself position-preserving -- zooming in at one spot and back out at another nets a
     * translation, same as any pinch-zoom or map UI, verified live: zoom in at pivot A to k=5, then
     * zoom out at a different pivot B to k=1, lands `.current` at `[400, 1400]` instead of
     * `[0, 1000]` even under the mathematically-correct incremental composition. Scaling
     * `.original` directly by the raw cumulative factor "fixes" that only by recomputing the
     * *entire* zoom from scratch at the current pivot on every single event -- which is correct
     * only when the pivot never changes since the last identity reset, and otherwise discards all
     * zoom history, producing a visible jump the moment the pivot changes at any *non-identity* zoom
     * level (confirmed live: continuing to zoom in from k=5 at pivot A to k=6 at a different pivot B
     * jumped from the correct, continuous `[-1600, 4400]` to `[-4000, 2000]`). The `factor === 1`
     * special case gets the position-preserving guarantee only where it's actually needed -- the
     * one canonical "fully zoomed out" state -- without sacrificing composability everywhere else.
     * A continuous/scrolling axis (`ContinuousAxisRange`) never needs the equivalent of this special
     * case, since it has no fixed domain edge for translational drift to visibly clip against.
     * @param factor The cumulative scale factor (`event.transform.k`, unmodified)
     * @param value The value from which to scale the interval
     * @return The new range, as a plain {start, end} pair
     */
    private scaledCumulative(factor: number, value: number): {start: number, end: number} {
        // when the factor is 1 or the original measure is 0, return the original range
        if (factor === 1 || this.original.measure() === 0) {
            return {start: this.original.start, end: this.original.end}
        }
        const scaleFactor = this.current.measure() / this.original.measure()
        const incrementalFactor = factor / scaleFactor
        const dtStart = value - this.current.start
        const dtEnd = this.current.end - value
        return {start: value - dtStart * incrementalFactor, end: value + dtEnd * incrementalFactor}
    }

    /**
     * Scales the axis-range by the specified *cumulative* scale factor (see
     * `scaledCumulative` for why this must be cumulative, not incremental) from the
     * specified value. The equations are written so that the zooming (scaling) occurs at the
     * specified value, and expands/contracts equally from that value. This operation does not
     * modify the original range.
     * @param factor The cumulative scale factor
     * @param value The value from which to scale the interval
     * @return A new ordinal-axis range with updated values
     */
    scale(factor: number, value: number): OrdinalAxisRange {
        const scaledInterval = this.scaledCumulative(factor, value)
        return new OrdinalAxisRange(scaledInterval.start, scaledInterval.end, this.original.start, this.original.end)
    }

    /**
     * Scales the axis-range by the specified *cumulative* scale factor (see
     * `scaledCumulative` for why this must be cumulative, not incremental) from the
     * specified value, while keeping the range within the constraints (start, end). The equations
     * are written so that the zooming (scaling) occurs at the specified value, and
     * expands/contracts equally from that value.
     *
     * Widens the scaled result to *cover* `constraint` (never narrower than it) -- `constraint`
     * is the domain that must be fully visible once zoomed all the way out, and widening rather
     * than clamping is exactly what fixes the pivot-drift bug described on
     * `scaledCumulative` (zooming in at one pivot and back out at another must never leave
     * part of the domain clipped). This is the opposite direction from
     * {@link ContinuousAxisRange.constrainedScale}, which *clamps* its result inside `constraint`
     * instead -- see that method's doc comment for why a continuous axis needs the opposite
     * behavior. Do not "fix" this difference without reading both.
     * @param factor The cumulative scale factor
     * @param value The value from which to scale the interval
     * @param constraint The minimum and maximum values that range bounds can be
     * @return A new ordinal-axis range with updated values
     */
    constrainedScale(factor: number, value: number, constraint: [min: number, max: number]): OrdinalAxisRange {
        const scaledInterval = this.scaledCumulative(factor, value)
        const [min, max] = constraint
        return new OrdinalAxisRange(
            Math.min(min, scaledInterval.start),
            Math.max(max, scaledInterval.end),
            this.original.start,
            this.original.end
        )
    }
    /**
     * Translates the axis-range by the specified amount, unless that would take it outside the
     * constraint interval (when both ends of the constraint are infinite, there's no constraint)
     * @param amount The amount by which to translate the axis-range
     * @param [constraint=[-Infinity, Infinity]] Optional constraint interval in which the axis range must be within
     * @return An updated {@link OrdinalAxisRange} that has been translated by the specified amount (or an
     * unchanged copy, when the translation would leave the constraint interval)
     */
    translate(amount: number, constraint: [start: number, end: number] = [-Infinity, Infinity]): OrdinalAxisRange {
        const [cs, ce] = constraint
        // when both of the constraints are infinite, or the pan keeps the new axis range
        // within the origin axis range (i.e. zoomed in and the panned), then allow the pan,
        // otherwise don't update
        if ((!isFinite(cs) && !isFinite(ce)) || (this.current.start + amount >= cs && this.current.end + amount <= ce)) {
            return new OrdinalAxisRange(this.current.start + amount, this.current.end + amount, this.original.start, this.original.end)
        }
        return new OrdinalAxisRange(this.current.start, this.current.end, this.original.start, this.original.end)
    }

    /**
     * Assumes that the original ranges start at 0 and end at the width or height of the plot. Calculates the
     * new range based on the change in dimensions and the previous range. And calculates the new original range
     * based on the change in the dimensions.
     * @param beforeDimension The width or height before the change in dimensions
     * @param afterDimension The width or height after the change in dimensions
     * @return An updated {@link OrdinalAxisRange} that has been zoomed based on the change in
     * the dimensions.
     */
    zoom(beforeDimension: number, afterDimension: number): OrdinalAxisRange {
        // a zero `beforeDimension` (e.g. a chart mounted inside a collapsed/hidden container that
        // later becomes visible) would otherwise divide by zero below, producing a NaN/Infinity
        // range that corrupts this axis until remount. There's no proportional "before" range to
        // scale from in that case, so just take the new dimension as the fresh, un-zoomed range.
        if (beforeDimension === 0) {
            return new OrdinalAxisRange(0, afterDimension, 0, afterDimension)
        }
        const [start, end] = this.current.asTuple()
        const delta = (end - start ) * (afterDimension - beforeDimension) / beforeDimension
        const lowerBound = start / (end - start) * delta + start
        const upperBound = end / (end - start) * delta + end
        return new OrdinalAxisRange(lowerBound, upperBound, 0, afterDimension)
    }

    /**
     * Updates the axis-range with the new start and end values, leaving the original range unchanged.
     * @param start The new start of the axis-range
     * @param end The new end of the axis range
     * @return The updated axis-range type, with all other values unchanged.
     */
    update(start: number, end: number): OrdinalAxisRange {
        return new OrdinalAxisRange(start, end, this.original.start, this.original.end)
    }

    /**
     * Updates the original range with the new start and end values.
     * @param start The new value for the start of the original range
     * @param end The new value for the end of the original range
     * @return The updated original range.
     */
    updateOriginal(start: number, end: number): BaseAxisRange {
        return new OrdinalAxisRange(this.current.start, this.current.end, start, end)
    }
}
