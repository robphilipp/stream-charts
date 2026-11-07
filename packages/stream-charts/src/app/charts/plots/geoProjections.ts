import * as d3 from "d3"
import type {GeoDatum} from "../series/geoSeries"

/**
 * The map projections a {@link GeoPlot} can show by name (see its `projection` property). Any other
 * d3 projection can be handed to the plot directly.
 */
export const GeoProjections = {
    orthographic: d3.geoOrthographic,
    azimuthalEqualArea: d3.geoAzimuthalEqualArea,
    azimuthalEquidistant: d3.geoAzimuthalEquidistant,
    stereographic: d3.geoStereographic,
    equirectangular: d3.geoEquirectangular,
    mercator: d3.geoMercator,
    transverseMercator: d3.geoTransverseMercator,
    naturalEarth1: d3.geoNaturalEarth1,
    equalEarth: d3.geoEqualEarth,
    conicEqualArea: d3.geoConicEqualArea,
    conicEquidistant: d3.geoConicEquidistant,
} as const

/**
 * The name of a map projection a {@link GeoPlot} can show (see {@link GeoProjections})
 */
export type GeoProjectionName = keyof typeof GeoProjections

/**
 * What the tooltip gets about the event under the mouse (see {@link GeoPlotTooltipContent})
 * @template P The type of the events' payload
 */
export interface GeoTooltipMetadata<P> {
    /**
     * The name of the event's series
     */
    seriesName: string
    /**
     * The event under the mouse
     */
    datum: GeoDatum<P>
}
