import {useCallback, useEffect, useMemo, useRef, useState} from "react"
import * as d3 from "d3"
import type {GeoLayer, GeoViewBox} from "stream-charts"
import type {Theme} from "../ui/Themes.ts"
import {
    MIN_STREETS_ZOOM, PLACE_CLASSES, type Place, STREET_CLASSES, type StreetClass, StreetTiles, type TileStreets, tileKeyOf, viewTilesOf,
} from "./dataproviders/streetTiles.ts"

// the tiles' roads, loaded once and kept for every geo chart (see `StreetTiles`)
const STREET_TILES = new StreetTiles()

// how long (ms) the view holds still before its tiles are loaded (so that a zoom of many wheel
// steps, or a quick pan, loads only the tiles of where it ends up)
const LOAD_DELAY = 150

// the sea's and the land's colors as the plot draws them by default (a fraction of the way from the
// background to the chart's color): the sea a 5% tint, and the land a 20% tint over it
const SEA_TINT = 0.05
const LAND_TINT = SEA_TINT + 0.2 * (1 - SEA_TINT)

/**
 * @param theme The theme
 * @param tint How far (0 to 1) from the background toward the chart's color
 * @return The color, solid
 */
const tintOf = (theme: Theme, tint: number): string => d3.interpolateRgb(theme.backgroundColor, theme.color)(tint)

// each class of road's colors (by theme) and width (px): the main roads warmer and wider, the
// streets paler and finer, so that the map stays readable under the events
const STREET_STYLES: Record<StreetClass, {light: string, dark: string, width: number}> = {
    motorway: {light: '#d0843a', dark: '#c98a3e', width: 1.6},
    trunk: {light: '#d6974f', dark: '#b98c55', width: 1.4},
    primary: {light: '#c9a46e', dark: '#9a8466', width: 1.2},
    secondary: {light: '#bba98d', dark: '#857b6c', width: 1},
    tertiary: {light: '#a59a8b', dark: '#6f685e', width: 0.8},
    minor: {light: '#aca598', dark: '#5c5852', width: 0.5},
    service: {light: '#b7b1a6', dark: '#4f4c48', width: 0.4},
}

/**
 * A tile's layers: its land (the whole tile), its water, and its roads, by class
 */
type TileLayers = {land: GeoLayer, water: GeoLayer | undefined, roads: Map<StreetClass, GeoLayer>}

// each tile's layers, by theme: made once, so that the plot's culling of them (which finds each of a
// layer's lines' extent once, and keeps it with the layer's data) isn't done again as the view
// changes, or as more tiles arrive
const TILE_LAYERS = new WeakMap<TileStreets, Map<string, TileLayers>>()

/**
 * @param tile A tile's roads and water
 * @param theme The theme
 * @return The tile's layers (made once for the tile and the theme)
 */
function layersOfTile(tile: TileStreets, theme: Theme): TileLayers {
    let byTheme = TILE_LAYERS.get(tile)
    if (byTheme === undefined) {
        byTheme = new Map()
        TILE_LAYERS.set(tile, byTheme)
    }
    let layers = byTheme.get(theme.name)
    if (layers === undefined) {
        const {west, south, east, north} = tile.bounds
        const shade = theme.name === 'light' ? 'light' : 'dark'
        const roads = new Map<StreetClass, GeoLayer>()
        STREET_CLASSES.forEach(roadClass => {
            const coordinates = tile.roads.get(roadClass) ?? []
            if (coordinates.length === 0) return
            const style = STREET_STYLES[roadClass]
            roads.set(roadClass, {data: {type: 'MultiLineString', coordinates}, stroke: style[shade], lineWidth: style.width})
        })
        layers = {
            land: {
                data: d3.geoGraticule().extent([[west, south], [east, north]]).outline(),
                fill: tintOf(theme, LAND_TINT),
            },
            water: tile.water.length > 0 ? {data: {type: 'MultiPolygon', coordinates: tile.water}, fill: tintOf(theme, SEA_TINT)} : undefined,
            roads,
        }
        byTheme.set(theme.name, layers)
    }
    return layers
}

/**
 * The street map: the roads in view, from OpenFreeMap's tiles, at a level of detail for the zoom --
 * loaded as the view settles (each tile once, and kept), and handed to the plot as layers -- and,
 * so that the coasts are as detailed as the roads, the tiles' land and water. Under the map's other
 * layers, each tile is filled with the land's color, so that the land that the map's coarser coast
 * leaves out is there; and over them, the tiles' water (the sea, lakes, and rivers) is filled with
 * the sea's, so that the sea that its coarser coast takes in is sea, with the roads over it all.
 *
 * And the places' names, from the same tiles: dots, named where the names don't overlap, the larger
 * places first. The tiles of each zoom hold the places that suit it, so, zoomed out, only the largest
 * cities are named, and, the further in, the smaller cities, the towns, the villages, and, at the
 * streets' level, the suburbs and neighbourhoods. (The places' tiles are taken at any zoom, the
 * whole earth's when it's all in view; the streets only from their own zoom in.)
 * @param showStreets Whether the streets are shown
 * @param showPlaces Whether the places' names are shown
 * @param theme The theme (for the colors: the land and the sea's as the plot draws them, by default,
 * the roads', and the places')
 * @return The layers under the map's other layers (the tiles' land), and over them (their water, and
 * their roads) -- none while the streets are off, or the view is zoomed out past them -- the layer
 * of the places (to draw over everything else), and the handler for the plot's `onViewBoxChange`
 */
