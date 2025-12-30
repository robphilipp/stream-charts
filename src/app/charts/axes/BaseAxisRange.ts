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
     * Returns the current distance between the start and end of the range.
     */
    get currentDistance(): number {
        return this.current.measure()
    }

    /**
     * Returns the original (e.g. before any zooming or panning) distance between the start and end of the range.
     */
    get originalDistance(): number {
        return this.original.measure()
    }

    /**
     * The ratio between the current and original distance.
     */
    get scaleFactor(): number {
        return this.currentDistance / this.originalDistance
    }

    /**
     * Scales the range using the current scale-factor (closure on `scaleFactor`)
     * @param factor The factor used to update the range
     * @param value The current value being scaled
     * @return The new range, represented by an array holding the start and end value
     */
    protected scaledRange(factor: number, value: number): AxisInterval {
        const dtStart = value - this.current.start
        const dtEnd = this.current.end - value
        const start = value - dtStart * factor / this.scaleFactor
        const end = value + dtEnd * factor / this.scaleFactor
        return AxisInterval.from(start, end)
    }

    /**
     *
     * Scales the axis-range by the specified scale factor from the specified {@link value}. The equations
     * are written so that the zooming (scaling) occurs at the specified {@link value}, and expands/contracts equally
     * from that {@link value}.
     * @param factor The scale factor
     * @param value The time from which to scale the interval
     * @return A new continuous-axis range with updated values
     */
    abstract scale(factor: number, value: number): BaseAxisRange

    /**
     * Scales the axis-range by the specified scale factor, but constrains the range to the specified
     * {@link constraint} min and max. The equations are written so that the zooming (scaling) occurs
     * at the specified {@link value}, and expands/contracts equally from that {@link value}.
     * @param factor The scale factor
     * @param value The value at which the zoom is initiated
     * @param constraint The min and max range
     * @return A new continuous-axis range with updated values
     */
    abstract constrainedScale(factor: number, value: number, constraint: [min: number, max: number]): BaseAxisRange

    /**
     * Translates the axis-range by the specified amount
     * @param amount The amount by which to translate the axis-range
     * @param [constraints] Optional constraint interval in which the axis range must be within
     * @return An updated {@link ContinuousAxisRange} that has been translated by the specified amount
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
