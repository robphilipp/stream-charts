//
// policy for when to drop old data from long-running charts. recall that the data is
// streamed in at a specified interval, and so the data builds up over time.
//
import {Optional} from "result-fn";

export const DROP_AFTER_10_SEC: unique symbol = Symbol("Drop after 10 s")
export const DROP_AFTER_20_SEC: unique symbol = Symbol("Drop after 20 s")
export const DROP_AFTER_50_SEC: unique symbol = Symbol("Drop after 50 s")
export const DROP_AFTER_100_SEC: unique symbol = Symbol("Drop after 100 s")
export const KEEP_ALL: unique symbol = Symbol("Keep All")

export type DropAfterOptions = typeof DROP_AFTER_10_SEC | typeof DROP_AFTER_20_SEC | typeof DROP_AFTER_50_SEC | typeof DROP_AFTER_100_SEC | typeof KEEP_ALL

// map of option to milliseconds
export const DROP_DATA_OPTIONS: Map<DropAfterOptions, number> = new Map<DropAfterOptions, number>([
    [DROP_AFTER_10_SEC, 10_000],
    [DROP_AFTER_20_SEC, 20_000],
    [DROP_AFTER_50_SEC, 50_000],
    [DROP_AFTER_100_SEC, 100_000],
    [KEEP_ALL, Infinity]
])

// map of option description to milliseconds
export const DROP_DATA_AFTER_MS: Map<string, number> = new Map<string, number>(
    Array.from(DROP_DATA_OPTIONS.entries())
        .map(([option, value]) => [option.description!, value])
)

// map of option description to option
export const DROP_DATA_AFTER_OPTIONS_NAME: Map<string, DropAfterOptions> = new Map<string, DropAfterOptions>(
    Array.from(DROP_DATA_OPTIONS.entries())
        .map(([option,]) => [option.description!, option])
)

// map of option milliseconds to option
export const DROP_DATA_AFTER_OPTION_MS: Map<number, DropAfterOptions> = new Map<number, DropAfterOptions>(
    Array.from(DROP_DATA_OPTIONS.entries())
        .map(([option, value]) => [value, option])
)

/**
 * @param description The option description
 * @return An {@link Optional} holding the drop-data option for the given description, or an
 * empty {@link Optional} if no such option exists
 */
export function dropDataOptionForDescription(description: string): Optional<DropAfterOptions> {
    return Optional.ofNullable(DROP_DATA_AFTER_OPTIONS_NAME.get(description))
}

/**
 * @param ms The option milliseconds
 * @return An {@link Optional} holding the drop-data option for the given milliseconds, or an
 * empty {@link Optional} if no such option exists
 */
export function dropDataOptionForMs(ms: number): Optional<DropAfterOptions> {
    return Optional.ofNullable(DROP_DATA_AFTER_OPTION_MS.get(ms))
}

export const DEFAULT_DROP_AFTER_10: [name: string, value: number] = Array.from(DROP_DATA_AFTER_MS.entries())[0]
export const DEFAULT_DROP_AFTER_20: [name: string, value: number] = Array.from(DROP_DATA_AFTER_MS.entries())[1]
export const DEFAULT_DROP_AFTER_50: [name: string, value: number] = Array.from(DROP_DATA_AFTER_MS.entries())[2]
export const DEFAULT_DROP_AFTER_100: [name: string, value: number] = Array.from(DROP_DATA_AFTER_MS.entries())[3]
