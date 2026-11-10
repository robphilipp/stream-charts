import {feature, mesh} from "topojson-client"
import type {GeometryCollection, Topology} from "topojson-specification"
import countries110m from "world-atlas/countries-110m.json"

/*
    The geo example's basemap: Natural Earth's 1:110m countries and land (from the world-atlas
    package, as TopoJSON), converted to the GeoJSON that the GeoPlot draws. Bundled with the app,
    so nothing is fetched at run time. And the 1:50m countries and land, for zoomed-in views: about
    seven times as large, so loaded (as a chunk of their own) when they're first wanted.
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

/**
 * The countries, as a GeoJSON feature collection (each with its `name` property)
 */
export const COUNTRIES = feature(world, world.objects.countries)

/**
 * The United Kingdom's outline (e.g. for framing the view on it)
 */
export const UNITED_KINGDOM = COUNTRIES.features.find(country => (country.properties as {name?: string} | null)?.name === 'United Kingdom')

/**
 * The United States' outline, Alaska and Hawaii included (e.g. for framing the view on it, or for
 * the Albers USA projection, which shows nothing else)
 */
export const UNITED_STATES = COUNTRIES.features.find(country => (country.properties as {name?: string} | null)?.name === 'United States of America')

/**
 * The map at a finer level of detail (1:50m): the land, the borders between countries, and the
 * countries
 */
export interface DetailedWorld {
    land: ReturnType<typeof feature>
    borders: ReturnType<typeof mesh>
    countries: typeof COUNTRIES
}

/**
 * @return The map at a finer level of detail (1:50m), loaded on the first call
 */
export async function detailedWorld(): Promise<DetailedWorld> {
    const detailed = (await import("world-atlas/countries-50m.json")).default as unknown as WorldTopology
    return {
        land: feature(detailed, detailed.objects.land),
        borders: mesh(detailed, detailed.objects.countries, (a, b) => a !== b),
        countries: feature(detailed, detailed.objects.countries),
    }
}
