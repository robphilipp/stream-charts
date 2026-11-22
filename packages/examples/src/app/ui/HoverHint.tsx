import {type JSX, type ReactNode, useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import type {Theme} from "./Themes.ts";

// how long the mouse rests on the element before its hint shows (ms): much quicker than the
// browser's own (a `title`'s), which can't be changed
const DEFAULT_DELAY = 100

type Props = {
    theme: Theme
    /**
     * The hint's text
     */
    label: string
    /**
     * How long the mouse rests on the element before the hint shows (ms). Defaults to 100.
     */
    delay?: number
    children: ReactNode
}

/**
 * Shows a short hint below its children while the mouse rests on them: e.g. what an icon in a
 * control bar's header stands for. The hint is drawn into the page's body, so that the control
 * bar (which scrolls, and so clips what overflows it) doesn't cut it off.
 * @param props The theme, the hint's text, how soon it shows, and the element it's for
 * @return The children, with the hint
 */
export function HoverHint(props: Props): JSX.Element {
    const {theme, label, delay = DEFAULT_DELAY, children} = props
    const anchorRef = useRef<HTMLSpanElement>(null)
    const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    // where the hint shows (the middle of its top edge, in the viewport), when it's showing
    const [at, setAt] = useState<{x: number, y: number} | undefined>(undefined)

    useEffect(() => (): void => clearTimeout(timerRef.current), [])

    const show = (): void => {
        clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
            const bounds = anchorRef.current?.getBoundingClientRect()
            if (bounds !== undefined) setAt({x: bounds.left + bounds.width / 2, y: bounds.bottom + 6})
        }, delay)
    }
    const hide = (): void => {
        clearTimeout(timerRef.current)
        setAt(undefined)
    }

    return (
        <span
            ref={anchorRef}
            aria-label={label}
            style={{display: 'inline-flex'}}
            onMouseEnter={show}
            onMouseLeave={hide}
        >
            {children}
            {at !== undefined && createPortal(
                <div
                    role="tooltip"
                    style={{
                        position: 'fixed',
                        left: at.x,
                        top: at.y,
                        transform: 'translateX(-50%)',
                        padding: '3px 8px',
                        fontSize: 12,
                        whiteSpace: 'nowrap',
                        color: theme.color,
                        backgroundColor: theme.backgroundColor,
                        border: `1px solid ${theme.disabledBackgroundColor}`,
                        borderRadius: 4,
                        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)',
                        pointerEvents: 'none',
                        zIndex: 1000,
                    }}
                >
                    {label}
                </div>,
                document.body
            )}
        </span>
    )
}
