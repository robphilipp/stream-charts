import {type RefObject, useEffect, useRef} from "react"

/**
 * Keeps the latest value handed in (as of the latest render) in a ref, for code that runs outside of
 * rendering -- an event handler, an animation frame, a subscription -- so that it reads the current
 * value without being recreated (or resubscribing) whenever the value changes (e.g. a callback
 * property, written inline, is a new function on every render)
 * @param value The value
 * @return The ref holding the latest value
 * @template T The type of the value
 */
export function useLatest<T>(value: T): RefObject<T> {
    const ref = useRef(value)
    useEffect(
        () => {
            ref.current = value
        },
        [value]
    )
    return ref
}
