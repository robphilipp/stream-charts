/**
 * The possible toggle states
 * Note: replaces enums to support `erasableSyntaxOnly`
 *  TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.
 */
export const ToggleStatus = {
    ON: "ON",
    OFF: "OFF"
} as const
export type ToggleStatus = typeof ToggleStatus[keyof typeof ToggleStatus]

