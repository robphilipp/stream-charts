import * as d3 from "d3";
import {defaultLineStyle, type SeriesLineStyle} from "../axes/axes";
import type {GeoAggregate} from "../datasources/geoRollups";
import {geoDatumOf, type GeoDatum, geoSeriesFrom} from "../series/geoSeries";
import {type DrawnMarker, markerKeyOf} from "./geoMarkers";
import {
    drawAggregates,
    drawEvents,
    drawFlashes,
    drawHoveredEvent,
    drawMap,
    frameOf,
    type GeoAggregateStyle,
    type GeoEventStyle,
    type GeoFrame,
    type GeoMapSettings,
    type MarkerGeometry,
    type ShowingFlash,
} from "./geoScene";

const WIDTH = 800
const HEIGHT = 500
const MARGIN = {left: 10, top: 20}

/**
 * A stand-in for a canvas' context, recording what's drawn: each call (its name and arguments), and
 * each style set (`fillStyle=`, and so on, with its value), in order
 */
type Recording = {context: CanvasRenderingContext2D, calls: Array<[string, ...Array<unknown>]>}

/**
 * @return A stand-in for a canvas' context, recording what's drawn into it
 */
function recordingContext(): Recording {
    const calls: Array<[string, ...Array<unknown>]> = []
    const state: Record<string | symbol, unknown> = {}
    const context = new Proxy(state, {
        get: (target, property) => property in target ?
            target[property] :
            (...args: Array<unknown>): unknown => {
                calls.push([String(property), ...args])
                if (property === 'measureText') return {width: 6 * String(args[0]).length}
                if (property === 'createLinearGradient') return {addColorStop: (): void => undefined}
                return undefined
            },
        set: (target, property, value) => {
            target[property] = value
            calls.push([`${String(property)}=`, value])
            return true
        },
    })
    return {context: context as unknown as CanvasRenderingContext2D, calls}
}

/**
 * @param recording What was drawn
 * @param style A style (e.g. `fillStyle`)
 * @return The values it was set to, in order
 */
const setsOf = (recording: Recording, style: string): Array<unknown> =>
    recording.calls.filter(([name]) => name === `${style}=`).map(([, value]) => value)

/**
 * @param recording What was drawn
 * @return Each fill's style and opacity, in order
 */
function fillsOf(recording: Recording): Array<{fill: unknown, alpha: unknown}> {
    let fill: unknown = undefined
    let alpha: unknown = 1
    const fills: Array<{fill: unknown, alpha: unknown}> = []
    recording.calls.forEach(([name, value]) => {
        if (name === 'fillStyle=') fill = value
        else if (name === 'globalAlpha=') alpha = value
        else if (name === 'fill') fills.push({fill, alpha})
    })
    return fills
}

// a stand-in for the `Path2D` the events' markers are traced into (the tests run outside a browser)
class RecordingPath {
    readonly calls: Array<string> = []
    moveTo(): void { this.calls.push('moveTo') }
    lineTo(): void { this.calls.push('lineTo') }
    ellipse(): void { this.calls.push('ellipse') }
    arc(): void { this.calls.push('arc') }
    closePath(): void { this.calls.push('closePath') }
}
const globals = globalThis as unknown as {Path2D?: unknown}
const originalPath2D = globals.Path2D
beforeAll(() => {
    globals.Path2D = RecordingPath
})
afterAll(() => {
    globals.Path2D = originalPath2D
})

// a globe filling the plot area, looking at 0° E, 0° N
const globe = (): d3.GeoProjection => d3.geoOrthographic().fitSize([WIDTH, HEIGHT], {type: 'Sphere'})

/**
 * @param options What to change of the frame's defaults: a globe, nothing faded, nothing hovered
 * @return The frame
 */
