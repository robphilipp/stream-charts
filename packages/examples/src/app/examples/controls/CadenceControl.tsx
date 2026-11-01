import {type CSSProperties, type JSX, useState} from "react";
import Checkbox from "../../ui/Checkbox.tsx";
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

// the cadence period (ms) used the first time the checkbox is checked (a value of `0` means
// the cadence is disabled, so this is the smallest sensible period to start from)
const DEFAULT_CADENCE = 25

type Props = {
    theme: Theme
    cadence: number
    handleCadenceChange: (cadence: number) => void
    disabled: boolean
}

/**
 * Checkbox for enabling the plot's update-cadence (`withCadenceOf`) -- a periodic redraw tick
 * that keeps the plot scrolling even when no new data has arrived. When checked, the label
 * becomes "Cadence (ms)" and a text field for the cadence period (ms) appears to its right,
 * defaulting to 25; when unchecked, the label reverts to "Cadence", the field is hidden, and the
 * cadence is disabled (`0`). Only meant to be changed while the chart isn't running (see the
 * `disabled` prop).
 * @param props The theme, the cadence period (`0` when disabled), the handler for a new cadence
 * period, and whether the control is disabled
 * @return The checkbox, and (when checked) the text field
 */
export function CadenceControl(props: Props): JSX.Element {
    const {theme, cadence, handleCadenceChange, disabled} = props

    const enabled = cadence > 0

    // holds the raw text so the field can reflect what's being typed (including transient
    // invalid states, like a temporarily empty field) without immediately reverting
    const [text, setText] = useState<string>(String(enabled ? cadence : DEFAULT_CADENCE))

    // keep the field in sync when the cadence changes from elsewhere (e.g. reset, or checking
    // the box, which reports DEFAULT_CADENCE), adjusting state during render rather than in an
    // effect (see "Adjusting some state when a prop changes" in the React docs) -- this avoids
    // the extra commit+effect round trip. Ignores the transition to `0` (unchecked) so the field
    // still shows its last value if the checkbox is unchecked and re-checked without typing.
    const [prevCadence, setPrevCadence] = useState<number>(cadence)
    if (cadence !== prevCadence) {
        setPrevCadence(cadence)
        if (cadence > 0) setText(String(cadence))
    }

    function handleToggle(): void {
        handleCadenceChange(enabled ? 0 : DEFAULT_CADENCE)
    }

    function handleChange(value: string): void {
        setText(value)
        const parsed = Number(value)
        if (Number.isInteger(parsed) && parsed > 0) {
            handleCadenceChange(parsed)
        }
    }

    return (
        <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8}}>
            <Checkbox
                checked={enabled}
                disabled={disabled}
                label={enabled ? "Cadence (ms)" : "Cadence"}
                backgroundColor={theme.backgroundColor}
                borderColor={theme.color}
                labelColor={theme.color}
                onChange={handleToggle}
            />
            {enabled &&
                <input
                    type="text"
                    value={text}
                    onChange={event => handleChange(event.currentTarget.value)}
                    style={inputStyle(theme, disabled)}
                    disabled={disabled}
                />
            }
        </div>
    )
}
