import {type JSX} from "react";
import type {Theme} from "../../ui/Themes.ts";
import {DropDown} from "../../ui/DropDown.tsx";
import type {GeoFocus} from "../appstate/geoChartStore.ts";
import {FOCUS_OPTIONS} from "./geoControlOptions.ts";

type Props = {
    theme: Theme
    focus: GeoFocus
    handleFocusChange: (focus: GeoFocus) => void
}

/**
 * The drop-down for choosing what the geo plot's view frames (its `fitTo` property)
 * @param props The theme, the current focus, and the handler for a new one
 * @return The drop-down, with its label
 */
export function FocusControl(props: Props): JSX.Element {
    const {theme, focus, handleFocusChange} = props
    return (
        <label style={{color: theme.color}}>
            <DropDown theme={theme} name="geo-focus" options={FOCUS_OPTIONS} value={focus} onChange={handleFocusChange}/>
            <span style={{paddingLeft: 10}}>Focus</span>
        </label>
    )
}
