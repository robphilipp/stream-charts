/**
 * An immutable (start, end) interval, with `start <= end`, used both for an axis' domain (its
 * data-space, for example, the range of the tick values) and for an axis' range (its pixel-space,
 * the physical start and end pixels on the screen). An interval whose start or end is `NaN` is
 * empty.
 */
export class AxisInterval {
    readonly start: number
    readonly end: number

    /**
     * Use {@link from}, {@link as}, or {@link empty} to create an axis interval
     * @param start The interval's start
     * @param end The interval's end
     */
    private constructor(start: number, end: number) {
        this.start = start
        this.end = end
    }

    /**
     * Creates an axis interval from the specified start and end values. The values are normalized
     * so that `start <= end` regardless of the order they're passed in -- callers never need to
     * worry about which endpoint ended up larger (e.g. after a pan/zoom delta pushes one endpoint
     * past the other).
     *
     * If exactly one of `start`/`end` is `NaN`, both endpoints of the result collapse to `NaN`
     * (`Math.min`/`Math.max` propagate `NaN` unconditionally) -- the same representation as an
     * intentionally-empty interval (see {@link empty}). That's indistinguishable from genuinely
     * wanting an empty interval, and silently discards which of the two inputs was actually bad,
     * so this logs a warning for that specific mixed case (one real number, one `NaN`) to surface
     * what's almost always an upstream computation error -- `from(NaN, NaN)` (a deliberate empty
     * interval) is not warned about.
     * @param start The axis-range start value
     * @param end The axis-range end value
     * @return The axis-interval
     */
    static from(start: number, end: number): AxisInterval {
        if ((isNaN(start) || isNaN(end)) && !(isNaN(start) && isNaN(end))) {
            console.warn(
                `AxisInterval.from received exactly one NaN endpoint -- this usually indicates an ` +
                `upstream computation error, not an intentional empty interval (use AxisInterval.empty() ` +
                `for that); start: ${start}, end: ${end}`
            )
        }
        return new AxisInterval(Math.min(start, end), Math.max(start, end))
    }

    /**
     * Creates an axis interval from the specified tuple
     * @param tuple The tuple to convert
     * @return The axis-interval
     */
    static as(tuple: [start: number, end: number]): AxisInterval {
        return AxisInterval.from(tuple[0], tuple[1])
    }

    /**
     * Creates an empty axis interval
     * @return An empty axis interval
     */
    static empty(): AxisInterval {
        return new AxisInterval(NaN, NaN)
    }

    /**
     * @return `true` if the axis interval is empty, `false` otherwise
     */
    isEmpty(): boolean {
        return isNaN(this.start) || isNaN(this.end)
    }

    /**
     * @return `true` if the axis interval is not empty, `false` otherwise
     */
    isNotEmpty(): boolean {
        return !this.isEmpty()
    }

    /**
     * Determines whether this axis interval's start and end are the specified ones (two empty
     * intervals are equal)
     * @param start The start to compare to
     * @param end The end to compare to
     * @return `true` if this axis interval's start and end are the specified ones, `false` otherwise
     */
    equalsInterval(start: number, end: number): boolean {
        return (this.start === start && this.end === end) || (this.isEmpty() && isNaN(start) && isNaN(end))
    }

    /**
     * Determines whether the specified axis interval is equal to this one.
     * @param other The other axis interval to compare to
     * @return `true` if the specified axis interval is equal to this one, `false` otherwise.
     */
    equals(other: AxisInterval): boolean {
        return this.equalsInterval(other.start, other.end)
    }

    /**
     * Creates a copy of this axis interval
     * @return A copy of this axis interval
     */
    copy(): AxisInterval {
        return AxisInterval.from(this.start, this.end)
    }

    /**
     * Converts the axis interval to a tuple
     * @return The axis interval as a tuple
     */
    asTuple(): [start: number, end: number] {
        return [this.start, this.end]
    }

    /**
     * Applies the specified function to this axis interval's start and end, and returns the
     * resulting interval
     * @param fn The function to apply to the axis interval's start and end
     * @return A new axis interval holding the function's result
     */
    map(fn: (start: number, end: number) => [start: number, end: number]): AxisInterval {
        const [start, end] = fn(this.start, this.end)
        return AxisInterval.from(start, end)
    }

    /**
     * Calculates the measure (end - start) of this axis interval.
     * The measure of an empty axis interval is 0.
     * @return The measure (end - start) of this axis interval
     */
    measure(): number {
        return this.isNotEmpty() ? this.end - this.start : 0
    }

    /**
     * Creates an axis interval whose start is moved by the specified amount (and whose end isn't)
     * @param delta The amount by which to move the start
     * @return A new axis interval (empty when this one is)
     */
    translateStart(delta: number): AxisInterval {
        return this.isNotEmpty() ? AxisInterval.from(this.start + delta, this.end) : AxisInterval.empty()
    }

    /**
     * Creates an axis interval whose end is moved by the specified amount (and whose start isn't)
     * @param delta The amount by which to move the end
     * @return A new axis interval (empty when this one is)
     */
    translateEnd(delta: number): AxisInterval {
        return this.isNotEmpty() ? AxisInterval.from(this.start, this.end + delta) : AxisInterval.empty()
    }

    /**
     * Creates an axis interval that's this one translated (both its start and its end moved) by the
     * specified amount
     * @param delta The amount by which to translate the axis interval
     * @return A new axis interval (empty when this one is)
     */
    translate(delta: number): AxisInterval {
        return this.isNotEmpty() ? AxisInterval.from(this.start + delta, this.end + delta) : AxisInterval.empty()
    }
}

