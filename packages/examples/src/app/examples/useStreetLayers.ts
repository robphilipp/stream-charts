import {useCallback, useEffect, useMemo, useRef, useState} from "react"
import type {GeoLayer, GeoViewBox} from "stream-charts"
import type {Theme} from "../ui/Themes.ts"
import {STREET_CLASSES, type StreetClass, StreetTiles, type TileStreets, tileKeyOf, viewTilesOf} from "./dataproviders/streetTiles.ts"

// the tiles' roads, loaded once and kept for every geo chart (see `StreetTiles`)
const STREET_TILES = new StreetTiles()

// how long (ms) the view holds still before its tiles are loaded (so that a zoom of many wheel
// steps, or a quick pan, loads only the tiles of where it ends up)
const LOAD_DELAY = 150

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
 * The street map: the roads in view, from OpenFreeMap's tiles, at a level of detail for the zoom --
 * loaded as the view settles (each tile once, and kept), and handed to the plot as layers
 * @param enabled Whether the streets are shown
 * @param theme The theme (for the roads' colors)
 * @return The streets' layers (none while they're off, or the view is zoomed out past them), and the
 * handler for the plot's `onViewBoxChange`
 */
export function useStreetLayers(enabled: boolean, theme: Theme): {
    layers: Array<GeoLayer>
    handleViewBoxChange: (box: GeoViewBox | undefined, pixelsPerDegree: number) => void
} {
    // the part of the earth in view, as the plot last reported it
    const [view, setView] = useState<{box: GeoViewBox | undefined, pixelsPerDegree: number} | undefined>(undefined)
    const handleViewBoxChange = useCallback(
        (box: GeoViewBox | undefined, pixelsPerDegree: number): void => setView({box, pixelsPerDegree}),
        []
    )

    // the tiles the view takes (none while the streets are off, or the view is zoomed out past them)
    const tiles = useMemo(
        () => enabled && view !== undefined ? viewTilesOf(view.box, view.pixelsPerDegree) : [],
        [enabled, view]
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

    // a layer for each class of road (its lines from every tile, as one shape, so that it's drawn
    // as one path), the streets first, so that the main roads lie over them
    const layers = useMemo(
        (): Array<GeoLayer> => {
            if (tiles.length === 0 || streets.length === 0) return []
            const shade = theme.name === 'light' ? 'light' : 'dark'
            return STREET_CLASSES.flatMap(roadClass => {
                const coordinates = streets.flatMap(tile => tile.get(roadClass) ?? [])
                if (coordinates.length === 0) return []
                const style = STREET_STYLES[roadClass]
                return [{data: {type: 'MultiLineString', coordinates}, stroke: style[shade], lineWidth: style.width}]
            })
        },
        [tiles, streets, theme]
    )

    return {layers, handleViewBoxChange}
}
