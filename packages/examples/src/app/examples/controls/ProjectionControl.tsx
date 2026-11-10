import {type JSX} from "react";
import type {GeoProjectionName} from "stream-charts";
import type {Theme} from "../../ui/Themes.ts";
import {DropDown} from "../../ui/DropDown.tsx";
import {PROJECTION_OPTIONS} from "./geoControlOptions.ts";

type Props = {
    theme: Theme
    projection: GeoProjectionName
    handleProjectionChange: (projection: GeoProjectionName) => void
}

/**
 * The drop-down for choosing the geo plot's map projection (its `projection` property)
 * @param props The theme, the current projection, and the handler for a new one
 * @return The drop-down, with its label
 */
export function ProjectionControl(props: Props): JSX.Element {
    const {theme, projection, handleProjectionChange} = props
    return (
        <label style={{color: theme.color}}>
            <DropDown
                theme={theme}
                name="projections"
                options={PROJECTION_OPTIONS}
                value={projection}
                onChange={handleProjectionChange}
            />
            <span style={{paddingLeft: 10}}>Projection</span>
        </label>
    )
}
