import type {ScaleContinuousNumeric} from "d3";
import {firstIndexAtOrAfter} from "../utils";

/**
 * The auto-scaling settings of a (y-) axis whose domain grows to fit the data plotted against it
 * (see `ContinuousAxis`'s `autoScale`, `autoScaleMin`, `autoScaleMax`, and `autoScalePadding` props)
 */
export type AutoScale = {
    /**
     * Where the axis' domain starts out: its `domain` prop, clamped to the limits. It's what the
     * domain is restored to when its plot's data is replaced (e.g. on a reset).
     */
    domain: [min: number, max: number]
    /**
     * The smallest value the axis' domain may reach
     */
    min: number
    /**
     * The largest value the axis' domain may reach
     */
    max: number
    /**
     * The fraction of the axis' length left beyond the data's extreme on a side that grows (so
     * the extreme point isn't drawn right on the edge), from 0 to 0.45
     */
    padding: number
}

/**
 * Clamps a domain to the auto-scaling limits, so that an auto-scaling axis never starts out past
 * them. (When the domain lies entirely beyond a limit, it collapses onto that limit.)
 * @param domain The domain
 * @param min The smallest value the domain may reach
 * @param max The largest value the domain may reach
 * @return The domain, clamped to the limits
 */
export function clampedDomain(
    domain: [min: number, max: number],
    min: number,
    max: number
): [min: number, max: number] {
    const clamp = (value: number) => Math.min(max, Math.max(min, value))
    return [clamp(domain[0]), clamp(domain[1])]
}

/**
 * Whether two auto-scaling settings are the same (`undefined` means "not auto-scaling")
 * @param a The first settings
 * @param b The second settings
 * @return `true` when they're the same; `false` otherwise
 */
export function sameAutoScale(a: AutoScale | undefined, b: AutoScale | undefined): boolean {
    if (a === undefined || b === undefined) return a === b
    return a.domain[0] === b.domain[0] && a.domain[1] === b.domain[1] &&
        a.min === b.min && a.max === b.max && a.padding === b.padding
}

/**
 * Grows an axis' domain to include the specified extent of the data, with the padding beyond it,
 * without going past the auto-scaling limits. A side grows when the data reaches into its padding
 * (not only when the data goes past the edge), so that the data always has the padding's room to
 * spare (until a limit is reached), and it grows so that the data's extreme sits exactly the
 * padding from the edge. The domain only ever grows: an extent that's within the domain, and
 * clear of its padding, leaves the domain as it is.
 *
 * The padding is applied in the scale's own space (e.g. logarithmically, for a log scale), as a
 * fraction of the axis' length.
 * @param domain The axis' current domain
 * @param extent The [min, max] of the data plotted against the axis, or `undefined` when there's
 * no data
 * @param autoScale The auto-scaling settings (the limits, and the padding)
 * @param scale The axis' scale (only its kind matters: linear, log, ...)
 * @return The grown domain (or the current domain, when there's nothing to grow for)
 */
export function grownDomain(
    domain: [min: number, max: number],
    extent: [min: number, max: number] | undefined,
    autoScale: Pick<AutoScale, 'min' | 'max' | 'padding'>,
    scale: ScaleContinuousNumeric<number, number>
): [min: number, max: number] {
    if (extent === undefined) return domain
    const [domainMin, domainMax] = domain
    const padding = Math.min(0.45, Math.max(0, autoScale.padding))

    // a side grows when the data reaches into its padding (or past its edge). Where the data sits
    // within the current domain is measured in the scale's own space, with a little tolerance, so
    // that an extreme that sits exactly the padding from the edge (as growing leaves it) doesn't
    // grow the domain again by rounding errors on every frame.
    const tolerance = 1e-9
    const current = scale.copy().domain([domainMin, domainMax]).range([0, 1])
    const growsDown = extent[0] < domainMin || current(extent[0]) < padding - tolerance
    const growsUp = extent[1] > domainMax || current(extent[1]) > 1 - padding + tolerance
    if (!growsDown && !growsUp) return domain

    let min = growsDown ? extent[0] : domainMin
    let max = growsUp ? extent[1] : domainMax
    if (padding > 0 && min < max) {
        // the normalized scale over the grown domain, extended on each growing side so that the
        // extreme sits `padding` of the (extended) axis' length from that edge: with n growing
        // sides, each extension e satisfies e / (1 + n e) = padding
        const normalized = scale.copy().domain([min, max]).range([0, 1])
        const growingSides = (growsDown ? 1 : 0) + (growsUp ? 1 : 0)
        const extension = padding / (1 - growingSides * padding)
        if (growsDown) min = normalized.invert(-extension)
        if (growsUp) max = normalized.invert(1 + extension)
    }
    // (never past the limits -- and never shrinking a side, should the domain already be past one)
    return [
        growsDown ? Math.min(domainMin, Math.max(autoScale.min, min)) : domainMin,
        growsUp ? Math.max(domainMax, Math.min(autoScale.max, max)) : domainMax,
    ]
}

/**
 * Extends an extent to include the specified value
 * @param extent The extent so far, or `undefined` when there's none yet
 * @param value The value to include
 * @return The extent, including the value
 */
