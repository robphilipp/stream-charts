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
    dataUpdatePeriod: number
    handleDataUpdatePeriodChange: (dataUpdatePeriod: number) => void
    disabled: boolean
}

/**
 * Text field for setting the data generator's (RxJS observable's) data-generation rate -- how often
 * (in milliseconds) the streaming source produces a new data point per series, independent of
 * how often the chart buffers/redraws that data. Only meant to be changed while the chart isn't
 * running (see the `disabled` prop).
 * @param props The theme, the data-update period, the handler for a new (valid) period, and
 * whether the field is disabled
 * @return The labeled text field
 */
export function DataUpdateRateControl(props: Props): JSX.Element {
    const {theme, dataUpdatePeriod, handleDataUpdatePeriodChange, disabled} = props

    // holds the raw text so the field can reflect what's being typed (including transient
    // invalid states, like a temporarily empty field) without immediately reverting
    const [text, setText] = useState<string>(String(dataUpdatePeriod))

    // keep the field in sync when the update period changes from elsewhere (e.g. reset),
    // adjusting state during render rather than in an effect (see "Adjusting some state when a
    // prop changes" in the React docs) -- this avoids the extra commit+effect round trip
    const [prevDataUpdatePeriod, setPrevDataUpdatePeriod] = useState<number>(dataUpdatePeriod)
    if (dataUpdatePeriod !== prevDataUpdatePeriod) {
        setPrevDataUpdatePeriod(dataUpdatePeriod)
        setText(String(dataUpdatePeriod))
    }

    function handleChange(value: string): void {
        setText(value)
        const parsed = Number(value)
        if (Number.isInteger(parsed) && parsed > 0) {
            handleDataUpdatePeriodChange(parsed)
        }
    }

    return (
        <label style={{
            color: disabled ? theme.disabledColor : theme.color,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
        }}>
            Update Rate (ms)
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
