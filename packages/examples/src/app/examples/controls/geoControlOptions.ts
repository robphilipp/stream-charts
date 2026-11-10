import type {GeoProjectionName} from "stream-charts";
import type {DropDownOption} from "../../ui/DropDown.tsx";
import type {GeoFocus, GeoShow} from "../appstate/geoChartStore.ts";

// the geo example's choices of what the plot shows (see `GeoAggregateControls`)
export const MODE_OPTIONS: Array<DropDownOption<GeoShow>> = [
    {value: 'auto', label: 'Auto (by zoom)'},
    {value: 'points', label: 'Events'},
    {value: 'aggregates', label: 'Aggregates'},
    {value: 'groups', label: 'Aggregates, by group'},
]

// the geo example's choices of what the view frames (see `FocusControl`)
export const FOCUS_OPTIONS: Array<DropDownOption<GeoFocus>> = [
    {value: 'world', label: 'The whole earth'},
    {value: 'europe', label: 'Europe'},
    {value: 'uk', label: 'United Kingdom'},
    {value: 'london', label: 'London'},
    {value: 'usa', label: 'United States'},
]

// the map projections, valued by their name in the GeoPlot (e.g. "naturalEarth1"), and labelled
// with a display name
export const PROJECTION_OPTIONS: Array<DropDownOption<GeoProjectionName>> = [
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
