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


