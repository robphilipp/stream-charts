import {feature, mesh} from "topojson-client"
import type {GeometryCollection, Topology} from "topojson-specification"
import countries110m from "world-atlas/countries-110m.json"

/*
    The geo example's basemap: Natural Earth's 1:110m countries and land (from the world-atlas
    package, as TopoJSON), converted to the GeoJSON that the GeoPlot draws. Bundled with the app,
    so nothing is fetched at run time.
 */

type WorldTopology = Topology<{countries: GeometryCollection, land: GeometryCollection}>

const world = countries110m as unknown as WorldTopology

/**
 * The land, as one GeoJSON feature collection (drawn filled)
 */
export const LAND = feature(world, world.objects.land)

/**
 * The borders between countries, as one GeoJSON multi-line (shared borders once, without the
 * coastlines, which the land's fill already shows)
 */
export const COUNTRY_BORDERS = mesh(world, world.objects.countries, (a, b) => a !== b)
