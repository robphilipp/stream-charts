import {type JSX} from "react";
import {INTERPOLATIONS} from "../options/interpolations.ts";
import type {Theme} from "../../ui/Themes.ts";
import {DropDown, type DropDownOption} from "../../ui/DropDown.tsx";

// the interpolations, valued by their curve's name (e.g. "curveLinear") and labelled with a
// display name (e.g. "Linear")
const OPTIONS: Array<DropDownOption<string>> = Array.from(INTERPOLATIONS.entries())
    .map(([value, [label,]]) => ({value, label}))

type Props = {
    theme: Theme
    selectedInterpolationName: string
    handleInterpolationChange: (selected: string) => void
}

/**
 * Drop-down for the interpolation between a series' points (e.g. linear, or step), labeled
 * "Interpolation"
 * @param props The theme, the selected interpolation's name (e.g. "curveLinear"), and the
 * handler for a new selection
 * @return The labeled drop-down
 */
export function InterpolationControl(props: Props): JSX.Element {
    const {
        theme,
        selectedInterpolationName,
        handleInterpolationChange,
    } = props

    return (
        <label style={{color: theme.color}}>
            <DropDown
                theme={theme}
                name="interpolations"
                options={OPTIONS}
                value={selectedInterpolationName}
                onChange={handleInterpolationChange}
            />
            <span style={{paddingLeft: 10}}>Interpolation</span>
        </label>
    )
}