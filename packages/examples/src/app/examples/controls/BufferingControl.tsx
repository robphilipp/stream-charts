import {type CSSProperties, type JSX, useState} from "react";
import type {Theme} from "../../ui/Themes.ts";

/**
 * The style of the text field: the theme's colors (the disabled ones, when it's disabled)
 * @param theme The theme
 * @param disabled Whether the field is disabled
 * @return The text field's style
 */
const inputStyle = (theme: Theme, disabled: boolean): CSSProperties => ({
    backgroundColor: disabled ? theme.disabledBackgroundColor : theme.backgroundColor,
    outlineStyle: 'none',
    borderColor: disabled ? theme.disabledColor : theme.color,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 3,
    color: disabled ? theme.disabledColor : theme.color,
    fontSize: 12,
    padding: 4,
    height: 20,
    width: 40,
})

type Props = {
    theme: Theme
    windowingTime: number
    handleWindowingTimeChange: (windowingTime: number) => void
    disabled: boolean
}

/**
 * Text field for setting the chart's `windowingTime` (the time-window, in milliseconds, used to
 * buffer incoming data before updating the chart). Only meant to be changed while the chart isn't
 * running (see the `disabled` prop).
 * @param props The theme, the windowing time, the handler for a new (valid) windowing time, and
 * whether the field is disabled
 * @return The labeled text field
 */
export function BufferingControl(props: Props): JSX.Element {
    const {theme, windowingTime, handleWindowingTimeChange, disabled} = props

    // holds the raw text so the field can reflect what's being typed (including transient
    // invalid states, like a temporarily empty field) without immediately reverting
    const [text, setText] = useState<string>(String(windowingTime))

    // keep the field in sync when the windowing time changes from elsewhere (e.g. reset),
    // adjusting state during render rather than in an effect (see "Adjusting some state when a
    // prop changes" in the React docs) -- this avoids the extra commit+effect round trip
    const [prevWindowingTime, setPrevWindowingTime] = useState<number>(windowingTime)
    if (windowingTime !== prevWindowingTime) {
        setPrevWindowingTime(windowingTime)
        setText(String(windowingTime))
    }

    function handleChange(value: string): void {
        setText(value)
        const parsed = Number(value)
        if (Number.isInteger(parsed) && parsed > 0) {
            handleWindowingTimeChange(parsed)
        }
    }

    return (
        <label style={{
            color: disabled ? theme.disabledColor : theme.color,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
        }}>
            Buffering (ms)
            <input
                type="text"
                value={text}
                onChange={event => handleChange(event.currentTarget.value)}
                style={inputStyle(theme, disabled)}
                disabled={disabled}
            />
        </label>
    )
}
