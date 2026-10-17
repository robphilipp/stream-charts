import {AxisInterval} from "./AxisInterval";

/**
 * An immutable axis range that holds the current range and the original (no zoom) range.
 */
export abstract class BaseAxisRange {
    readonly current: AxisInterval
    // the range when there is no zoom, which is the interval (0, width | height)
    readonly original: AxisInterval

    /**
     * @param start The axis-range start value.
     * @param end The axis-range end value.
     * @param [originalStart = start] The optional original axis-range start value. Defaults to the start value if not specified.
     * @param [originalEnd = end] The optional original axis-range end value. Defaults to the end value if not specified.
     * @protected
     */
    protected constructor(start: number, end: number, originalStart: number = start, originalEnd: number = end) {
        this.current = AxisInterval.from(start, end)
        this.original = AxisInterval.from(originalStart, originalEnd)
    }

    /**
     * Determines whether the specified (start, end) interval matches the original interval
     * @param start The start of the interval
     * @param end The end of the interval
     * @return `true` if the specified interval matches the original interval; `false` otherwise
     */
    matchesOriginal(start: number, end: number): boolean {
        return this.original.equalsInterval(start, end)
    }

    /**
     * The current distance between the start and end of the range
     * @return The current range's measure (0 when it's empty)
     */
    get currentDistance(): number {
        return this.current.measure()
    }

    /**
     * The original (e.g. before any zooming or panning) distance between the start and end of the range
     * @return The original range's measure (0 when it's empty)
     */
    get originalDistance(): number {
        return this.original.measure()
    }

    /**
     * Scales the range by the specified *incremental* factor -- i.e. relative to `.current`, not
     * relative to `.original`. d3-zoom's own `transform.k` is cumulative from wherever `__zoom` was
     * last reset to identity, so callers must first convert it to an incremental factor (this
     * event's `k` divided by the previously-applied `k`, tracked in a ref that survives across
     * zoom events -- see `useCanvasZoomPan`) before calling this. Scaling relative
     * to `.current` this way means `.original` no longer needs to be preserved/shifted for the
     * zoom math to stay correct -- unlike the previous design, where `factor` was the *cumulative*
     * `transform.k` applied against `.original`, which broke the moment anything (e.g. a fresh
     * subscription on Run) rebuilt `.original` to match a since-zoomed `.current` mid-session.
     * @param factor The incremental scale factor (this event's change in scale, not the cumulative
     * scale since the axis was last at identity)
     * @param value The current value being scaled
     * @return The new range, represented by an array holding the start and end value
     */
    protected scaledRange(factor: number, value: number): AxisInterval {
        const dtStart = value - this.current.start
        const dtEnd = this.current.end - value
        const start = value - dtStart * factor
        const end = value + dtEnd * factor
        return AxisInterval.from(start, end)
    }

    /**
     * Scales the axis-range by the specified factor from the specified {@link value} (see
     * {@link scaledRange} for what "incremental" means for a continuous axis range). The equations are written so
     * that the zooming (scaling) occurs at the specified {@link value}, and expands/contracts
     * equally from that {@link value}.
     * @param factor The scale factor -- incremental for a {@link ContinuousAxisRange}, but cumulative
     * for an {@link OrdinalAxisRange} (see its {@link OrdinalAxisRange.scale})
     * @param value The value from which to scale the interval
     * @return A new axis range with updated values
     */
    abstract scale(factor: number, value: number): BaseAxisRange

    /**
     * Scales the axis-range from the specified {@link value}, honoring the specified
     * {@link constraint} min and max. The equations are written so that the zooming (scaling)
     * occurs at the specified {@link value}, and expands/contracts equally from that
     * {@link value}.
     *
     * IMPORTANT: the two concrete subclasses give `constraint` opposite meanings, and neither
     * uses the same kind of `factor` -- this base signature is shared for convenience, not
     * because the implementations are interchangeable:
     * - {@link ContinuousAxisRange.constrainedScale} takes an *incremental* factor and *clamps*
     *   the result to stay inside `constraint` -- `constraint` is a hard viewport edge the range
     *   is not allowed to scroll/zoom past.
     * - {@link OrdinalAxisRange.constrainedScale} takes a *cumulative* factor and *widens* the
     *   result to guarantee it fully covers `constraint` -- `constraint` is the domain that must
     *   be entirely visible once zoomed all the way out, and widening (rather than clamping) is
     *   what fixes the pivot-drift bug documented on {@link OrdinalAxisRange.scaledCumulative}.
     * Do not port logic between the two without re-reading both subclasses' own doc comments.
     * @param factor The scale factor -- incremental or cumulative, depending on the concrete subclass
     * @param value The value at which the zoom is initiated
     * @param constraint The min and max range
     * @return A new axis range with updated values
     */
    abstract constrainedScale(factor: number, value: number, constraint: [min: number, max: number]): BaseAxisRange

    /**
     * Translates the axis-range by the specified amount, unless that would take it outside the
     * constraint interval
     * @param amount The amount by which to translate the axis-range
     * @param [constraints] Optional constraint interval in which the axis range must be within
     * @return An updated axis range that has been translated by the specified amount (or an
     * unchanged copy, when the translation would leave the constraint interval)
     */
    abstract translate(amount: number, constraints?: [start: number, end: number]): BaseAxisRange

    /**
     * Updates the axis-range based on the new start and end values
     * @param start The new start of the axis-range
     * @param end The new end of the axis range
     * @return The updated axis-range type, with all other values unchanged
     */
    abstract update(start: number, end: number): BaseAxisRange

    /**
     * Updates the original range with the new start and end values.
     * @param start The new value for the start of the original range
     * @param end The new value for the end of the original range
     * @return The updated original range.
     */
    abstract updateOriginal(start: number, end: number): BaseAxisRange
}