export function useStreetLayers(showStreets: boolean, showPlaces: boolean, theme: Theme): {
    landLayers: Array<GeoLayer>
    layers: Array<GeoLayer>
    placeLayers: Array<GeoLayer>
    handleViewBoxChange: (box: GeoViewBox | undefined, pixelsPerDegree: number) => void
} {
    // the part of the earth in view, as the plot last reported it
    const [view, setView] = useState<{box: GeoViewBox | undefined, pixelsPerDegree: number} | undefined>(undefined)
    const handleViewBoxChange = useCallback(
        (box: GeoViewBox | undefined, pixelsPerDegree: number): void => setView({box, pixelsPerDegree}),
        []
    )

    // the tiles the view takes: with the places shown, at any zoom; otherwise, none while the
    // streets are off, or the view is zoomed out past them
    const tiles = useMemo(
        () => (showStreets || showPlaces) && view !== undefined ?
            viewTilesOf(view.box, view.pixelsPerDegree, showPlaces ? 0 : MIN_STREETS_ZOOM) :
            [],
        [showStreets, showPlaces, view]
    )

    // the roads shown: the tiles of the view loaded so far -- and, until they've all loaded, the
    // previous view's (so that the map doesn't empty while the new tiles load)
    const [streets, setStreets] = useState<Array<TileStreets>>([])
    const shownRef = useRef<Array<TileStreets>>([])
    useEffect(
        () => {
            if (tiles.length === 0) {
                shownRef.current = []
                return
            }
            let cancelled = false
            const timer = setTimeout(() => {
                const previous = shownRef.current
                const loaded = new Map<string, TileStreets>()
                let settled = 0
                const update = (): void => {
                    if (cancelled) return
                    const complete = settled === tiles.length
                    const shown = [...loaded.values(), ...(complete ? [] : previous)]
                    if (complete) shownRef.current = [...loaded.values()]
                    setStreets(shown)
                }
                tiles.forEach(tile => {
                    STREET_TILES.streetsOf(tile)
                        .then(tileStreets => {
                            loaded.set(tileKeyOf(tile), tileStreets)
                        })
                        // (a tile that fails to load is left out, and tried again the next time)
                        .catch(() => undefined)
                        .finally(() => {
                            settled += 1
                            update()
                        })
                })
            }, LOAD_DELAY)
            return (): void => {
                cancelled = true
                clearTimeout(timer)
            }
        },
        [tiles]
    )

    // each tile's layers (made once for the tile, see `layersOfTile`)
    // (only those of the streets' zooms: the places' tiles zoomed out past them aren't drawn)
    const tileLayers = useMemo(
        (): Array<TileLayers> => tiles.length === 0 || !showStreets ? [] :
            streets.filter(({tile}) => tile.z >= MIN_STREETS_ZOOM).map(tile => layersOfTile(tile, theme)),
        [tiles, streets, theme, showStreets]
    )

    // the land, under the map's other layers: each tile, filled with the land's color (solid: the
    // plot's land is a tint of its color over its sea, which is a tint over the background)
    const landLayers = useMemo(
        (): Array<GeoLayer> => tileLayers.map(layers => layers.land),
        [tileLayers]
    )

    // over the map's other layers: every tile's water, in the sea's color, and then each class of
    // road, every tile's, the streets first, so that the main roads lie over them (across the tiles'
    // edges, too)
    const layers = useMemo(
        (): Array<GeoLayer> => [
            ...tileLayers.flatMap(({water}) => water !== undefined ? [water] : []),
            ...STREET_CLASSES.flatMap(roadClass => tileLayers.flatMap(({roads}) => roads.get(roadClass) ?? [])),
        ],
        [tileLayers]
    )

    // the places of the tiles shown (each once: while new tiles load, the previous view's, of
    // another zoom, may hold the same place), the larger first, so that their names are placed first
    const placeLayers = useMemo(
        (): Array<GeoLayer> => {
            if (tiles.length === 0 || !showPlaces) return []
            const places = new Map<string, Place>()
            streets.forEach(tile => tile.places.forEach(place => {
                const [longitude, latitude] = place.geometry.coordinates
                places.set(`${place.properties.name}|${longitude.toFixed(2)}|${latitude.toFixed(2)}`, place)
            }))
            if (places.size === 0) return []
            const importance = (place: Place): number => PLACE_CLASSES.indexOf(place.properties.class)
            const features = [...places.values()].sort((a, b) =>
                importance(a) - importance(b) || a.properties.rank - b.properties.rank
            )
            return [{
                data: {type: 'FeatureCollection', features},
                fill: theme.color,
                pointRadius: 2,
                label: (feature): string | undefined => feature.properties?.name,
                labelFont: '10px sans-serif',
            }]
        },
        [tiles, streets, theme, showPlaces]
    )

    return {landLayers, layers, placeLayers, handleViewBoxChange}
}
