import {type CSSProperties, type JSX, useState} from "react";
import type {Theme} from "../../ui/Themes.ts";
import Checkbox from "../../ui/Checkbox.tsx";

type Props = {
    theme: Theme
    // whether the lines are colorized
    colorizeLines: boolean
    setColorizeLines: (colorize: boolean) => void
    // the colors the colorized lines' sweep starts and ends with
    startColor: string
    setStartColor: (color: string) => void
    endColor: string
    setEndColor: (color: string) => void
    // the number of points (steps) the colors' sweep takes
    steps: number
    setSteps: (steps: number) => void
}

/**
 * The style of the steps field: the theme's colors (the disabled ones, when it's disabled)
 * @param theme The theme
 * @param disabled Whether the field is disabled
 * @return The text field's style
 */
const stepsInputStyle = (theme: Theme, disabled: boolean): CSSProperties => ({
    backgroundColor: disabled ? theme.disabledBackgroundColor : theme.backgroundColor,
    outlineStyle: 'none',
    borderColor: disabled ? theme.disabledColor : theme.color,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 3,
    color: disabled ? theme.disabledColor : theme.color,
    fontSize: 12,
    padding: 4,
    height: 15,
    width: 60,
})

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
 * `colorizeLines` prop), followed by the pickers for the colors the lines' sweep starts and ends
 * with, and a field for the number of points (steps) the sweep takes (all disabled while the
 * lines aren't colorized)
 * @param props The theme, whether the lines are colorized, the sweep's start and end colors, its
 * number of steps, and the handlers for changing each
 * @return The checkbox, the color pickers, and the steps field
 */
export function LineColorsControl(props: Props): JSX.Element {
    const {
        theme,
        colorizeLines, setColorizeLines,
        startColor, setStartColor,
        endColor, setEndColor,
        steps, setSteps,
    } = props

    // holds the steps field's raw text, so the field can reflect what's being typed (including
    // transient invalid states, like a temporarily empty field) without immediately reverting
    const [stepsText, setStepsText] = useState<string>(String(steps))
    // keep the field in sync when the steps change from elsewhere, adjusting state during render
    // (see "Adjusting some state when a prop changes" in the React docs)
    const [previousSteps, setPreviousSteps] = useState<number>(steps)
    if (steps !== previousSteps) {
        setPreviousSteps(steps)
        setStepsText(String(steps))
    }

    function handleStepsChange(value: string): void {
        setStepsText(value)
        // (thousands separators are allowed, e.g. "100,000")
        const parsed = Number(value.replace(/[,_\s]/g, ''))
        if (Number.isInteger(parsed) && parsed > 0) setSteps(parsed)
    }

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
            <label style={labelStyle}>
                steps
                <input
                    type="text"
                    value={stepsText}
                    onChange={event => handleStepsChange(event.currentTarget.value)}
                    disabled={!colorizeLines}
                    style={stepsInputStyle(theme, !colorizeLines)}
                    aria-label="number of points the colorized lines' colors take to sweep from the start color to the end color"
                />
            </label>
        </div>
    )
}