const frameWith = (options: Partial<Parameters<typeof frameOf>[0]> = {}): GeoFrame => frameOf({
    projection: globe(),
    width: WIDTH,
    height: HEIGHT,
    margin: MARGIN,
    color: '#000000',
    backgroundColor: '#ffffff',
    latestTime: 1000,
    fade: undefined,
    hoveredSeriesName: null,
    isolateHoveredSeries: true,
    hoveredKey: undefined,
    ...options,
})

describe('a frame', () => {
    it('places what shows, and nothing on the far side of a globe or beyond the plot area', () => {
        const frame = frameWith()
        const [x, y] = frame.shownAt(0, 0)!
        expect(x).toBeCloseTo(WIDTH / 2, 6)
        expect(y).toBeCloseTo(HEIGHT / 2, 6)
        expect(frame.shownAt(0, 180)).toBeUndefined()
        // (a flat map, zoomed in on the middle: the edges of the earth are beyond the plot area)
        const flat = d3.geoEquirectangular().fitSize([WIDTH, HEIGHT], {type: 'Sphere'})
        flat.scale(flat.scale() * 4)
        expect(frameWith({projection: flat}).shownAt(0, 170)).toBeUndefined()
        expect(frameWith({projection: flat}).shownAt(0, 1)).toBeDefined()
    })

    it('fades the events by their age, relative to the latest event', () => {
        const frame = frameWith({fade: {duration: 100, opacity: 0.25}})
        expect(frame.fadeLevelOf(1000)).toBe(0)
        expect(frame.fadingOf(frame.fadeLevelOf(1000))).toBe(1)
        expect(frame.fadingOf(frame.fadeLevelOf(900))).toBeCloseTo(0.25, 9)
        // (and no older than faded)
        expect(frame.fadeLevelOf(0)).toBe(frame.fadeLevelOf(900))
        // (nothing fades without a fade)
        expect(frameWith().fadeLevelOf(0)).toBe(0)
    })

    it('shows only the hovered series when isolating it, and dims the others when highlighting it', () => {
        const isolating = frameWith({hoveredSeriesName: 'a', isolateHoveredSeries: true})
        expect(isolating.shownWithHovered('a')).toBe(true)
        expect(isolating.shownWithHovered('b')).toBe(false)
        const highlighting = frameWith({hoveredSeriesName: 'a', isolateHoveredSeries: false})
        expect(highlighting.shownWithHovered('b')).toBe(true)
        expect(highlighting.dimmingOf('a')).toBe(1)
        expect(highlighting.dimmingOf('b')).toBeLessThan(1)
        expect(frameWith().dimmingOf('b')).toBe(1)
    })
})

describe('the map', () => {
    const land: GeoJSON.Feature = {
        type: 'Feature',
        properties: {},
        geometry: d3.geoGraticule().extent([[-20, -20], [20, 20]]).outline(),
    }
    const map = (settings: Partial<GeoMapSettings> = {}): GeoMapSettings => ({
        graticule: d3.geoGraticule10(),
        showGraticule: true,
        basemap: land,
        borders: {type: 'LineString', coordinates: [[-10, 0], [10, 0]]},
        layers: undefined,
        oceanColor: 'ocean',
        landColor: 'land',
        borderColor: 'border',
        graticuleColor: 'graticule',
        outlineColor: 'outline',
        color: '#000000',
        ...settings,
    })
    const view = {rotate: [0, 0, 0] as [number, number, number], k: 1, offsetY: 0}

    it('draws the oceans, the graticule, the land, the borders, and the outline, in that order', () => {
        const recording = recordingContext()
        drawMap(recording.context, globe(), undefined, view, map(), WIDTH, HEIGHT)
        const styles = recording.calls
            .filter(([name]) => name === 'fillStyle=' || name === 'strokeStyle=')
            .map(([, value]) => value)
        expect(styles).toEqual(['ocean', 'graticule', 'land', 'border', 'outline'])
    })

    it('leaves out the graticule when it isn\'t shown', () => {
        const recording = recordingContext()
        drawMap(recording.context, globe(), undefined, view, map({showGraticule: false}), WIDTH, HEIGHT)
        expect(setsOf(recording, 'strokeStyle')).toEqual(['border', 'outline'])
    })

    it('clips the map to the plot area while drawing it, and puts the projection\'s clipping back', () => {
        const projection = globe()
        let clipped: Array<Array<number>> | null = null
        const recording = recordingContext()
        // (the clipping in force while the land is filled)
        const context = new Proxy(recording.context, {
            get: (target, property) => property === 'fill' ?
                (): void => {
                    clipped = projection.clipExtent()
                } :
                Reflect.get(target, property),
        })
        drawMap(context, projection, undefined, view, map(), WIDTH, HEIGHT)
        expect(clipped).not.toBeNull()
        expect(projection.clipExtent()).toBeNull()
    })

    it('fills the whole plot area for a composite projection, which has no sphere to fill or outline', () => {
        const projection = d3.geoAlbersUsa().fitSize([WIDTH, HEIGHT], land)
        const recording = recordingContext()
        drawMap(recording.context, projection, undefined, view, map(), WIDTH, HEIGHT)
        expect(recording.calls).toContainEqual(['fillRect', 0, 0, WIDTH, HEIGHT])
        expect(setsOf(recording, 'strokeStyle')).not.toContain('outline')
    })
})