export function extentWith(
    extent: [min: number, max: number] | undefined,
    value: number
): [min: number, max: number] {
    if (extent === undefined) return [value, value]
    return [Math.min(extent[0], value), Math.max(extent[1], value)]
}

/**
 * Calculates the extent (the [min, max]) of the specified values, skipping those the y-scale
 * can't show (e.g. values <= 0 on a log scale, or NaN)
 * @param values The values
 * @param yScale The y-axis' scale
 * @return The extent of the values, or `undefined` when there are none (that can be shown)
 */
export function extentOf(
    values: Iterable<number>,
    yScale: ScaleContinuousNumeric<number, number>
): [min: number, max: number] | undefined {
    let extent: [min: number, max: number] | undefined = undefined
    for (const value of values) {
        if (Number.isFinite(yScale(value))) extent = extentWith(extent, value)
    }
    return extent
}

/**
 * Calculates the extent (the [min, max] of the y-values) of a series' data that's visible within
 * the x-axis' window: the values of the points within the window, and -- when the series is drawn
 * with lines -- the lines' heights where they cross the window's left and right edges (a line from
 * a point just off screen can reach higher, or lower, within the window than any point that's on
 * screen). Values the y-scale can't show (e.g. values <= 0 on a log scale) are skipped.
 *
 * A point can have several values, each drawn as its own line across the points (e.g. an outlier
 * series' value, and its bands' lower and upper bounds), so the crossings are calculated for each.
 * They're calculated in the y-scale's own space (as the lines are drawn), so they're exact for
 * straight lines, on any kind of scale.
 * @param data The series' data, ordered by x
 * @param window The x-axis' [start, end]
 * @param yScale The y-axis' scale
 * @param withLines Whether the series is drawn with lines (rather than just points)
 * @param xOf The point's x-value (defaults to its `x`)
 * @param valuesOf The point's y-values, each drawn as its own line (defaults to its `y`)
 * @return The extent of the visible data, or `undefined` when nothing is visible
 * @template P The type of the data's points
 */
export function visibleExtent<P>(
    data: { length: number, [index: number]: P },
    window: [start: number, end: number],
    yScale: ScaleContinuousNumeric<number, number>,
    withLines: boolean,
    xOf: (point: P) => number = point => (point as { x: number }).x,
    valuesOf: (point: P) => Array<number> = point => [(point as { y: number }).y],
): [min: number, max: number] | undefined {
    const [start, end] = window
    const showable = (value: number) => Number.isFinite(yScale(value))
    // includes the heights where the lines between the two points cross x
    const withCrossings = (
        extent: [min: number, max: number] | undefined,
        from: P,
        to: P,
        x: number
    ): [min: number, max: number] | undefined => {
        const fromValues = valuesOf(from)
        const toValues = valuesOf(to)
        const fraction = xOf(to) === xOf(from) ? 1 : (x - xOf(from)) / (xOf(to) - xOf(from))
        fromValues.forEach((fromValue, index) => {
            const toValue = toValues[index]
            if (toValue === undefined || !showable(fromValue) || !showable(toValue)) return
            const fromY = yScale(fromValue)
            extent = extentWith(extent, yScale.invert(fromY + (yScale(toValue) - fromY) * fraction))
        })
        return extent
    }

    let extent: [min: number, max: number] | undefined = undefined
    let index = firstIndexAtOrAfter(data, start, xOf)

    // the lines entering through the window's left edge
    if (withLines && index > 0 && index < data.length && xOf(data[index]) <= end) {
        extent = withCrossings(extent, data[index - 1], data[index], start)
    }

    // the points within the window
    for (; index < data.length && xOf(data[index]) <= end; index++) {
        valuesOf(data[index]).forEach(value => {
            if (showable(value)) extent = extentWith(extent, value)
        })
    }

    // the lines leaving through the window's right edge (or, when no point is within the window,
    // passing straight across it)
    if (withLines && index > 0 && index < data.length && xOf(data[index - 1]) < end) {
        extent = withCrossings(extent, data[index - 1], data[index], end)
        if (xOf(data[index - 1]) < start) extent = withCrossings(extent, data[index - 1], data[index], start)
    }
    return extent
}

// the warnings already issued (each is only issued once)
const issuedWarnings = new Set<string>()

/**
 * Issues a warning to the console, once (e.g. about auto-scaling settings that are ignored)
 * @param message The warning
 */
export function warnOnce(message: string): void {
    if (issuedWarnings.has(message)) return
    issuedWarnings.add(message)
    console.warn(message)
}

/**
 * Warns (once per axis) about the auto-scaling y-axes of a plot that doesn't support auto-scaling,
 * whose `autoScale` setting is therefore ignored
 * @param plotName The name of the plot (e.g. "BarPlot")
 * @param yAxes The plot's y-axes, by their IDs
 */
export function warnAboutIgnoredAutoScale(plotName: string, yAxes: Map<string, object>): void {
    yAxes.forEach((axis, axisId) => {
        if ((axis as { autoScale?: AutoScale }).autoScale !== undefined) {
            warnOnce(`The ${plotName} doesn't support auto-scaling y-axes, so the "autoScale" setting of y-axis "${axisId}" is ignored`)
        }
    })
}
