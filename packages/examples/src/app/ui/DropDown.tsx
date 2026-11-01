import {type CSSProperties, type JSX, type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import type {Theme} from "./Themes.ts";
import {interpolateColor} from "./utils.ts";
import {DropDownClosedIcon, DropDownOpenIcon} from "./Icons.tsx";

/**
 * An option in a {@link DropDown}
 * @template V The type of the option's value
 */
export type DropDownOption<V extends string> = {
    /**
     * The value handed to the drop-down's `onChange` when this option is selected
     */
    value: V
    /**
     * The text shown for this option
     */
    label: string
}

type Props<V extends string> = {
    theme: Theme
    /**
     * The name of the drop-down's (hidden) form value
     */
    name: string
    /**
     * The options, in the order they're listed
     */
    options: Array<DropDownOption<V>>
    /**
     * The value of the selected option
     */
    value: V
    /**
     * Called with the value of the option the user selects
     * @param value The selected option's value
     */
    onChange: (value: V) => void
    /**
     * When `true`, the drop-down is shown in the theme's disabled colors and can't be changed.
     * Defaults to `false`.
     */
    disabled?: boolean
    /**
     * An accessible name for the drop-down, when there's no visible label for it
     */
    ariaLabel?: string
    /**
     * How long (in milliseconds) the open list stays open after the mouse leaves the drop-down
     * (the button and the list) before it closes. Moving back into either one in the meantime
     * keeps it open. The delay also lets the mouse cross the gap between the button and the list.
     * Defaults to 500 ms (the same as the expandable control bar's auto-collapse delay).
     */
    autoCloseDelay?: number
    /**
     * How long (in milliseconds) the list takes to open (grow to its full height and fade in), and
     * to close (shrink and fade out). Defaults to 260 ms (the same as the expandable control
     * bar's expand/collapse animation).
     */
    animationDuration?: number
}

// the largest the list gets before it scrolls
const MAX_LIST_HEIGHT = 240
// how long the type-ahead keeps accumulating typed characters
const TYPE_AHEAD_TIMEOUT_MS = 500
// the gap between the trigger and the list
const LIST_OFFSET = 2
// the list's top and bottom borders (its height includes them, because of the border-box sizing)
const LIST_BORDERS_HEIGHT = 2
// the height of the indicators at the top and bottom of a scrolling list, which show that there are
// more options above or below
const SCROLL_HINT_HEIGHT = 18
// the options fade for this fraction of the animation's duration (the expandable control bar
// fades its content for 180 ms of its 260 ms expand/collapse)
const FADE_FRACTION = 180 / 260
// when closing, the list's border and shadow fade out over this last fraction of the animation,
// once the list has (almost) shrunk away -- so the shrinking list stays visible, but doesn't leave
// its border behind as a line
const CHROME_FADE_OUT_FRACTION = 0.4

/**
 * Where the list is placed, in viewport (fixed) coordinates
 */
type ListPlacement = {
    left: number
    minWidth: number
    top?: number
    bottom?: number
    maxHeight: number
}

/**
 * The list's height when fully open, and whether its options are taller than that (it scrolls)
 */
type ListSize = {
    height: number
    scrolls: boolean
}

/**
 * Whether a scrolling list has options hidden above or below what's visible
 */
type ScrollHints = {
    above: boolean
    below: boolean
}

const NO_SCROLL_HINTS: ScrollHints = {above: false, below: false}

/**
 * Calculates whether a scrolling list has options hidden above or below what's visible. Calculated
 * for the list's *fully open* height (rather than its current one), so that it's already right
 * while the list is still growing open.
 * @param box The list's box (which scrolls)
 * @param list The options
 * @param listSize The list's height when fully open, and whether it scrolls
 * @return Whether there are options hidden above and below
 */
function scrollHintsFor(box: HTMLElement, list: HTMLElement, listSize: ListSize): ScrollHints {
    if (!listSize.scrolls) return NO_SCROLL_HINTS
    const visibleHeight = listSize.height - LIST_BORDERS_HEIGHT
    return {
        above: box.scrollTop > 1,
        below: box.scrollTop + visibleHeight < list.offsetHeight - 1,
    }
}

/**
 * A themed drop-down: a button showing the selected option that opens a list of the options.
 * Unlike a native `<select>`, both the button and the open list follow the theme.
 *
 * The list is rendered into `document.body` (in fixed position, next to the button), so that a
 * container that clips its overflow (e.g. a collapsible control bar) can't cut it off. It opens
 * below the button, or above when there isn't enough room below, and closes when the page scrolls
 * or resizes (rather than drifting away from the button). Like the expandable control bar, it
 * grows to its full height as it opens (the options fading in), and shrinks away as it closes.
 *
 * It follows the WAI-ARIA "select-only combobox" pattern: focus stays on the button, which
 * points at the highlighted option through `aria-activedescendant`. Keyboard: ArrowDown/ArrowUp,
 * Enter, or Space open the list; while it's open, ArrowDown/ArrowUp/Home/End move the highlight,
 * Enter or Space select it, Tab selects it and moves on, and Escape closes the list unchanged;
 * typing jumps to the first option whose label starts with what was typed. The list also closes
 * (unchanged) when the mouse has left the drop-down (the button and the list) for the
 * `autoCloseDelay`.
 * @param props The properties
 * @return The drop-down
 * @template V The type of the options' values
 */
export function DropDown<V extends string>(props: Props<V>): JSX.Element {
    const {
        theme,
        name,
        options,
        value,
        onChange,
        disabled = false,
        ariaLabel,
        autoCloseDelay = 500,
        animationDuration = 260,
    } = props

    const id = useId()
    const listId = `${id}-list`
    const optionId = (index: number): string => `${id}-option-${index}`

    const [open, setOpen] = useState<boolean>(false)
    // the highlighted option (keyboard focus or mouse hover) while the list is open
    const [activeIndex, setActiveIndex] = useState<number>(-1)
    // The list is rendered while it has a placement: from when it opens until its closing
    // animation has finished. It's rendered collapsed, and expands once it has been measured
    // (a frame later, so that the transition runs).
    const [placement, setPlacement] = useState<ListPlacement | undefined>(undefined)
    const [listSize, setListSize] = useState<ListSize | undefined>(undefined)
    // whether a scrolling list has options hidden above or below (shown by indicators at its edges)
    const [scrollHints, setScrollHints] = useState<ScrollHints>(NO_SCROLL_HINTS)

    const buttonRef = useRef<HTMLButtonElement>(null)
    // the list's box (which clips, scrolls, and animates), and the options in it
    const boxRef = useRef<HTMLDivElement>(null)
    const listRef = useRef<HTMLUListElement>(null)
    const typeAheadRef = useRef<{text: string, timeout: ReturnType<typeof setTimeout> | undefined}>({text: '', timeout: undefined})
    const autoCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    const selectedIndex = options.findIndex(option => option.value === value)
    const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined

    // the list is shown fully open once it has been measured, for as long as it is open
    const expanded = open && listSize !== undefined

    // a drop-down that becomes disabled while open closes (adjusting the state while rendering,
    // when the `disabled` prop changes, rather than in an effect)
    const [wasDisabled, setWasDisabled] = useState<boolean>(disabled)
    if (disabled !== wasDisabled) {
        setWasDisabled(disabled)
        if (disabled) setOpen(false)
    }

    /**
     * Opens the list next to the button: below it, or above it when there isn't enough room below
     * (and there's more room above)
     * @param highlight The option to highlight (defaults to the selected one)
     */
    function openList(highlight: number = selectedIndex): void {
        if (disabled || options.length === 0 || buttonRef.current === null) return
        cancelAutoClose()

        const rect = buttonRef.current.getBoundingClientRect()
        const spaceBelow = window.innerHeight - rect.bottom - LIST_OFFSET
        const spaceAbove = rect.top - LIST_OFFSET
        const below = spaceBelow >= Math.min(MAX_LIST_HEIGHT, spaceAbove) || spaceBelow >= spaceAbove
        setPlacement({
            left: rect.left,
            minWidth: rect.width,
            ...(below ?
                {top: rect.bottom + LIST_OFFSET, maxHeight: Math.min(MAX_LIST_HEIGHT, spaceBelow)} :
                {bottom: window.innerHeight - rect.top + LIST_OFFSET, maxHeight: Math.min(MAX_LIST_HEIGHT, spaceAbove)})
        })
        setActiveIndex(highlight >= 0 ? highlight : 0)
        setOpen(true)
    }

    function select(index: number): void {
        const option = options[index]
        if (option !== undefined && option.value !== value) onChange(option.value)
        setOpen(false)
    }

    // once the list is rendered (collapsed), measures its options, and then (in the next frame,
    // after the collapsed list has been painted) expands it to their height. A list reopened while
    // still closing is already measured, so it animates straight back open.
    useLayoutEffect(
        () => {
            if (!open || placement === undefined || listRef.current === null) return
            const list = listRef.current
            const contentHeight = list.offsetHeight + LIST_BORDERS_HEIGHT
            const frame = requestAnimationFrame(() => {
                const size = {
                    height: Math.min(contentHeight, placement.maxHeight),
                    scrolls: contentHeight > placement.maxHeight
                }
                setListSize(size)
                // (scrolling the highlighted option into view, once expanded, updates these
                // through the list's scroll event)
                if (boxRef.current !== null) setScrollHints(scrollHintsFor(boxRef.current, list, size))
            })
            return () => cancelAnimationFrame(frame)
        },
        [open, placement]
    )

    // once closed, removes the list after its closing animation has finished (reopening it in the
    // meantime cancels the removal)
    useEffect(
        () => {
            if (open || placement === undefined) return
            const timeout = setTimeout(
                () => {
                    setPlacement(undefined)
                    setListSize(undefined)
                },
                animationDuration
            )
            return () => clearTimeout(timeout)
        },
        [open, placement, animationDuration]
    )

    // while open: close on a pointer press outside the drop-down, or when the page scrolls or
    // resizes (the list is fixed in place, so it would otherwise drift away from the button)
    useEffect(
        () => {
            if (!open) return
            const handlePointerDown = (event: PointerEvent) => {
                const target = event.target as Node
                if (buttonRef.current?.contains(target) || boxRef.current?.contains(target)) return
                setOpen(false)
            }
            const handleScroll = (event: Event) => {
                // scrolling the list itself is fine
                if (event.target instanceof Node && boxRef.current?.contains(event.target)) return
                setOpen(false)
            }
            const handleResize = () => setOpen(false)
            document.addEventListener('pointerdown', handlePointerDown, true)
            window.addEventListener('scroll', handleScroll, true)
            window.addEventListener('resize', handleResize)
            return () => {
                document.removeEventListener('pointerdown', handlePointerDown, true)
                window.removeEventListener('scroll', handleScroll, true)
                window.removeEventListener('resize', handleResize)
            }
        },
        [open]
    )

    // Keeps the highlighted option scrolled into view, for a list whose options don't all fit (a
    // list whose options fit never scrolls, so it always opens showing its first option).
    //
    // The scroll position is calculated for the list's *fully open* height, rather than with
    // `scrollIntoView`: the list starts out collapsed, so `scrollIntoView` would scroll the
    // highlighted option to the top of the still-tiny list, and then the content would slide back
    // down as the growing list's scroll position got clamped (a visible hitch when opening on an
    // option in the middle of the list). Scrolled for its final height, the list simply grows
    // into its final view.
    useEffect(
        () => {
            const box = boxRef.current
            const list = listRef.current
            if (!expanded || !listSize.scrolls || activeIndex < 0 || box === null || list === null) return
            const option = document.getElementById(optionId(activeIndex))
            if (option === null) return
            // (`offsetTop` is relative to the box, the options' offset parent, because it's
            // fixed-positioned; and the first and last options also bring the list's padding into
            // view, so that they scroll it all the way to its top or bottom)
            const top = activeIndex === 0 ? 0 : option.offsetTop
            const bottom = activeIndex === list.children.length - 1 ?
                list.offsetHeight :
                option.offsetTop + option.offsetHeight
            const visibleHeight = listSize.height - LIST_BORDERS_HEIGHT
            if (top < box.scrollTop) {
                box.scrollTop = top
            } else if (bottom > box.scrollTop + visibleHeight) {
                box.scrollTop = bottom - visibleHeight
            }
        },
        // `optionId` only depends on `id`, which never changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [expanded, listSize, activeIndex]
    )

    // keeps the scroll indicators up to date as the list scrolls (by the user, or to keep the
    // highlighted option in view)
    function handleListScroll(): void {
        const box = boxRef.current
        const list = listRef.current
        if (box === null || list === null || listSize === undefined) return
        const hints = scrollHintsFor(box, list, listSize)
        if (hints.above !== scrollHints.above || hints.below !== scrollHints.below) setScrollHints(hints)
    }

    // closes the open list `autoCloseDelay` after the mouse leaves the button or the list, unless
    // the mouse enters the other one (or comes back) in the meantime
    function handleMouseLeave(): void {
        if (!open) return
        cancelAutoClose()
        autoCloseTimeoutRef.current = setTimeout(() => setOpen(false), autoCloseDelay)
    }

    function cancelAutoClose(): void {
        clearTimeout(autoCloseTimeoutRef.current)
        autoCloseTimeoutRef.current = undefined
    }

    /**
     * Jumps to the first option (from the highlighted one onwards, wrapping around) whose label
     * starts with the characters typed so far
     * @param character The character just typed
     * @return The index of the matching option, or -1 when none matches
     */
    function typeAhead(character: string): number {
        const typeAheadState = typeAheadRef.current
        clearTimeout(typeAheadState.timeout)
        typeAheadState.text += character.toLowerCase()
        typeAheadState.timeout = setTimeout(() => typeAheadState.text = '', TYPE_AHEAD_TIMEOUT_MS)

        const start = open ? activeIndex : selectedIndex
        // a repeated single character cycles through the options starting with it
        const searchFrom = typeAheadState.text.length === 1 ? start + 1 : Math.max(start, 0)
        for (let offset = 0; offset < options.length; offset++) {
            const index = (searchFrom + offset) % options.length
            if (options[index].label.toLowerCase().startsWith(typeAheadState.text)) return index
        }
        return -1
    }

    // (a disabled button can't be focused, so it gets no key events)
    function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
        const last = options.length - 1

        if (!open) {
            switch (event.key) {
                case 'ArrowDown':
                case 'ArrowUp':
                case 'Enter':
                case ' ':
                    event.preventDefault()
                    openList()
                    return
                case 'Home':
                    event.preventDefault()
                    openList(0)
                    return
                case 'End':
                    event.preventDefault()
                    openList(last)
                    return
            }
        } else {
            switch (event.key) {
                case 'ArrowDown':
                    event.preventDefault()
                    setActiveIndex(index => Math.min(last, index + 1))
                    return
                case 'ArrowUp':
                    event.preventDefault()
                    setActiveIndex(index => Math.max(0, index - 1))
                    return
                case 'Home':
                    event.preventDefault()
                    setActiveIndex(0)
                    return
                case 'End':
                    event.preventDefault()
                    setActiveIndex(last)
                    return
                case 'Enter':
                case ' ':
                    event.preventDefault()
                    select(activeIndex)
                    return
                case 'Tab':
                    // selects the highlighted option, and lets focus move on as usual
                    select(activeIndex)
                    return
                case 'Escape':
                    event.preventDefault()
                    setOpen(false)
                    return
            }
        }

        // type-ahead (printable characters only, and not shortcuts)
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            const match = typeAhead(event.key)
            if (match < 0) return
            if (open) setActiveIndex(match)
            else openList(match)
        }
    }

    // Space is handled on key-down, so the button's own Space activation (a click on key-up) must
    // not also toggle the list (some browsers, e.g. Firefox, still click on key-up even though the
    // key-down was cancelled)
    function handleKeyUp(event: KeyboardEvent<HTMLButtonElement>): void {
        if (event.key === ' ') event.preventDefault()
    }

    const color = disabled ? theme.disabledColor : theme.color
    // how long the options fade, and how long the list's border and shadow fade out when it closes
    const optionsFade = Math.round(animationDuration * FADE_FRACTION)
    const animationFadeOut = Math.round(animationDuration * CHROME_FADE_OUT_FRACTION)
    const buttonStyle: CSSProperties = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        backgroundColor: disabled ? theme.disabledBackgroundColor : theme.backgroundColor,
        color,
        border: `1px solid ${color}`,
        borderRadius: 3,
        padding: '4px 6px 4px 8px',
        font: 'inherit',
        fontSize: 13,
        lineHeight: '18px',
        whiteSpace: 'nowrap',
        cursor: disabled ? 'not-allowed' : 'pointer',
        outline: 'none',
        boxShadow: open ? `0 0 0 2px ${interpolateColor(theme.backgroundColor, theme.color, 25)}` : 'none',
    }

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={placement !== undefined ? listId : undefined}
                aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
                aria-label={ariaLabel}
                disabled={disabled}
                data-name={name}
                style={buttonStyle}
                onClick={() => open ? setOpen(false) : openList()}
                onMouseEnter={cancelAutoClose}
                onMouseLeave={handleMouseLeave}
                onKeyDown={handleKeyDown}
                onKeyUp={handleKeyUp}
            >
                <span>{selected?.label ?? ''}</span>
                {open ?
                    <DropDownOpenIcon color={color}/> :
                    <DropDownClosedIcon color={color}/>}
            </button>
            {/* the drop-down's value, for forms (as a native select's would be) */}
            <input type="hidden" name={name} value={value}/>
            {placement !== undefined && createPortal(
                // Like the expandable control bar, the list's box (its background, border, and
                // shadow) grows and shrinks around the options (which keep their padding), and
                // only the options fade. Its border and shadow appear at once when it opens, and
                // fade out at the end of its closing animation, once it has (almost) shrunk away.
                <div
                    ref={boxRef}
                    onScroll={handleListScroll}
                    onMouseEnter={cancelAutoClose}
                    onMouseLeave={handleMouseLeave}
                    // while closing, the list is on its way out: hidden from assistive technology,
                    // and not clickable
                    aria-hidden={!open}
                    style={{
                        position: 'fixed',
                        left: placement.left,
                        top: placement.top,
                        bottom: placement.bottom,
                        minWidth: placement.minWidth,
                        maxHeight: expanded ? listSize.height : 0,
                        // only scrolls when its options don't fit (so no scrollbar flashes while it
                        // grows)
                        overflowY: listSize?.scrolls ? 'auto' : 'hidden',
                        pointerEvents: open ? 'auto' : 'none',
                        transition: `max-height ${animationDuration}ms ease, ` +
                            (expanded ?
                                'border-color 0ms, box-shadow 0ms' :
                                `border-color ${animationFadeOut}ms ease ${animationDuration - animationFadeOut}ms, ` +
                                `box-shadow ${animationFadeOut}ms ease ${animationDuration - animationFadeOut}ms`),
                        boxSizing: 'border-box',
                        backgroundColor: theme.backgroundColor,
                        color: theme.color,
                        // a softer border than the button's, so the list doesn't look boxed in
                        // (transparent while collapsed, so it doesn't show as a line)
                        border: `1px solid ${expanded ? interpolateColor(theme.color, theme.backgroundColor, 70) : 'transparent'}`,
                        borderRadius: 3,
                        boxShadow: expanded ?
                            `0 4px 12px ${interpolateColor('transparent', theme.name === 'dark' ? '#000' : '#555', 40)}` :
                            '0 4px 12px transparent',
                        font: 'inherit',
                        fontSize: 13,
                        lineHeight: '18px',
                        zIndex: 10000,
                    }}
                >
                    <ScrollHint
                        edge="top"
                        visible={expanded && scrollHints.above}
                        theme={theme}
                    />
                    <ul
                        ref={listRef}
                        id={listId}
                        role="listbox"
                        aria-label={ariaLabel}
                        style={{margin: 0, padding: '3px 0', listStyle: 'none'}}
                    >
                        {options.map((option, index) => {
                            const isSelected = index === selectedIndex
                            return (
                                <li
                                    key={option.value}
                                    id={optionId(index)}
                                    role="option"
                                    aria-selected={isSelected}
                                    data-value={option.value}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        padding: '3px 10px 3px 6px',
                                        whiteSpace: 'nowrap',
                                        cursor: 'pointer',
                                        fontWeight: isSelected ? 600 : 'normal',
                                        // the options fade in as the list opens, and out as it closes
                                        opacity: expanded ? 1 : 0,
                                        transition: `opacity ${optionsFade}ms ease`,
                                        backgroundColor: index === activeIndex ?
                                            interpolateColor(theme.backgroundColor, theme.color, 15) :
                                            'transparent',
                                    }}
                                    // keeps focus on the button (the list is never focused)
                                    onMouseDown={event => event.preventDefault()}
                                    onMouseEnter={() => setActiveIndex(index)}
                                    onClick={() => select(index)}
                                >
                                    {/* marks the selected option (keeps every label aligned) */}
                                    <span aria-hidden="true" style={{width: 10, textAlign: 'center'}}>{isSelected ? '✓' : ''}</span>
                                    <span>{option.label}</span>
                                </li>
                            )
                        })}
                    </ul>
                    <ScrollHint
                        edge="bottom"
                        visible={expanded && scrollHints.below}
                        theme={theme}
                    />
                </div>,
                document.body
            )}
        </>
    )
}