/**
 * @param id The aggregate's ID
 * @param latitude Its latitude
 * @param longitude Its longitude
 * @param count Its number of events
 * @param groups Its groups (name and count)
 * @return An aggregate
 */
const aggregateOf = (
    id: string, latitude: number, longitude: number, count: number, groups: Array<[string, number]> = [],
): GeoAggregate => ({
    id, latitude, longitude, count, sensorCount: 1, values: {}, firstTime: 0, lastTime: 1000, measures: {},
    groups: groups.map(([group, groupCount]) => ({group, count: groupCount, values: {}})),
})

const aggregateStyle = (style: Partial<GeoAggregateStyle> = {}): GeoAggregateStyle => ({
    shape: 'circles',
    sizeBy: 'count',
    radius: [2, 20],
    colorScheme: d3.interpolateYlOrRd,
    color: 'aggregate',
    opacity: 0.5,
    showKeys: false,
    ...style,
})

describe('the aggregates', () => {
    it('draws the largest first (so the small ones show over them), sized by their counts', () => {
        const small = aggregateOf('small', 0, 0, 25)
        const large = aggregateOf('large', 10, 10, 100)
        const scene = drawAggregates(recordingContext().context, frameWith(), [small, large], 'cells', aggregateStyle(), new Map(), undefined)
        expect(scene.markers.map(marker => marker.target.kind === 'aggregate' && marker.target.aggregate.id)).toEqual(['large', 'small'])
        // (the largest the largest radius; a quarter of its count, half its radius beyond the smallest)
        expect(scene.markers[0].hitRadius).toBe(20)
        expect(scene.markers[1].hitRadius).toBeCloseTo(2 + 18 * Math.sqrt(25 / 100), 9)
        // (the markers are in the canvas' coordinates)
        const [x, y] = frameWith().shownAt(10, 10)!
        expect(scene.markers[0].x).toBeCloseTo(x + MARGIN.left, 9)
        expect(scene.markers[0].y).toBeCloseTo(y + MARGIN.top, 9)
    })

    it('leaves out the aggregates that don\'t show (e.g. on the far side of a globe)', () => {
        const far = aggregateOf('far', 0, 180, 5)
        const scene = drawAggregates(recordingContext().context, frameWith(), [far], 'cells', aggregateStyle(), new Map(), undefined)
        expect(scene.markers).toEqual([])
    })

    it('divides a pie into a wedge per group, and dims the other groups while one is hovered in the legend', () => {
        const pie = aggregateOf('pie', 0, 0, 4, [['a', 3], ['b', 1]])
        const style = aggregateStyle({shape: 'pies', groupColors: group => group === 'a' ? 'red' : 'blue'})

        const plain = recordingContext()
        drawAggregates(plain.context, frameWith(), [pie], 'cells', style, new Map(), undefined)
        expect(fillsOf(plain)).toEqual([{fill: 'red', alpha: 0.5}, {fill: 'blue', alpha: 0.5}])

        const hovered = recordingContext()
        drawAggregates(hovered.context, frameWith({hoveredSeriesName: 'a'}), [pie], 'cells', style, new Map(), undefined)
        const [a, b] = fillsOf(hovered)
        expect(a).toEqual({fill: 'red', alpha: 0.5})
        expect(b.alpha).toBeLessThan(0.5)
    })

    it('hands out the categorical colors to the groups without colors of their own, and keeps them', () => {
        const colors = new Map<string, string>()
        const style = aggregateStyle({shape: 'pies'})
        const first = recordingContext()
        drawAggregates(first.context, frameWith(), [aggregateOf('pie', 0, 0, 2, [['a', 1], ['b', 1]])], 'cells', style, colors, undefined)
        // (b the larger now: each keeps its color)
        const second = recordingContext()
        drawAggregates(second.context, frameWith(), [aggregateOf('pie', 0, 0, 3, [['b', 2], ['a', 1]])], 'cells', style, colors, undefined)
        expect(fillsOf(second).map(({fill}) => fill)).toEqual([colors.get('a'), colors.get('b')])
        expect(colors.get('a')).not.toBe(colors.get('b'))
    })

    it('keeps each group\'s wedge in its place as the counts change (the wedges are in the groups\' order, by name)', () => {
        const style = aggregateStyle({shape: 'pies', groupColors: group => group})
        const recording = recordingContext()
        // (an aggregate lists its groups the largest first)
        drawAggregates(recording.context, frameWith(), [aggregateOf('pie', 0, 0, 6, [['c', 3], ['a', 2], ['b', 1]])], 'cells', style, new Map(), undefined)
        expect(fillsOf(recording).map(({fill}) => fill)).toEqual(['a', 'b', 'c'])
    })

    it('hands what\'s under the mouse the series the aggregates count, when not all of them', () => {
        const aggregate = aggregateOf('a', 0, 0, 1)
        const filter = /^b$/
        const [filtered] = drawAggregates(recordingContext().context, frameWith(), [aggregate], 'cells', aggregateStyle(), new Map(), undefined, filter).markers
        expect(filtered.target).toEqual({kind: 'aggregate', rollup: 'cells', aggregate, seriesFilter: filter})
        const [all] = drawAggregates(recordingContext().context, frameWith(), [aggregate], 'cells', aggregateStyle(), new Map(), undefined).markers
        expect(all.target).toEqual({kind: 'aggregate', rollup: 'cells', aggregate})
    })

    it('draws a grid\'s cells as areas (for hit-testing by place, not as markers)', () => {
        const cell = {...aggregateOf('cell', 5, 5, 3), bounds: {west: 0, south: 0, east: 10, north: 10}}
        const scene = drawAggregates(recordingContext().context, frameWith(), [cell], 'grid', aggregateStyle({shape: 'cells'}), new Map(), undefined)
        expect(scene.cells).toEqual([cell])
        expect(scene.markers).toEqual([])
    })

    it('outlines the hovered aggregate last, over the others', () => {
        const hovered = aggregateOf('hovered', 0, 0, 1)
        const other = aggregateOf('other', 5, 5, 100)
        const hoveredKey = markerKeyOf({kind: 'aggregate', rollup: 'cells', aggregate: hovered})
        const recording = recordingContext()
        const scene = drawAggregates(recording.context, frameWith({hoveredKey}), [hovered, other], 'cells', aggregateStyle(), new Map(), undefined)
        expect(scene.highlighted?.target).toEqual({kind: 'aggregate', rollup: 'cells', aggregate: hovered})
        const lastStroke = recording.calls.map(([name]) => name).lastIndexOf('stroke')
        const lastWidth = recording.calls.map(([name]) => name).lastIndexOf('lineWidth=')
        expect(recording.calls[lastWidth][1]).toBe(2)
        expect(lastWidth).toBeLessThan(lastStroke)
    })

    it('draws the keys, labelled with what the sizes show, only when asked', () => {
        const aggregates = [aggregateOf('a', 0, 0, 1), aggregateOf('b', 5, 5, 10)]
        const shown = recordingContext()
        drawAggregates(shown.context, frameWith(), aggregates, 'cells', aggregateStyle({showKeys: true}), new Map(), undefined)
        expect(shown.calls.filter(([name]) => name === 'fillText').map(([, text]) => text)).toContain('count')
        const hidden = recordingContext()
        drawAggregates(hidden.context, frameWith(), aggregates, 'cells', aggregateStyle({showKeys: false}), new Map(), undefined)
        expect(hidden.calls.filter(([name]) => name === 'fillText')).toEqual([])
    })
})

