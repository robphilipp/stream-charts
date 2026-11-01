import type {Theme} from "./Themes.ts";
import type {CSSProperties} from "react";

/**
 * Mixes two colors (as a CSS `color-mix`)
 * @param startColor The color to start from
 * @param endColor The color to mix in
 * @param factor How much (%) of the end color to mix in
 * @return The CSS `color-mix(...)` of the two colors
 */
export function interpolateColor(
    startColor: string,
    endColor: string,
    factor: number
): string {
    return `color-mix(in srgb, ${startColor}, ${endColor} ${factor}%)`;
}

/**
 * The style of the app's buttons, from the theme: a background tinted slightly toward the text
 * color, and a border mixed mostly toward the background color
 * @param theme The theme
 * @return The button style
 */
export function buttonStyle(theme: Theme): CSSProperties {
    return {
        backgroundColor: interpolateColor(theme.backgroundColor, theme.color, 5),
        borderColor: interpolateColor(theme.color, theme.backgroundColor, 85),
        color: theme.color,
        borderRadius: 7,
        margin: 6,
    };
}
