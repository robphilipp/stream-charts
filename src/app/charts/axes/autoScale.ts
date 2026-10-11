/**
 * The auto-scaling settings of a (y-) axis whose domain grows to fit the data plotted against it
 * (see `ContinuousAxis`'s `autoScale`, `autoScaleMin`, and `autoScaleMax` props)
 */
export type AutoScale = {
    /**
     * The axis' own domain (its `domain` prop): where the axis starts out, and what it's restored
     * to when its plot's data is replaced (e.g. on a reset)
     */
    domain: [min: number, max: number]
    /**
     * The smallest value the axis' domain may grow down to
     */
    min: number
    /**
     * The largest value the axis' domain may grow up to
     */
    max: number
}

/**
 * Grows an axis' domain to include the specified extent of the data, without growing past the
 * auto-scaling limits. The domain only ever grows: an extent that's within the domain leaves the
 * domain as it is.
 * @param domain The axis' current domain
 * @param extent The [min, max] of the data plotted against the axis, or `undefined` when there's
 * no data
 * @param min The smallest value the domain may grow down to
 * @param max The largest value the domain may grow up to
 * @return The grown domain (or the current domain, when there's nothing to grow for)
 */
export function grownDomain(
    domain: [min: number, max: number],
    extent: [min: number, max: number] | undefined,
    min: number,
    max: number
): [min: number, max: number] {
    if (extent === undefined) return domain
    const [domainMin, domainMax] = domain
    const [extentMin, extentMax] = extent
    // (a side only ever grows: when the domain already reaches past a limit, the limit leaves it be)
    return [
        Math.min(domainMin, Math.max(min, extentMin)),
        Math.max(domainMax, Math.min(max, extentMax)),
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