describe('the events', () => {
    const styleOf = (color: string): SeriesLineStyle => ({...defaultLineStyle(), color, highlightColor: `${color}!`})
    const seriesStyles = new Map([['a', styleOf('red')], ['b', styleOf('blue')], ['c', styleOf('green')]])
    const eventStyle = (style: Partial<GeoEventStyle<null>> = {}): GeoEventStyle<null> => ({
        seriesFilter: /./,
        seriesStyles,
        colorOf: undefined,
        radiusOf: undefined,
        markerRadius: 3,
        markerOpacity: 0.8,
        ...style,
    })
    const event = (sensor: string, latitude: number, longitude: number): GeoDatum<null> => geoDatumOf(sensor, latitude, longitude, 1000, null)
    const series = () => [
        geoSeriesFrom('a', [event('a1', 0, 0), event('a2', 1, 1)]),
        geoSeriesFrom('b', [event('b1', 2, 2)]),
        geoSeriesFrom('c', [event('c1', 3, 3)]),
    ]
    const fillColorsOf = (recording: Recording): Array<unknown> => fillsOf(recording).map(({fill}) => fill)

    it('draws each series\' markers, in its color, as a path of its own', () => {
        const recording = recordingContext()
        const scene = drawEvents(recording.context, frameWith(), series(), eventStyle(), undefined)
        expect(fillColorsOf(recording)).toEqual(['red', 'blue', 'green'])
        expect(scene.markers).toHaveLength(4)
        expect(scene.markers[0].hitRadius).toBe(6)
    })

    it('leaves out the series the filter leaves out, and, isolating the hovered series, the others', () => {
        const filtered = recordingContext()
        drawEvents(filtered.context, frameWith(), series(), eventStyle({seriesFilter: /^[ab]$/}), undefined)
        expect(fillColorsOf(filtered)).toEqual(['red', 'blue'])
        const isolated = recordingContext()
        drawEvents(isolated.context, frameWith({hoveredSeriesName: 'b'}), series(), eventStyle(), undefined)
        expect(fillColorsOf(isolated)).toEqual(['blue'])
    })

    it('draws the series hovered in the legend over the others, which are dimmed, when highlighting it', () => {
        const recording = recordingContext()
        drawEvents(recording.context, frameWith({hoveredSeriesName: 'a', isolateHoveredSeries: false}), series(), eventStyle(), undefined)
        const fills = fillsOf(recording)
        expect(fills.map(({fill}) => fill)).toEqual(['blue', 'green', 'red'])
        expect(fills[2].alpha).toBeCloseTo(0.8, 9)
        expect(fills[0].alpha).toBeLessThan(0.8)
    })

    it('finds the hovered event\'s marker', () => {
        const all = series()
        const hovered = all[1].data.at(0)!
        const scene = drawEvents(recordingContext().context, frameWith({hoveredKey: hovered}), all, eventStyle(), undefined)
        expect(scene.highlighted?.target).toEqual({kind: 'event', seriesName: 'b', datum: hovered})
    })

    it('keeps the markers\' geometry for the view, so that redrawing projects only new events', () => {
        let sized = 0
        const style = eventStyle({
            radiusOf: () => {
                sized += 1
                return 3
            }
        })
        const geometries = new WeakMap<GeoDatum<null>, MarkerGeometry>()
        const all = series()
        drawEvents(recordingContext().context, frameWith(), all, style, geometries)
        expect(sized).toBe(4)
        drawEvents(recordingContext().context, frameWith(), all, style, geometries)
        expect(sized).toBe(4)
    })
})

