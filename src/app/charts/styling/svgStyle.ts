import * as d3 from "d3";
import {BaseType} from "d3";

export interface SvgStyle {
    height?: string | number;
    width?: string | number;
    outline?: string;

    [propName: string]: any;
}

export const initialSvgStyle: SvgStyle = {
    width: '100%',
    // display: "inline-block",
    // position: "floating",
    top: 0,
    left: 0
};

/**
 * Grabs the client-width of the svg element, or 1 if the svg element hasn't yet
 * been initialized. The client-width is a read-only property returns the width of
 * the html element, including horizontal padding and borders, as an integer. The reason
 * that we return 1 when the svg element hasn't yet been initialized,  is so that the
 * aspect (width / height) is 1.
 * @param {SVGElement | null} svg The svg element
 * @return {number} The client width of the svg
 */
export function grabWidth(svg: SVGElement | null): number {
    return svg !== null ? svg.clientWidth : 1;
}

/**
 * Grabs the client-height of the svg element, or 1 if the svg element hasn't yet
 * been initialized. The client-height is a read-only property returns the height of
 * the html element, including vertical padding and borders, as an integer.  The reason
 * that we return 1 when the svg element hasn't yet been initialized,  is so that the
 * aspect (width / height) is 1.
 * @param {SVGElement | null} svg The svg element
 * @return {number} The client height of the svg
 */
export function grabHeight(svg: SVGElement | null): number {
    return svg !== null ? svg.clientHeight : 1;
}


export const STROKE_COLOR: string = "stroke"
export const STROKE_WIDTH: string = "stroke-width"
export const STROKE_OPACITY: string = "stroke-opacity"

export interface SvgStrokeStyle {
    readonly color: string
    readonly width: number
    readonly opacity: number
}

export function updateSvgStrokeColor(current: SvgStrokeStyle, color: string) {
    return {...current, color};
}

export function updateSvgStrokeWidth(current: SvgStrokeStyle, width: number) {
    return {...current, width};
}

export function updateSvgStrokeOpacity(current: SvgStrokeStyle, opacity: number) {
    return {...current, opacity};
}

/**
 *
 * @param style
 * @param selection
 * @template E The SVG element (e.g. SVGRectElement, SVGLineElement, etc)
 * @template D The datum type
 * @template The SVG G element
 */
export function applyStrokeStylesTo<E extends BaseType, D, G extends BaseType = SVGGElement>(
    selection: d3.Selection<E, D, G, any>,
    style: Partial<SvgStrokeStyle>
):  d3.Selection<E, D, G, any> {
    if (style.color !== undefined) selection.style(STROKE_COLOR, style.color)
    if (style.width !== undefined) selection.style(STROKE_WIDTH, style.width)
    if (style.opacity !== undefined) selection.style(STROKE_OPACITY, style.opacity)
    return selection
}

const FILL_COLOR: string = "fill"
const FILL_OPACITY: string = "fill-opacity"

export interface SvgFillStyle {
    readonly color: string
    readonly opacity: number
}

export function updateSvgFillColor(current: SvgFillStyle, color: string): SvgFillStyle {
    return {...current, color}
}

export function updateSvgFillOpacity(current: SvgFillStyle, opacity: number): SvgFillStyle {
    return {...current, opacity}
}

/**
 *
 * @param style
 * @param selection
 * @template E The SVG element (e.g. SVGRectElement, SVGLineElement, etc)
 * @template D The datum type
 * @template The SVG G element
 */
export function applyFillStylesTo<E extends BaseType, D, G extends BaseType = SVGGElement>(
    selection: d3.Selection<E, D, G, any>,
    style: Partial<SvgFillStyle>
):  d3.Selection<E, D, G, any> {
    if (style.color !== undefined) selection.style(FILL_COLOR, style.color)
    if (style.opacity !== undefined) selection.style(FILL_OPACITY, style.opacity)
    return selection
}
