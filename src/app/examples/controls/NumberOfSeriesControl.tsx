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
    numberOfSeries: number
    handleNumberOfSeriesChange: (numberOfSeries: number) => void
    disabled: boolean
}

/**
 * Text field for setting the number of series in the initial data. Only meant to be
 * changed while the chart isn't running (see the `disabled` prop).
 * @param props The theme, the number of series, the handler for a new (valid) number of series,
 * and whether the field is disabled
 * @return The labeled text field
 */
export function NumberOfSeriesControl(props: Props): JSX.Element {
    const {theme, numberOfSeries, handleNumberOfSeriesChange, disabled} = props

    // holds the raw text so the field can reflect what's being typed (including transient
    // invalid states, like a temporarily empty field) without immediately reverting
    const [text, setText] = useState<string>(String(numberOfSeries))

    // keep the field in sync when the number of series changes from elsewhere (e.g. reset),
    // adjusting state during render rather than in an effect (see "Adjusting some state when a
    // prop changes" in the React docs) -- this avoids the extra commit+effect round trip
    const [prevNumberOfSeries, setPrevNumberOfSeries] = useState<number>(numberOfSeries)
    if (numberOfSeries !== prevNumberOfSeries) {
        setPrevNumberOfSeries(numberOfSeries)
        setText(String(numberOfSeries))
    }

    function handleChange(value: string): void {
        setText(value)
        const parsed = Number(value)
        if (Number.isInteger(parsed) && parsed > 0) {
            handleNumberOfSeriesChange(parsed)
        }
    }

    return (
        <label style={{
            color: disabled ? theme.disabledColor : theme.color,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
        }}>
            Number of Series
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
