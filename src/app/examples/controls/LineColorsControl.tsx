import {type CSSProperties, type JSX} from "react";
import type {Theme} from "../../ui/Themes.ts";
import Checkbox from "../../ui/Checkbox.tsx";

type Props = {
    theme: Theme
    // whether the lines are colorized
    colorizeLines: boolean
    setColorizeLines: (colorize: boolean) => void
    // the colorized lines' start (oldest point) and end (newest point) colors
    startColor: string
    setStartColor: (color: string) => void
    endColor: string
    setEndColor: (color: string) => void
}

/**
 * The style of a color picker: a small swatch, outlined in the theme's color (its disabled color,
 * when it's disabled)
 * @param theme The theme
 * @param disabled Whether the picker is disabled
 * @return The color picker's style
 */
const colorInputStyle = (theme: Theme, disabled: boolean): CSSProperties => ({
    width: 28,
    height: 20,
    padding: 0,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 3,
    borderColor: disabled ? theme.disabledColor : theme.color,
    backgroundColor: 'transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
})

/**
 * Checkbox for colorizing the lines connecting a chart's points (see the `PoincarePlot`'s
 * `colorizeLines` prop), followed by the pickers for the lines' start and end colors (disabled
 * while the lines aren't colorized)
 * @param props The theme, whether the lines are colorized, the lines' start and end colors, and
 * the handlers for changing each
 * @return The checkbox and the color pickers
 */
export function LineColorsControl(props: Props): JSX.Element {
    const {theme, colorizeLines, setColorizeLines, startColor, setStartColor, endColor, setEndColor} = props
    const labelStyle: CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        color: colorizeLines ? theme.color : theme.disabledColor,
    }

    return (
        <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10}}>
            <Checkbox
                checked={colorizeLines}
                label="colorize lines"
                backgroundColor={theme.backgroundColor}
                borderColor={theme.color}
                labelColor={theme.color}
                onChange={() => setColorizeLines(!colorizeLines)}
            />
            <label style={labelStyle}>
                from
                <input
                    type="color"
                    value={startColor}
                    onChange={event => setStartColor(event.currentTarget.value)}
                    disabled={!colorizeLines}
                    style={colorInputStyle(theme, !colorizeLines)}
                    aria-label="start color of the colorized lines"
                />
            </label>
            <label style={labelStyle}>
                to
                <input
                    type="color"
                    value={endColor}
                    onChange={event => setEndColor(event.currentTarget.value)}
                    disabled={!colorizeLines}
                    style={colorInputStyle(theme, !colorizeLines)}
                    aria-label="end color of the colorized lines"
                />
            </label>
        </div>
    )
}
