// Canvas equivalents of the stroke/fill helpers that used to live in svgStyle.ts. The old versions
// mutated a *persistent* SVG element's CSS style (`selection.style('stroke', ...)`), so it stuck
// around until changed again. Canvas has no persistent elements -- `ctx.strokeStyle`/`ctx.fillStyle`
// /`ctx.lineWidth` are transient 2D-context state that only affects the *next* stroke()/fill() call,
// so these must be (re-)applied immediately before every draw, every frame.
//
// IMPORTANT DIFFERENCE FROM SVG: canvas has a single `ctx.globalAlpha` shared between stroke and
// fill, unlike SVG's independent `stroke-opacity`/`fill-opacity`. If a shape needs different
// stroke and fill opacity in the same draw call, bake the opacity into the color string with
// `withAlpha(...)` instead of relying on `globalAlpha` for one of them.

import * as d3 from "d3"

/**
 * The style of a stroke (a line, or a shape's outline)
 */
export interface CanvasStrokeStyle {
    readonly color: string
    readonly width: number
    readonly opacity: number
}

/**
 * @param current The stroke style
 * @param color The new color
 * @return A copy of the stroke style with the new color
 */
export function updateStrokeColor(current: CanvasStrokeStyle, color: string): CanvasStrokeStyle {
    return {...current, color}
}

/**
 * @param current The stroke style
 * @param width The new width (in pixels)
 * @return A copy of the stroke style with the new width
 */
export function updateStrokeWidth(current: CanvasStrokeStyle, width: number): CanvasStrokeStyle {
    return {...current, width}
}

/**
 * @param current The stroke style
 * @param opacity The new opacity, from 0 (transparent) to 1 (opaque)
 * @return A copy of the stroke style with the new opacity
 */
export function updateStrokeOpacity(current: CanvasStrokeStyle, opacity: number): CanvasStrokeStyle {
    return {...current, opacity}
}

/**
 * Applies a stroke style to the canvas context. Call this immediately before `ctx.stroke()` --
 * unlike the old SVG version, the effect is not persistent.
 * @param context The canvas 2D context to apply the style to
 * @param style The (partial) stroke style to apply; unset fields are left untouched on `ctx`
 * @return `ctx`, for chaining
 */
export function applyStrokeStyle(context: CanvasRenderingContext2D, style: Partial<CanvasStrokeStyle>): CanvasRenderingContext2D {
    if (style.color !== undefined) context.strokeStyle = style.color
    if (style.width !== undefined) context.lineWidth = style.width
    if (style.opacity !== undefined) context.globalAlpha = style.opacity
    return context
}

/**
 * The style of a (shape's) fill
 */
export interface CanvasFillStyle {
    readonly color: string
    readonly opacity: number
}

/**
 * @param current The fill style
 * @param color The new color
 * @return A copy of the fill style with the new color
 */
export function updateFillColor(current: CanvasFillStyle, color: string): CanvasFillStyle {
    return {...current, color}
}

/**
 * @param current The fill style
 * @param opacity The new opacity, from 0 (transparent) to 1 (opaque)
 * @return A copy of the fill style with the new opacity
 */
export function updateFillOpacity(current: CanvasFillStyle, opacity: number): CanvasFillStyle {
    return {...current, opacity}
}

/**
 * Applies a fill style to the canvas context. Call this immediately before `ctx.fill()`/
 * `ctx.fillText()`/`ctx.fillRect()` -- unlike the old SVG version, the effect is not persistent.
 * @param context The canvas 2D context to apply the style to
 * @param style The (partial) fill style to apply; unset fields are left untouched on `ctx`
 * @return `ctx`, for chaining
 */
export function applyFillStyle(context: CanvasRenderingContext2D, style: Partial<CanvasFillStyle>): CanvasRenderingContext2D {
    if (style.color !== undefined) context.fillStyle = style.color
    if (style.opacity !== undefined) context.globalAlpha = style.opacity
    return context
}

/**
 * Bakes an opacity into a color string by resolving it to `rgba(...)`. Needed because canvas has
 * a single `globalAlpha` shared between stroke and fill (see the module-level note above); when a
 * shape needs independent stroke and fill opacity, use this to bake opacity into the color passed
 * to {@link applyStrokeStyle}/{@link applyFillStyle} instead of setting `opacity` on both.
 *
 * Uses `d3.color(...)` (already the project's convention for this elsewhere -- see `Legend.tsx`,
 * `barPlotStyle.ts`) rather than the previous approach of assigning `color` to a single
 * module-level, lazily-created `<canvas>` context's `fillStyle` and reading back the browser's
 * normalized value: assigning an unparseable CSS string to `fillStyle` is a silent no-op per the
 * Canvas 2D spec, so an invalid `color` would have silently resolved to whatever the *previous,
 * unrelated* `withAlpha` call (from any chart/tooltip/legend on the page, since the context was a
 * single shared singleton) happened to leave `fillStyle` at -- order-dependent and effectively
 * nondeterministic. `d3.color` instead returns `null` for unparseable input, so an invalid color
 * falls through to the same "fall back to the original string" behavior this always had for the
 * "no canvas 2d support" case, deterministically, with no shared state at all.
 * @param color Any valid CSS color string (named, hex, rgb, rgba, hsl, etc)
 * @param opacity The opacity to bake in, from 0 (transparent) to 1 (opaque)
 * @return An `rgba(...)` string equivalent to `color` at the given `opacity`
 */
export function withAlpha(color: string, opacity: number): string {
    const parsed = d3.color(color)
    if (parsed === null) {
        // unparseable color string; nothing sensible to bake an opacity into
        return color
    }
    const {r, g, b} = parsed.rgb()
    return `rgba(${r}, ${g}, ${b}, ${opacity})`
}
