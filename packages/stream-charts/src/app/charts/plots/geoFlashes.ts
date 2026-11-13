import type {GeoDatum} from "../series/geoSeries"

/*
    The flashes of a GeoPlot's new events: which flash, and how (see the plot's `flash`), each
    flash's ring as it ages, and the flashes drawn as one.
 */

/**
 * How a {@link GeoPlot}'s new events flash as they arrive (see its `flash`): each new event's ring, in
 * its marker's color, grows from it and fades -- e.g. to show where something just happened (a phone
 * just located, a sensor just reporting). Flashes show in every mode, so a roll-up's aggregates flash
 * as their events arrive, too. The plot redraws up to 60 times a second while any ring shows.
 * @template P The type of the events' payload
 */
export interface GeoFlashOptions<P> {
    /**
     * How long (ms) each flash lasts
     */
    duration: number
    /**
     * The radius (px, at the view's center) a flash's ring grows to. A ring is a circle on the earth,
     * like the markers, so the projection shapes it as it shapes them (e.g. flattened toward a
     * globe's edge). Defaults to 20.
     */
    radius?: number
    /**
     * Which new events flash, and how (e.g. only one series'); all of them, once each, when not set.
     * @param datum The event
     * @param seriesName The name of the event's series
     * @return `true` to flash the event once, at its place, as these options say; `false` not to
     * flash it; or its flashes (see {@link GeoFlash}), each of which can have a place, radius,
     * duration, and color of its own -- e.g. a second, smaller and shorter flash somewhere else the
     * event is about (an estimated location's true place, say)
     */
    which?: (datum: GeoDatum<P>, seriesName: string) => boolean | ReadonlyArray<GeoFlash>
    /**
     * Flashes of the same color and length that start within one flash's length of each other, and
     * this close (px) to each other on the screen, are drawn as one ring, wider the more flashes it
     * stands for -- so that a place with many new events (e.g. a city, seen from afar) pulses
     * steadily, one ring at a time, rather than flashing ring over ring. Defaults to 20; 0 never
     * merges them.
     */
    mergeDistance?: number
}

/**
 * A flash of a new event (see {@link GeoFlashOptions}' `which`): where, how large, how long, and in
 * what color its ring is. Anything not set is the event's: its place, the flash options' `radius`
 * and `duration`, and its marker's color.
 */
export interface GeoFlash {
    /**
     * The latitude (degrees) of the flash's center. Defaults to the event's.
     */
    latitude?: number
    /**
     * The longitude (degrees) of the flash's center. Defaults to the event's.
     */
    longitude?: number
    /**
     * The radius (px, at the view's center) the flash's ring grows to. Defaults to the flash
     * options' `radius`.
     */
    radius?: number
    /**
     * How long (ms) the flash lasts. Defaults to the flash options' `duration`.
     */
    duration?: number
    /**
     * The color of the flash's ring. Defaults to the event's marker's color.
     */
    color?: string
}

/**
 * A flash, with everything set (see {@link GeoFlash})
 */
export type ResolvedGeoFlash = {
    latitude: number
    longitude: number
    radius: number
    duration: number
    color: string | undefined
}

/**
 * The flashes of a new event, from what the flash options' `which` says of it
 * @param spec Whether the event flashes (`true`, once, as the plot's settings say; `false`, not at
 * all), or its flashes (none, for an empty list)
 * @param datum The event
 * @param defaults The plot's flash radius (px) and duration (ms)
 * @return The event's flashes, with everything that isn't set taken from the event and the defaults
 * (the color, from the event's marker, is left `undefined`); none for a flash with a place that isn't
 * a finite latitude and longitude
 */
export function resolvedFlashes(
    spec: boolean | ReadonlyArray<GeoFlash>,
    datum: {latitude: number, longitude: number},
    defaults: {radius: number, duration: number},
): Array<ResolvedGeoFlash> {
    const flashes = spec === true ? [{}] : spec === false ? [] : spec
    return flashes
        .map(flash => ({
            latitude: flash.latitude ?? datum.latitude,
            longitude: flash.longitude ?? datum.longitude,
            radius: flash.radius ?? defaults.radius,
            duration: flash.duration ?? defaults.duration,
            color: flash.color,
        }))
        .filter(flash => Number.isFinite(flash.latitude) && Number.isFinite(flash.longitude) && flash.duration > 0)
}

/**
 * A flash's ring at an age: it grows from the marker outward, quickly at first and then more slowly,
 * fading as it grows, until it's gone
 * @param age How long (ms) since the flash started (its event arrived)
 * @param duration How long (ms) a flash lasts
 * @param radius The radius (px) the ring grows to
 * @return The ring's radius (px) and opacity (0 to 1), or `undefined` before the flash starts and
 * once it's over
 */
export function flashRingOf(age: number, duration: number, radius: number): {radius: number, opacity: number} | undefined {
    if (!(age >= 0 && age < duration)) return undefined
    const t = age / duration
    // (eased out: 1 - (1 - t)^2)
    const grown = 1 - (1 - t) * (1 - t)
    return {radius: 2 + (radius - 2) * grown, opacity: 1 - t}
}

/**
 * Groups flashes that would be drawn as one: of the same color and length, starting within the same
 * stretch of time as long as one of them, and centered in the same `distance`-pixel square of the
 * screen -- e.g. a city's many new events, seen from far away. Drawn as one ring each, a place's
 * flashes pulse steadily, one ring at a time (or two, as one fades and the next starts), however
 * many new events it has.
 * @param flashes The flashes: where they're drawn (px), when they started, how long they last (ms),
 * and their color
 * @param distance The size (px) of the squares; 0 (or less) not to group them
 * @return The groups, each one flash or more
 * @template T The type of the flashes
 */
export function flashGroupsOf<T extends {x: number, y: number, start: number, duration: number, color: string}>(
    flashes: ReadonlyArray<T>,
    distance: number,
): Array<Array<T>> {
    if (!(distance > 0)) return flashes.map(flash => [flash])
    const groups = new Map<string, Array<T>>()
    flashes.forEach(flash => {
        const stretch = Math.floor(flash.start / flash.duration)
        const key = `${flash.color}|${flash.duration}|${Math.floor(flash.x / distance)}|${Math.floor(flash.y / distance)}|${stretch}`
        const group = groups.get(key)
        if (group === undefined) groups.set(key, [flash])
        else group.push(flash)
    })
    return Array.from(groups.values())
}
