import {type JSX} from "react";
import type {GeoProjectionName} from "stream-charts";
import type {Theme} from "../../ui/Themes.ts";
import {DropDown, type DropDownOption} from "../../ui/DropDown.tsx";

// the map projections, valued by their name in the GeoPlot (e.g. "naturalEarth1"), and labelled
// with a display name
const OPTIONS: Array<DropDownOption<GeoProjectionName>> = [
    {value: 'orthographic', label: 'Orthographic (globe)'},
    {value: 'azimuthalEqualArea', label: 'Azimuthal equal-area'},
    {value: 'azimuthalEquidistant', label: 'Azimuthal equidistant'},
    {value: 'stereographic', label: 'Stereographic'},
    {value: 'equirectangular', label: 'Equirectangular'},
    {value: 'mercator', label: 'Mercator'},
    {value: 'transverseMercator', label: 'Transverse Mercator'},
    {value: 'naturalEarth1', label: 'Natural Earth'},
    {value: 'equalEarth', label: 'Equal Earth'},
    {value: 'conicEqualArea', label: 'Conic equal-area'},
    {value: 'conicEquidistant', label: 'Conic equidistant'},
    // (a composite, which shows only the United States, so the view frames it, and shifts)
    {value: 'albersUsa', label: 'Albers USA (composite)'},
]

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
                options={OPTIONS}
                value={projection}
                onChange={handleProjectionChange}
            />
            <span style={{paddingLeft: 10}}>Projection</span>
        </label>
    )
}
