import {type JSX} from "react";
import Checkbox from "../../ui/Checkbox.tsx";
import type {Theme} from "../../ui/Themes.ts";

type Props = {
    theme: Theme
    cadence: boolean
    handleCadenceChange: (cadence: boolean) => void
    disabled: boolean
}

/**
 * Checkbox for turning on the plot's cadence (`withCadence`), which moves the time axes on every
 * animation frame, so the plot scrolls smoothly between data updates, and keeps scrolling even
 * when no new data has arrived. Only meant to be changed while the chart isn't running (see the
 * `disabled` prop).
 * @param props The theme, whether cadence is on, the handler for turning it on or off, and
 * whether the control is disabled
 * @return The checkbox
 */
export function CadenceControl(props: Props): JSX.Element {
    const {theme, cadence, handleCadenceChange, disabled} = props
    return (
        <Checkbox
            checked={cadence}
            disabled={disabled}
            label="Cadence"
            backgroundColor={theme.backgroundColor}
            borderColor={theme.color}
            labelColor={theme.color}
            onChange={() => handleCadenceChange(!cadence)}
        />
    )
}
