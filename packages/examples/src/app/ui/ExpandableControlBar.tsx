import {type CSSProperties, type JSX, useLayoutEffect, useRef, useState} from "react";
import {CollapsedIcon, ExpandedIcon} from "./Icons.tsx";
import {Button} from "./Button.tsx";

/**
 * Where a child of the {@link ExpandableControlBar} goes: in its header (always shown), or among
 * its controls (shown when the bar is expanded)
 */
export type ControlBarType = 'header' | 'controls'

type Props = {
    expandButtonStyle: CSSProperties
    backgroundColor: string
    borderColor: string
    borderRadius: number
    width?: CSSProperties["width"]
    minHeight?: CSSProperties["minHeight"]
    defaultExpanded?: boolean
    autoExpandOnMouseEnter?: boolean
    autoCollapseOnMouseLeave?: boolean
    autoCollapseDelay?: number
    children: JSX.Element | Array<JSX.Element>
}

/**
 * A control bar with a header row (an expand/collapse button, followed by the child whose `type`
 * is `'header'`) and the controls below it (the other child), which slide open when the bar is
 * expanded. By default, the bar expands when the mouse enters it, and collapses a moment
 * (`autoCollapseDelay`, 500 ms) after the mouse leaves it. Like the docs' floating navigation bar,
 * it lies flat (with a border) until the mouse is over it, and is lifted (with a drop shadow) while it is.
 * @param props The bar's colors, border radius, and size; whether it starts out expanded; whether
 * (and how soon) it expands and collapses as the mouse enters and leaves it; and its header and controls
 * @return The control bar
 */
export function ExpandableControlBar(props: Props): JSX.Element {
    const {
        backgroundColor,
        borderColor,
        borderRadius,
        minHeight = 'max-content',
        width = 'max-content',
        defaultExpanded = false,
        autoExpandOnMouseEnter = true,
        autoCollapseOnMouseLeave = true,
        autoCollapseDelay = 500,
        expandButtonStyle,
        children
    } = props

    const [expanded, setExpanded] = useState<boolean>(defaultExpanded)
    // whether the mouse is over the control bar (the expand button is highlighted while it is). The
    // button's color is derived from this on each render, rather than held in state, so that it
    // follows the colors passed in (e.g. when the theme changes).
    const [hovered, setHovered] = useState<boolean>(false)
    const expandButtonColor = hovered ? expandButtonStyle.color || borderColor : borderColor
    const collapseTimeoutRef = useRef<number | null>(null)

    const contentRef = useRef<HTMLDivElement>(null)
    const [contentHeight, setContentHeight] = useState<number>(0)

    const sortedChildren = categorizeChildren(children)

    useLayoutEffect(() => {
        if (!contentRef.current) return

        const element = contentRef.current
        const updateHeight = () => setContentHeight(element.scrollHeight)

        updateHeight()

        const observer = new ResizeObserver(() => updateHeight())
        observer.observe(element)

        return () => observer.disconnect()
    }, [children])

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                flexWrap: 'nowrap',
                alignItems: 'stretch',
                flex: '0 0 auto',
                minHeight,
                width,
                minWidth: 0,
                zIndex: 1000,
                borderRadius: borderRadius,

                backgroundColor: expanded ? `rgb(from ${backgroundColor} r g b / 0.5)` : backgroundColor,
                backdropFilter: expanded ? "blur(10px)" : "blur(2px)",
                WebkitBackdropFilter: expanded ? "blur(10px)" : "blur(2px)",
                // like the floating navigation bar: lying flat (a border, no shadow) until the mouse
                // is over it, and then lifted (a drop shadow, no border). (The border is made
                // transparent, rather than removed, so the bar's size, and so the page's layout,
                // doesn't change.)
                border: `1px solid ${hovered ? 'transparent' : borderColor}`,
                boxShadow: hovered ? `0 10px 25px ${borderColor}` : 'none',
                transition: "background-color 240ms ease, box-shadow 240ms ease, border-color 240ms ease, backdrop-filter 240ms ease, -webkit-backdrop-filter 240ms ease",
            }}
            onMouseEnter={() => {
                if (collapseTimeoutRef.current) {
                    clearTimeout(collapseTimeoutRef.current)
                    collapseTimeoutRef.current = null
                }
                // when auto-expand is set to true, then expand the control bar (but don't collapse)
                if (autoExpandOnMouseEnter) setExpanded(true)
                setHovered(true)
            }}
            onMouseLeave={(event) => {
                // the expand-button color always reflects whether the mouse is over the control bar
                setHovered(false)

                // when not auto-collapsing, then don't collapse the control bar
                if (!autoCollapseOnMouseLeave) return;

                // for native select (for example) don't collapse the control bar when in the
                // native element
                const nextTarget = event.relatedTarget as Node | null;

                // check if the mouse moved to something inside our container or if the mouse
                // moved to null (often indicates native dropdown interaction)
                if (contentRef.current?.contains(nextTarget) || nextTarget === null) {
                    return;
                }

                // ok, so now collapse the control bar after a set delay
                collapseTimeoutRef.current = setTimeout(() => {
                    collapseTimeoutRef.current = null
                    setExpanded(false)
                }, autoCollapseDelay)
            }}
        >
            <div style={{
                display: 'flex',
                flexDirection: 'row',
                flexWrap: 'nowrap',
                alignItems: 'center',
                gap: 8,
                padding: '6px 16px 6px 6px',
                minWidth: 0,
            }}>
                <Button
                    style={{border: 'none', backgroundColor}}
                    onClick={() => expanded ? setExpanded(false) : setExpanded(true)}
                    icon={() => expanded ?
                        <ExpandedIcon color={expandButtonColor}/> :
                        <CollapsedIcon color={expandButtonColor}/>
                    }
                    children={""}
                />
                {sortedChildren.header}
            </div>
            <div style={{
                maxHeight: expanded ? `${contentHeight}px` : "0px",
                opacity: expanded ? 1 : 0,
                overflow: 'hidden',
                borderTop: `1px solid ${expanded ? borderColor : 'transparent'}`,
                transition: "max-height 260ms ease, opacity 180ms ease, border-top-color 180ms ease",
            }}>
                <div
                    ref={contentRef}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        flexWrap: 'nowrap',
                        alignItems: 'stretch',
                        gap: 6,
                        padding: '0 6px 6px',
                        minWidth: 0,
                        overflowX: 'auto',
                        overflowY: 'hidden',
                        scrollbarWidth: 'thin',
                    }}>
                    {sortedChildren.content}
                </div>
            </div>
        </div>
    )
}

type CategorizedChildren = { header: JSX.Element, content: JSX.Element }

/**
 * Sorts the control bar's children into its header (the child whose `type` prop is `'header'`) and
 * its content (the other child -- when there are several, the last). A single child is the content.
 * @param children The control bar's children
 * @return The header and the content (each an empty fragment when there's none)
 */
function categorizeChildren(children: JSX.Element | Array<JSX.Element>): CategorizedChildren {
    if (!Array.isArray(children)) {
        return {header: <></>, content: children}
    }
    return children.reduce(
        (parsed, elem) => {
            if (elem.props.type === 'header') {
                parsed.header = elem
            } else {
                parsed.content = elem
            }
            return parsed
        }, {header: <></>, content: <></>}
    )

}
