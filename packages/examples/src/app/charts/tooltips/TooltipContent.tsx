import {type CSSProperties, type ReactElement, type ReactNode, useEffect, useMemo, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {useChart} from "../hooks/useChart";
import {usePlotDimensions} from "../hooks/usePlotDimensions";
import type {TooltipData} from "../hooks/useTooltip";
import type {BaseAxis, SeriesStyle} from "../axes/axes";
import type {BaseAxisRange} from "../axes/BaseAxisRange";
import {withAlpha} from "../styling/canvasStyle";
import type {TooltipStyle} from "./tooltipUtils";
import {tooltipAnchorFor, type TooltipAnchor, useTooltipPlacement} from "./useTooltipPlacement";
import {useTooltipStyle} from "./useTooltipStyle";

/**
 * Turns what the plot hands the tooltip about the element under the mouse into the content to show
 * (any value you like), or `undefined` to show nothing.
 * @param seriesName The name of the series under the mouse
 * @param time A value that depends on the plot: usually the time under the mouse (see the plot's
 * documentation)
 * @param tooltipData The series' data, and the plot's metadata about the element under the mouse
 * @param providerId Which kind of element is under the mouse, for a plot that has several (e.g. the
 * bar plot)
 * @return The tooltip's content, or `undefined` to show no tooltip
 * @template D The type of the series' datum
 * @template M The type of the plot's tooltip metadata
 * @template C The type of the tooltip's content
 */
export type TooltipCapture<D, M, C> = (
    seriesName: string,
    time: number,
    tooltipData: TooltipData<D, M>,
    providerId?: string
) => C | undefined

/**
 * The properties of the {@link TooltipContent}
 * @template D The type of the series' datum
 * @template M The type of the plot's tooltip metadata
 * @template C The type of the tooltip's content
 */
export interface TooltipContentProps<D, M, C> {
    /**
     * Turns what the plot hands the tooltip into the tooltip's content. Called on every mouse move
     * over an element, so keep it quick -- and copy what you need out of the series, which the data
     * source keeps changing.
     */
    capture: TooltipCapture<D, M, C>
    /**
     * Renders the content (inside the tooltip's box)
     * @param content The content returned by `capture`
     * @param style The tooltip's style
     * @return What to show in the tooltip's box
     */
    children: (content: C, style: TooltipStyle) => ReactNode
    /**
     * Overrides of the style of the enclosing {@link Tooltip}
     */
    style?: Partial<TooltipStyle>
    /**
     * Additional CSS for the tooltip's box (e.g. its line height)
     */
    boxStyle?: CSSProperties
    /**
     * Where the tooltip's top goes (relative to the chart), given its content and its rendered
     * height -- for a tooltip that isn't placed below the mouse (e.g. one centered on a raster
     * plot's row). By default, the tooltip goes just below the mouse.
     */
    topFor?: (content: C, height: number) => number
}

/**
 * The building block of every tooltip's content. Put a component built on it inside a
 * {@link Tooltip}, and when the mouse moves over one of the plot's elements, it calls `capture` with
 * what the plot knows about that element, and shows what `children` renders, in a box next to the
 * mouse (styled like the enclosing `<Tooltip>`). It hides again when the mouse leaves the element.
 *
 * Under the hood, it registers the chart's tooltip-content provider (one per chart: registering
 * replaces the previous one), and a mouse-leave handler, and renders its box as a React portal on
 * the page's `body`, which {@link useTooltipPlacement} places next to the mouse once it's rendered
 * (and so its size is known).
 * @example
 * function MyScatterTooltip(): JSX.Element {
 *     return (
 *         <TooltipContent<Datum, ScatterTooltipMetadata, {seriesName: string, count: number}>
 *             capture={(seriesName, _time, {series}) => ({seriesName, count: series.length})}
 *         >
 *             {({seriesName, count}) => <div>{seriesName}: {count} points</div>}
 *         </TooltipContent>
 *     )
 * }
 * @param props The capture and render functions, and the style
 * @return The tooltip's box (a portal), or `null` when nothing is hovered
 * @template D The type of the series' datum
 * @template M The type of the plot's tooltip metadata
 * @template C The type of the tooltip's content
 */
export function TooltipContent<D, M, C>(props: TooltipContentProps<D, M, C>): ReactElement | null {
    const {capture, children, style, boxStyle, topFor} = props

    const {chartId, canvas, tooltip, mouse} = useChart<D, SeriesStyle, M, BaseAxisRange, BaseAxis>()
    const {registerTooltipContentProvider} = tooltip
    const {registerMouseLeaveHandler, unregisterMouseLeaveHandler} = mouse
    const {margin, plotDimensions} = usePlotDimensions()

    const enclosingStyle = useTooltipStyle()
    const tooltipStyle = useMemo<TooltipStyle>(() => ({...enclosingStyle, ...style}), [enclosingStyle, style])

    // what's shown, and where (null when nothing is hovered)
    const [shown, setShown] = useState<{ content: C, anchor: TooltipAnchor } | null>(null)
    const tooltipRef = useRef<HTMLDivElement>(null)

    // the latest capture and placement functions, so that the registered provider always uses the
    // current ones without having to be registered again whenever they change
    const captureRef = useRef(capture)
    const topForRef = useRef(topFor)
    useEffect(() => {
        captureRef.current = capture
        topForRef.current = topFor
    })

    // the plot calls the provider whenever the mouse is over one of its elements
    useEffect(
        () => {
            if (canvas === null) return
            registerTooltipContentProvider((seriesName, time, tooltipData, mouseCoords, providerId) => {
                const content = captureRef.current(seriesName, time, tooltipData, providerId)
                if (content === undefined) {
                    setShown(null)
                    return
                }
                const placeTop = topForRef.current
                const anchor = tooltipAnchorFor(
                    mouseCoords, canvas,
                    placeTop !== undefined ? height => placeTop(content, height) : undefined
                )
                setShown({content, anchor})
            })
        },
        [canvas, registerTooltipContentProvider]
    )

    // hides the tooltip when the mouse leaves the element
    useEffect(
        () => {
            const handlerId = `tooltip-content-leave-${chartId}`
            registerMouseLeaveHandler(handlerId, () => setShown(null))
            return () => unregisterMouseLeaveHandler(handlerId)
        },
        [chartId, registerMouseLeaveHandler, unregisterMouseLeaveHandler]
    )

    // places the tooltip next to the mouse, once it's rendered (and so its size is known)
    useTooltipPlacement(tooltipRef, shown?.anchor ?? null, plotDimensions, margin, tooltipStyle)

    if (shown === null) return null

    const tooltipBoxStyle: CSSProperties = {
        position: 'fixed',
        // (placed next to the mouse, from its rendered size, by `useTooltipPlacement`, before it's
        // painted)
        left: 0,
        top: 0,
        backgroundColor: withAlpha(tooltipStyle.backgroundColor, tooltipStyle.backgroundOpacity),
        border: `${tooltipStyle.borderWidth}px solid ${withAlpha(tooltipStyle.borderColor, tooltipStyle.borderOpacity)}`,
        borderRadius: tooltipStyle.borderRadius,
        padding: `${tooltipStyle.paddingTop}px ${tooltipStyle.paddingRight}px ${tooltipStyle.paddingBottom}px ${tooltipStyle.paddingLeft}px`,
        fontFamily: tooltipStyle.fontFamily,
        fontSize: tooltipStyle.fontSize,
        color: tooltipStyle.fontColor,
        pointerEvents: 'none',
        zIndex: 9999,
        ...boxStyle,
    }
    return createPortal(
        <div ref={tooltipRef} style={tooltipBoxStyle}>{children(shown.content, tooltipStyle)}</div>,
        document.body
    )
}
