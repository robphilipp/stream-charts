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

/**
 * A road of the United States (from Natural Earth's 1:10m roads): its level (`Interstate`,
 * `Federal`, `State`, ...), its rank (Natural Earth's scalerank, from 3, the most important, to 8),
 * and its name (e.g. its route number)
 */
export type UsRoad = GeoJSON.Feature<GeoJSON.LineString | GeoJSON.MultiLineString, {level: string | null, rank: number, name: string | null}>

/**
 * @return The United States' roads (interstates, and the federal and state highways), loaded (as a
 * chunk of their own) on the first call. Extracted from Natural Earth's 1:10m roads (public domain):
 * the US roads, without the ferry routes, their coordinates rounded to 3 decimals (about 100 m).
 */
export async function usRoads(): Promise<Array<UsRoad>> {
    const roads = (await import("./usRoads.json")).default as unknown as GeoJSON.FeatureCollection
    return roads.features as Array<UsRoad>
}

type UsTopology = Topology<{counties: GeometryCollection<{name: string}>, states: GeometryCollection<{name: string}>, nation: GeometryCollection}>

/**
 * The United States in detail, for the Albers USA view: its outline at 1:10m, and its states and
 * counties (named), and the borders between them
 */
export interface UsDetail {
    // the outline, at 1:10m (Natural Earth's, as are the coarser outlines, so the coast matches them)
    outline: GeoJSON.Feature
    // the states, and the borders between them
    states: GeoJSON.FeatureCollection
    stateBorders: GeoJSON.MultiLineString
    // the counties, and the borders between those in the same state
    counties: GeoJSON.FeatureCollection
    countyBorders: GeoJSON.MultiLineString
}

/**
 * @return The United States in detail, loaded (as chunks of their own) on the first call: its outline
 * from Natural Earth's 1:10m countries (world-atlas), and its states and counties from the Census
 * Bureau's cartographic boundaries, 2017 (us-atlas). (us-atlas's coast is simplified for a map of
 * the whole country, so it gives only the borders inside it.)
 */
export async function usDetail(): Promise<UsDetail> {
    const [world10m, us] = await Promise.all([
        import("world-atlas/countries-10m.json").then(module => module.default as unknown as WorldTopology),
        import("us-atlas/counties-10m.json").then(module => module.default as unknown as UsTopology),
    ])
    const outline = feature(world10m, world10m.objects.countries).features
        .find(country => (country.properties as {name?: string} | null)?.name === 'United States of America')
    if (outline === undefined) throw new Error("The 1:10m countries have no United States")
    return {
        outline,
        states: feature(us, us.objects.states),
        stateBorders: mesh(us, us.objects.states, (a, b) => a !== b),
        counties: feature(us, us.objects.counties),
        // (a county's id is its FIPS code, whose first two digits are its state's)
        countyBorders: mesh(us, us.objects.counties, (a, b) => a !== b && String(a.id).slice(0, 2) === String(b.id).slice(0, 2)),
    }
}

/**
 * A lake or river of the United States (Natural Earth's): its name, and its rank (Natural Earth's
 * scalerank: the lower, the more important)
 */
export type UsWater = GeoJSON.Feature<GeoJSON.Geometry, {name: string | null, rank: number}>

/**
 * A city of the United States (Natural Earth's populated places): its name, its rank (Natural Earth's
 * scalerank, from 0, the most important, to 8), and its population (of its metropolitan area)
 */
export type UsCity = GeoJSON.Feature<GeoJSON.Point, {name: string, rank: number, population: number}>

/**
 * @return The United States' lakes and rivers, the most important first, loaded (as chunks of their
 * own) on the first call. Extracted from Natural Earth's 1:10m lakes and North American rivers (public
 * domain): those in the United States, their coordinates rounded to 3 decimals (about 100 m).
 */
export async function usLakesAndRivers(): Promise<{lakes: Array<UsWater>, rivers: Array<UsWater>}> {
    const [lakes, rivers] = await Promise.all([
        import("./usLakes.json").then(module => module.default as unknown as GeoJSON.FeatureCollection),
        import("./usRivers.json").then(module => module.default as unknown as GeoJSON.FeatureCollection),
    ])
    return {lakes: lakes.features as Array<UsWater>, rivers: rivers.features as Array<UsWater>}
}

/**
 * @return The United States' cities, the most important first, loaded (as a chunk of its own) on the
 * first call. Extracted from Natural Earth's 1:10m populated places (public domain).
 */
export async function usCities(): Promise<Array<UsCity>> {
    const cities = (await import("./usCities.json")).default as unknown as GeoJSON.FeatureCollection
    return cities.features as Array<UsCity>
}
