import type {Theme} from "./Themes.ts";
import React, {type CSSProperties, type JSX, useEffect, useLayoutEffect, useRef, useState} from "react";

type Location = {
    // offset from the top or bottom of the screen
    offsetFrom: "top" | "bottom"
    // the offset in pixels
    offset: number
}

type FloatingNavigationStyle = CSSProperties & Partial<Theme> & {
    boxShadowColor?: string,
    borderColor?: string
}

type Props = {
    location?: Location
    style: FloatingNavigationStyle
    children: JSX.Element
    /**
     * Optional content for a panel that expands below the bar's controls (e.g. a table of
     * contents). The panel is as wide as the bar (its content never widens the bar).
     */
    panel?: JSX.Element
    /**
     * Whether the panel is expanded. The panel is controlled by the parent, which also supplies
     * the control that toggles it (e.g. a button among the bar's children).
     */
    panelExpanded?: boolean
    /**
     * Called when the bar wants to collapse its expanded panel by itself: `autoCollapseDelay`
     * after the mouse leaves the bar (unless the mouse comes back in the meantime), like the
     * expandable control bar
     */
    onPanelCollapse?: () => void
    /**
     * How long (in milliseconds) after the mouse leaves the bar that it collapses its expanded
     * panel. Defaults to 500 ms (the same as the expandable control bar's).
     */
    autoCollapseDelay?: number
}

/**
 * A floating navigation bar that can be dragged and repositioned. Initial position is
 * determined by the `location` prop, which can be either "top" or "bottom" with the
 * offset from that location. The `location` prop can be used to adjust the initial
 * position of the navigation bar.
 *
 * The bar can also have a panel that expands below its controls (see the `panel` prop), which
 * animates open and closed like the expandable control bar: it grows to its content's height while
 * the content fades in, and the reverse when it collapses.
 * @param props The bar's initial location, its style, its controls (the children), and its
 * (optional) panel: the panel's content, whether it's expanded, the handler for collapsing it, and
 * how soon after the mouse leaves the bar that it collapses
 * @return A floating navigation bar
 */
