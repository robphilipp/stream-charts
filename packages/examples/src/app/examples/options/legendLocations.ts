import {LegendLocation} from "../../charts/legends/constants.ts";

export const LEGEND_LOCATIONS = new Map<string, LegendLocation>([
    ['Top-Left', LegendLocation.TOP_LEFT],
    ['Top-Right', LegendLocation.TOP_RIGHT],
    ['Bottom-Left', LegendLocation.BOTTOM_LEFT],
    ['Bottom-Right', LegendLocation.BOTTOM_RIGHT],
    ['External', LegendLocation.EXTERNAL_CONTAINER]
])
