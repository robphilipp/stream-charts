import type {LegendStyle} from "./Legend.tsx";

/**
 * The location of the legend, either in the plot or in an external container
 * Note: replaces enums to support `erasableSyntaxOnly`
 *  TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.
 */
export const LegendLocation = {
    // noinspection JSUnusedGlobalSymbols
    TOP_LEFT: "top-left",
    TOP_RIGHT: "top-right",
    BOTTOM_LEFT: "bottom-left",
    BOTTOM_RIGHT: "bottom-right",
    EXTERNAL_CONTAINER: "external-container"
} as const
export type LegendLocation = (typeof LegendLocation)[keyof typeof LegendLocation];

/**
 * The legend's default style
 */
export const defaultLegendStyle: LegendStyle = {
    fontSize: 12,
    fontFamily: "sans-serif",
    fontColor: "#d2933f",
    backgroundColor: "#202020",
    backgroundOpacity: 0.85,
    borderColor: "#d2933f",
    borderWidth: 1,
    borderOpacity: 0.7,
    borderRadius: 4,
    padding: 8,
    rowGap: 6,
    swatchWidth: 16,
    swatchHeight: 3,
    swatchLabelGap: 6,
    transitionDuration: 350,
}