export function FloatingBar(props: Props): JSX.Element {
    const {
        location = {offsetFrom: "bottom", offset: 20},
        style,
        children,
        panel,
        panelExpanded = false,
        onPanelCollapse,
        autoCollapseDelay = 500,
    } = props

    const {
        disabledBackgroundColor,
        boxShadowColor = disabledBackgroundColor || "none",
        borderColor = disabledBackgroundColor || "none",
    } = style

    const navRef = useRef<HTMLDivElement>(null)
    const dragStateRef = useRef<{
        pointerId: number
        startX: number
        startY: number
        startOffsetX: number
        startOffsetY: number
    } | null>(null)
    const [offset, setOffset] = useState<{x: number, y: number}>({x: 0, y: 0})
    const [isDragging, setIsDragging] = useState<boolean>(false)
    const [mouseInBounds, setMouseInBounds] = useState<boolean>(false)

    // the panel's content height (for animating the panel open, like the expandable control bar)
    const panelContentRef = useRef<HTMLDivElement>(null)
    const [panelContentHeight, setPanelContentHeight] = useState<number>(0)
    const collapseTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    useLayoutEffect(
        () => {
            const element = panelContentRef.current
            if (element === null) return
            const updateHeight = () => setPanelContentHeight(element.scrollHeight)
            updateHeight()
            const observer = new ResizeObserver(updateHeight)
            observer.observe(element)
            return () => observer.disconnect()
        },
        [panel]
    )

    // a pending auto-collapse is dropped once the panel collapses (or the bar unmounts)
    useEffect(
        () => {
            if (!panelExpanded) return
            return () => clearTimeout(collapseTimeoutRef.current)
        },
        [panelExpanded]
    )

    function handleMouseEnter(): void {
        clearTimeout(collapseTimeoutRef.current)
        setMouseInBounds(true)
    }

    function handleMouseLeave(): void {
        setMouseInBounds(false)
        if (panelExpanded && onPanelCollapse !== undefined) {
            clearTimeout(collapseTimeoutRef.current)
            collapseTimeoutRef.current = setTimeout(onPanelCollapse, autoCollapseDelay)
        }
    }

    function beginDrag(event: React.PointerEvent<HTMLDivElement>): void {
        if (event.button !== 0) {
            return
        }

        const target = event.target
        if (target instanceof Element && target.closest("button")) {
            return
        }

        // React delivers events from a portal to the portal's React ancestors, so a press in a
        // child's portaled content (e.g. a drop-down's open list, which is rendered into the
        // document body) reaches this handler too. Only presses on the bar itself start a drag:
        // otherwise the pointer capture below would retarget the press's click to the bar, and
        // the portaled content (e.g. the drop-down option) would never receive it.
        if (!(target instanceof Node) || !event.currentTarget.contains(target)) {
            return
        }

        dragStateRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startOffsetX: offset.x,
            startOffsetY: offset.y,
        }
        setIsDragging(true)
        event.currentTarget.setPointerCapture(event.pointerId)
    }

    function updateDrag(event: React.PointerEvent<HTMLDivElement>): void {
        const dragState = dragStateRef.current
        if (!dragState || dragState.pointerId !== event.pointerId) {
            return
        }

        setOffset({
            x: dragState.startOffsetX + (event.clientX - dragState.startX),
            y: dragState.startOffsetY + (event.clientY - dragState.startY),
        })
    }

    function endDrag(event: React.PointerEvent<HTMLDivElement>): void {
        const dragState = dragStateRef.current
        if (!dragState || dragState.pointerId !== event.pointerId) {
            return
        }

        dragStateRef.current = null
        setIsDragging(false)

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
        }
    }

    return <div
        ref={navRef}
        onPointerDown={beginDrag}
        onPointerMove={updateDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onMouseOver={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={navStyle({boxShadowColor, borderColor}, location, offset.x, offset.y, isDragging, mouseInBounds, panelExpanded)}
    >
        <div style={{display: "flex", alignItems: "center", gap: 5}}>
            <div style={{
                cursor: "grab",
                display: "flex",
                flexDirection: "column",
                gap: "2px",
                touchAction: "none",
            }}>
                <div style={{width: "12px", height: "2px", backgroundColor: style.color, borderRadius: "1px"}}/>
                <div style={{width: "12px", height: "2px", backgroundColor: style.color, borderRadius: "1px"}}/>
                <div style={{width: "12px", height: "2px", backgroundColor: style.color, borderRadius: "1px"}}/>
            </div>
            {children}
        </div>
        {panel !== undefined &&
            // (`width: 0` with `minWidth: 100%` makes the panel exactly as wide as the bar, without
            // its content ever widening the bar)
            <div style={{
                width: 0,
                minWidth: "100%",
                maxHeight: panelExpanded ? panelContentHeight : 0,
                opacity: panelExpanded ? 1 : 0,
                overflow: "hidden",
                borderTop: `1px solid ${panelExpanded ? borderColor : "transparent"}`,
                marginTop: panelExpanded ? 6 : 0,
                transition: "max-height 260ms ease, opacity 180ms ease, border-top-color 180ms ease, margin-top 260ms ease",
            }}>
                <div ref={panelContentRef}>
                    {panel}
                </div>
            </div>
        }
    </div>
}

/**
 * The floating bar's style: fixed, horizontally centered (then moved by the drag offset), at the
 * location's offset from the top or the bottom of the window, styled like a pill (less rounded
 * while its panel is expanded) that's translucent and lies flat (with a border) until the mouse
 * is over it, when it's opaque and lifted (with a drop shadow); the passed-in style overrides it all
 * @param style The bar's style (and theme colors)
 * @param location Where the bar is: its offset from the top or the bottom of the window
 * @param [x=0] How far (px) the bar has been dragged horizontally
 * @param [y=0] How far (px) the bar has been dragged vertically
 * @param [isDragging=false] Whether the bar is being dragged (for the cursor)
 * @param [mouseInBounds=false] Whether the mouse is over the bar
 * @param [panelExpanded=false] Whether the bar's panel is expanded
 * @return The bar's style
 */
function navStyle(
    style: FloatingNavigationStyle,
    location: Location,
    x: number = 0,
    y: number = 0,
    isDragging: boolean = false,
    mouseInBounds: boolean = false,
    panelExpanded: boolean = false
): CSSProperties {
    const dynamicStyle: CSSProperties = {
        transform: `translate3d(calc(-50% + ${x}px), ${y}px, 0)`,
        cursor: isDragging ? "grabbing" : "grab",

        /* Floating pill styling */
        background: style.backgroundColor,
        opacity: mouseInBounds ? 1 : 0.8,
        backdropFilter: mouseInBounds ? "blur(10px)" : "blur(4px)",
        boxShadow: mouseInBounds ? `0 10px 25px ${style.boxShadowColor}` : "none",
        border: mouseInBounds ? "none" : `1px solid ${style.borderColor}`,
    }
    const baseStyle: CSSProperties = {
        position: "fixed",
        left: "50%",
        zIndex: 1000, /* Keeps it on top of other content */
        userSelect: "none",
        touchAction: "none",

        // the bar's controls, with the (expandable) panel below them
        display: "flex",
        flexDirection: "column",

        /* Floating pill styling (with less rounded corners while the panel is expanded) */
        padding: "7px 20px 7px 15px",
        borderRadius: panelExpanded ? 20 : 50,
        transition: "border-radius 260ms ease",
    }
    switch (location.offsetFrom) {
        case "top":
            baseStyle.top = location.offset
            break
        case "bottom":
        default:
            baseStyle.bottom = location.offset
    }
    return {...baseStyle, ...dynamicStyle, ...style}
}