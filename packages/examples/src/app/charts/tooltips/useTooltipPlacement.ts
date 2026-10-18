import {type RefObject, useLayoutEffect} from "react";
import type {Dimensions, Margin} from "../styling/margins";
import {type TooltipStyle, tooltipX, tooltipY} from "./tooltipUtils";

/**
 * Where a tooltip is anchored: the mouse, when the tooltip's content was captured
 */
export type TooltipAnchor = {
    /**
     * The mouse's coordinates, relative to the chart (its canvas)
     */
    mouse: [x: number, y: number]
    /**
     * The chart's (canvas') position in the viewport, when the content was captured
     */
    canvasLeft: number
    canvasTop: number
    /**
     * Optional: the y-coordinate (relative to the chart) of the tooltip's top, given its rendered
     * height, for a tooltip that isn't placed below the mouse (e.g. one centered on a raster
     * plot's category). Defaults to {@link tooltipY}.
     */
    topFor?: (height: number) => number
}

/**
 * Positions a tooltip (a `position: fixed` element, e.g. a tooltip content's portal) next to the
 * mouse, based on its *rendered* size: after each render, measures the tooltip and sets its
 * `left` and `top` directly, before the browser paints (so the tooltip never shows in the wrong
 * place). The tooltip goes to the right of the mouse, or to the left when it would run past the
 * plot's right edge (see {@link tooltipX} and {@link tooltipY}).
 *
 * A tooltip's size depends on its content, so it can only be known once the content has been
 * rendered -- positioning it from an estimate of its size put a narrower-than-estimated tooltip
 * far from the mouse when it flipped to the mouse's left.
 * @param tooltipRef The tooltip's element
 * @param anchor Where the tooltip is anchored (the mouse), or `null` when no tooltip is shown
 * @param plotDimensions The dimensions of the plot
 * @param margin The plot margin
 * @param tooltipStyle The tooltip's style
 */
export function useTooltipPlacement(
    tooltipRef: RefObject<HTMLElement | null>,
    anchor: TooltipAnchor | null,
    plotDimensions: Dimensions,
    margin: Margin,
    tooltipStyle: TooltipStyle,
): void {
    useLayoutEffect(
        () => {
            const tooltip = tooltipRef.current
            if (tooltip === null || anchor === null) return
            // measured at the viewport's top-left corner, where nothing limits its width: a
            // `position: fixed` element near the viewport's right edge only gets the width left to
            // the edge, so its content could wrap, and it would measure narrower than it really is
            tooltip.style.left = '0px'
            tooltip.style.top = '0px'
            const {width, height} = tooltip.getBoundingClientRect()
            const [x, y] = anchor.mouse
            const left = tooltipX(x, width, plotDimensions, tooltipStyle, margin)
            const top = anchor.topFor !== undefined ?
                anchor.topFor(height) :
                tooltipY(y, height, plotDimensions, tooltipStyle, margin)
            tooltip.style.left = `${anchor.canvasLeft + left}px`
            tooltip.style.top = `${anchor.canvasTop + top}px`
        }
    )
}

/**
 * Creates a tooltip's anchor: the mouse, relative to the chart, and the chart's position in the
 * viewport
 * @param mouseCoords The mouse's coordinates, relative to the chart (its canvas)
 * @param canvas The chart's canvas
 * @param topFor Optional: the y-coordinate of the tooltip's top for its rendered height (see
 * {@link TooltipAnchor.topFor})
 * @return The anchor
 */
export function tooltipAnchorFor(
    mouseCoords: [x: number, y: number],
    canvas: HTMLCanvasElement,
    topFor?: (height: number) => number
): TooltipAnchor {
    const canvasRect = canvas.getBoundingClientRect()
    return {mouse: mouseCoords, canvasLeft: canvasRect.left, canvasTop: canvasRect.top, topFor}
}