type ScrollHintProps = {
    // the edge of the list the indicator sits at
    edge: 'top' | 'bottom'
    // whether there are options hidden beyond that edge
    visible: boolean
    theme: Theme
}

/**
 * An indicator at the top or bottom edge of a scrolling list, showing that there are more options
 * hidden beyond that edge: the list's background fading in towards the edge, with a small
 * triangle pointing the way. It's placed in the list's scrolling content as a sticky, zero-height
 * element, so it stays at the edge of the visible options without affecting their layout, and
 * ignores the pointer, so the option underneath can still be clicked.
 * @param props The properties
 * @return The indicator
 */
function ScrollHint(props: ScrollHintProps): JSX.Element {
    const {edge, visible, theme} = props
    const atTop = edge === 'top'
    return (
        <div aria-hidden="true" style={{
            position: 'sticky',
            [edge]: 0,
            height: 0,
            zIndex: 1,
            pointerEvents: 'none',
        }}>
            <div style={{
                position: 'absolute',
                [edge]: 0,
                left: 0,
                right: 0,
                height: SCROLL_HINT_HEIGHT,
                display: 'flex',
                justifyContent: 'center',
                alignItems: atTop ? 'flex-start' : 'flex-end',
                padding: '2px 0',
                boxSizing: 'border-box',
                background: `linear-gradient(to ${atTop ? 'bottom' : 'top'}, ${theme.backgroundColor} 40%, transparent)`,
                opacity: visible ? 1 : 0,
                transition: 'opacity 150ms ease',
            }}>
                {atTop ? <DropDownOpenIcon color={theme.color}/> : <DropDownClosedIcon color={theme.color}/>}
            </div>
        </div>
    )
}