describe('the flashes', () => {
    const seriesStyles = new Map([['a', {...defaultLineStyle(), color: 'red'}], ['b', {...defaultLineStyle(), color: 'blue'}]])
    const flashAt = (seriesName: string, latitude: number, longitude: number, start: number = 0): ShowingFlash<null> => ({
        latitude, longitude, radius: 20, duration: 1000, color: undefined,
        datum: geoDatumOf('sensor', latitude, longitude, 0, null), seriesName, start,
    })
    const strokesOf = (recording: Recording): Array<{color: unknown, width: unknown}> => {
        let color: unknown = undefined
        let width: unknown = undefined
        const strokes: Array<{color: unknown, width: unknown}> = []
        recording.calls.forEach(([name, value]) => {
            if (name === 'strokeStyle=') color = value
            else if (name === 'lineWidth=') width = value
            else if (name === 'stroke') strokes.push({color, width})
        })
        return strokes
    }
    const draw = (flashes: Array<ShowingFlash<null>>, frame: GeoFrame = frameWith(), now: number = 500): Recording => {
        const recording = recordingContext()
        drawFlashes(recording.context, frame, flashes, {colorOf: undefined, seriesStyles, mergeDistance: 20}, now)
        return recording
    }

    it('draws a ring per flash, in its series\' color', () => {
        expect(strokesOf(draw([flashAt('a', 0, 0), flashAt('b', 30, 30)])).map(({color}) => color)).toEqual(['red', 'blue'])
    })

    it('draws flashes of a color close together on the screen as one ring, wider for the more it stands for', () => {
        const strokes = strokesOf(draw([flashAt('a', 0, 0), flashAt('a', 0.01, 0.01)]))
        expect(strokes).toEqual([{color: 'red', width: 3}])
    })

    it('leaves out the flashes that are over, and, isolating the hovered series, the others\'', () => {
        expect(strokesOf(draw([flashAt('a', 0, 0)], frameWith(), 1500))).toEqual([])
        expect(strokesOf(draw([flashAt('a', 0, 0), flashAt('b', 30, 30)], frameWith({hoveredSeriesName: 'b'}))).map(({color}) => color))
            .toEqual(['blue'])
    })
})

describe('the hovered event', () => {
    const seriesStyles = new Map([['a', {...defaultLineStyle(), highlightColor: 'highlight'}]])
    const datum = geoDatumOf('sensor', 0, 0, 0, null)

    it('is drawn enlarged, in its series\' highlight color', () => {
        const recording = recordingContext()
        const marker: DrawnMarker<null> = {x: 0, y: 0, hitRadius: 6, target: {kind: 'event', seriesName: 'a', datum}}
        drawHoveredEvent(recording.context, frameWith(), marker, seriesStyles)
        expect(setsOf(recording, 'fillStyle')).toEqual(['highlight'])
    })

    it('isn\'t drawn for a hovered aggregate (which the aggregates outline themselves)', () => {
        const recording = recordingContext()
        const marker: DrawnMarker<null> = {
            x: 0, y: 0, hitRadius: 6, target: {kind: 'aggregate', rollup: 'cells', aggregate: aggregateOf('a', 0, 0, 1)},
        }
        drawHoveredEvent(recording.context, frameWith(), marker, seriesStyles)
        expect(recording.calls).toEqual([])
    })
})
