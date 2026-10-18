import {type JSX} from "react";
import {LegendLocation} from "stream-charts";
import type {Theme} from "../../ui/Themes.ts";
import {LEGEND_LOCATIONS} from "../options/legendLocations.ts";
import Checkbox from "../../ui/Checkbox.tsx";
import {DropDown, type DropDownOption} from "../../ui/DropDown.tsx";

// the legend locations, labelled with a display name (e.g. "Top-Left")
const LOCATION_OPTIONS: Array<DropDownOption<LegendLocation>> = Array.from(LEGEND_LOCATIONS.entries())
    .map(([label, value]) => ({value, label}))

// the width (px) of the external legend's container (beside the chart)
export const EXTERNAL_LEGEND_WIDTH = 100
// how long (ms) the external legend's container takes to open or close
export const LEGEND_ANIMATION_DURATION_MS = 220

type Props = {
    theme: Theme
    visibility: boolean
    setVisibility: (visibility: boolean) => void
    legendLocation: LegendLocation
    setLegendLocation: (location: LegendLocation) => void
}

/**
 * Checkbox for showing the legend, and a drop-down for where it's shown (disabled while the
 * legend is hidden)
 * @param props The theme, whether the legend is shown, the handler for showing or hiding it, the
 * legend's location, and the handler for a new location
 * @return The checkbox and the drop-down
 */
export function LegendControl(props: Props): JSX.Element {
    const {
        theme,
        visibility,
        setVisibility,
        legendLocation,
        setLegendLocation
    } = props

    return (
        <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            alignContent: 'center',
            flexDirection: 'row',
            gap: 5,
        }}>
            {/* (a plain container, not a <label>: a click on a label is forwarded to the first
                control inside it -- here, the drop-down's button, since the checkbox isn't a
                native input -- so checking the checkbox would also open the drop-down) */}
            <div style={{color: theme.color, display: 'inline'}}>
                <Checkbox
                    key={3}
                    checked={visibility}
                    label="legend"
                    backgroundColor={theme.backgroundColor}
                    borderColor={theme.color}
                    labelColor={theme.color}
                    onChange={() => setVisibility(!visibility)}
                />
                <span style={{paddingRight: 10}}></span>
                <DropDown
                    theme={theme}
                    name="legend-location"
                    options={LOCATION_OPTIONS}
                    value={legendLocation}
                    onChange={setLegendLocation}
                    disabled={!visibility}
                />
            </div>
        </div>
    )
}