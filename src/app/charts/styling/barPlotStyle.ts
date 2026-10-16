import type {SeriesStyle} from "../axes/axes";
import type {SvgFillStyle, SvgStrokeStyle} from "./svgStyle";
import * as d3 from "d3";

/**
 * The style of a bar series: the style of each of its bars and lines
 */
export interface BarSeriesStyle extends SeriesStyle {
    /**
     * The bar style for the lifetime min/max range bar. The style is for the width, fill,
     * and stroke.
     */
    minMaxBar: BarStyle
    /**
     * The bar style for the windowed min/max range bar. The style is for the width, fill,
     * and stroke.
     */
    windowedMinMaxBar: BarStyle
    /**
     * The line style for the current value.
     */
    valueLine: LineStyle
    /**
     * The line style for the mean value.
     */
    meanValueLine: LineStyle
    /**
     * The line style for the windowed-mean value.
     */
    windowedMeanValueLine: LineStyle
}

/**
 * The style of a bar: its width (as a fraction of the category's width), its fill, and its stroke
 */
export interface BarStyle {
    widthFraction: number
    fill: SvgFillStyle
    stroke: SvgStrokeStyle
}

/**
 * The style of a line: normally, and when highlighted
 */
export interface LineStyle {
    regular: SvgStrokeStyle
    highlight: SvgStrokeStyle
}

/**
 * The default style for the lifetime min/max bar: 65% of the category's width, a translucent fill,
 * and a thin stroke
 * @param [color="#008aad"] The bar's fill and stroke color
 * @return The bar style
 */
export function defaultMinMaxBarStyle(color: string = "#008aad"): BarStyle {
    return {
        widthFraction: 0.65,
        fill: {
            color,
            opacity: 0.4
        },
        stroke: {
            width: 1,
            opacity: 0.6,
            color,
        }
    }
}

/**
 * The default style for the windowed min/max bar: 25% of the category's width (narrower than the
 * lifetime bar, so both can be seen), filled with a slightly darker color, and no stroke
 * @param [color="#008aad"] The color to darken for the bar's fill (used as-is when it can't be parsed)
 * @return The bar style
 */
export function defaultWindowedMinMaxBarStyle(color: string = "#008aad"): BarStyle {
    return {
        widthFraction: 0.25,
        fill: {
            color: d3.color(color)?.darker(0.3).toString() ?? color,
            opacity: 0.6
        },
        stroke: {
            width: 0,
            opacity: 0,
            color: d3.color(color)?.darker(0.3).toString() ?? color,
        }
    }
}

/**
 * The default style for the current-value line: 3 pixels wide (5 when highlighted)
 * @param [color="#008aad"] The line's color
 * @return The line style
 */
export function defaultValueLineStyle(color: string = "#008aad"): LineStyle {
    return {
        regular: {
            color,
            opacity: 0.6,
            width: 3
        },
        highlight: {
            color,
            opacity: 1,
            width: 5
        }
    }
}

/**
 * The default style for the (lifetime) mean-value line: 1 pixel wide (3 when highlighted)
 * @param [color="#008aad"] The line's color
 * @return The line style
 */
export function defaultMeanValueLineStyle(color: string = "#008aad"): LineStyle {
    return {
        regular: {
            color,
            opacity: 0.6,
            width: 1
        },
        highlight: {
            color,
            opacity: 1,
            width: 3
        }
    }
}

/**
 * The default style for the windowed mean-value line: 1 pixel wide (3 when highlighted), and red
 * by default to set it apart from the other lines
 * @param [color="#ad0000"] The line's color
 * @return The line style
 */
export function defaultWindowedMeanValueLineStyle(color: string = "#ad0000"): LineStyle {
    return {
        regular: {
            color: color,
            opacity: 0.6,
            width: 1
        },
        highlight: {
            color: color,
            opacity: 1,
            width: 3
        }
    }
}

/**
 * The default style for a bar series: all the bars and lines in the specified color (see the
 * default styles above), except for the windowed min/max bar's darker fill
 * @param [color="#008aad"] The series' color
 * @return The bar series style
 */
export function defaultBarSeriesStyle(color: string = "#008aad"): BarSeriesStyle {
    return {
        color,
        highlightColor: color,
        minMaxBar: defaultMinMaxBarStyle(color),
        windowedMinMaxBar: defaultWindowedMinMaxBarStyle(color),
        valueLine: defaultValueLineStyle(color),
        meanValueLine: defaultMeanValueLineStyle(color),
        windowedMeanValueLine: defaultWindowedMeanValueLineStyle(color),
    }
}
