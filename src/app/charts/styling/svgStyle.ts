/**
 * CSS style properties for the chart's container element (the canvas -- named for the SVG
 * element it used to be)
 */
export interface SvgStyle {
    height?: string | number;
    width?: string | number;
    outline?: string;

    [propName: string]: string | number | undefined;
}

/**
 * The default container style: full width, anchored at the top left
 */
export const initialSvgStyle: SvgStyle = {
    width: '100%',
    top: 0,
    left: 0
}

/**
 * The style of a stroke (used by the bar plot's styles)
 */
export interface SvgStrokeStyle {
    readonly color: string
    readonly width: number
    readonly opacity: number
}

/**
 * The style of a fill (used by the bar plot's styles)
 */
export interface SvgFillStyle {
    readonly color: string
    readonly opacity: number
}
