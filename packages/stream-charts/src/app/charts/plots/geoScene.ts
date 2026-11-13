import * as d3 from "d3"
import {defaultLineStyle, type SeriesLineStyle} from "../axes/axes"
import {withAlpha} from "../styling/canvasStyle"
import {formatMeasure, type GeoAggregate, type GeoAggregateGroup} from "../datasources/geoRollups"
import type {GeoDatum, GeoSeries} from "../series/geoSeries"
import {detailOf, drawLayerLabels, drawLayerShapes, type GeoLayer, type GeoMapData, layerShownAt, viewBoxOf, visibleOf} from "./geoLayers"
import {canTurn, isGlobe, type GeoPlotViewState, shiftOf} from "./geoProjections"
import {type DrawnMarker, markerEllipseAt, type MarkerEllipse, markerKeyOf, pieGroupsOf, wedgeBearingsOf, wedgeOf} from "./geoMarkers"
import {flashGroupsOf, flashRingOf, type ResolvedGeoFlash} from "./geoFlashes"
import {directPen, type ReferenceShapes, shiftedPen} from "./geoPens"
import type {GeoAggregateOptions, GeoFadeOptions} from "./GeoPlot"

/*
    How a GeoPlot draws a frame: the map, and over it the events (or a roll-up's aggregates, with
    their keys), the flashes, and the hovered event. The plot keeps the state -- the view, the
    layers the map and the scene are kept in, what's hovered -- and hands each of these what it needs.
 */

const DEGREES = 180 / Math.PI

// the whole sphere, as GeoJSON
export const SPHERE: d3.GeoPermissibleObjects = {type: 'Sphere'}
// how far (px) beyond the plot area the map is clipped (so that the outlines of the areas clipped
// there fall outside the plot area, which the canvas clips to)
const MAP_CLIP_MARGIN = 4
// the number of distinct opacities the faded markers are drawn with (so that markers can still be
// drawn a path per color and opacity)
const FADE_LEVELS = 12
// how faint (a fraction of their opacity) faded events become, by default (see `GeoFadeOptions`)
const DEFAULT_FADED_OPACITY = 0.15
// the opacity (a fraction of their own) of the other series' events, while a series is hovered in
// the legend (when it's highlighted rather than isolated, see `hoveredSeries`)
const DIMMED_OPACITY = 0.2
// the most markers in a path (filled at once): filling a path takes time that grows faster than its
// number of shapes (four times as many shapes take over ten times as long), so a color and fading's
// markers are split into paths of at most this many
const MAX_MARKERS_PER_PATH = 256

/**
 * What a scene's drawing drew (see the `GeoPlot`'s `drawScene`): the markers, and the cells (for
 * finding what's under the mouse), and the hovered marker, if it was drawn
 */
export type DrawnScene<P> = {
    markers: Array<DrawnMarker<P>>
    cells: Array<GeoAggregate>
    highlighted: DrawnMarker<P> | undefined
}

/**
 * An event's marker's geometry, for a view: where its center is drawn (px, in the plot area), its
 * radius (px, at the view's center), and the ellipse it's drawn as (`undefined` when it's drawn
 * through the projection instead, see `markerEllipseAt`); or `null` when it isn't shown
 */
export type MarkerGeometry = {at: [number, number], radius: number, ellipse: MarkerEllipse | undefined} | null

/**
 * @param colors The colors handed out so far, by group (added to)
 * @param name A group's name
 * @return The group's color: one of d3's ten categorical colors, handed out in the order the groups
 * first show up, so that the first ten groups each get their own, and a group keeps its color
 */
function categoricalColorOf(colors: Map<string, string>, name: string): string {
    let color = colors.get(name)
    if (color === undefined) {
        color = d3.schemeTableau10[colors.size % d3.schemeTableau10.length]
        colors.set(name, color)
    }
    return color
}

/**
 * @param tally An aggregate, or one of its groups
 * @param name `count`, or the name of one of the roll-up's measures
 * @return The tally's count, or its value of the measure (`NaN` for an unknown measure)
 */
const valueOf = (tally: GeoAggregate | GeoAggregateGroup, name: string): number =>
    name === 'count' ? tally.count : (tally.values[name] ?? NaN)

// the most groups listed in the groups' key
const MAX_KEY_GROUPS = 8

/**
 * The groups' key (for pies without `colorBy`): the groups with the most events overall, and their
 * colors
 * @param aggregates The aggregates
 * @param colorOf The color of a group's wedges
 * @return The groups, the most events first, and how many more there are
 */
function groupKeyOf(aggregates: Array<GeoAggregate>, colorOf: (group: GeoAggregateGroup) => string): {groups: Array<{label: string, color: string}>, more: number} {
    const totals = new Map<string, {count: number, group: GeoAggregateGroup}>()
    aggregates.forEach(aggregate => aggregate.groups.forEach(group => {
        const total = totals.get(group.group)
        totals.set(group.group, {count: (total?.count ?? 0) + group.count, group: total?.group ?? group})
    }))
    const sorted = Array.from(totals.values()).sort((a, b) => b.count - a.count)
    return {
        groups: sorted.slice(0, MAX_KEY_GROUPS).map(({group}) => ({label: group.group, color: colorOf(group)})),
        more: Math.max(0, sorted.length - MAX_KEY_GROUPS),
    }
}

/**
 * @param value A value for a key
 * @return The value, briefly (e.g. 1.2k, 3.45)
 */
const keyLabel = (value: number): string => Math.abs(value) >= 1000 ? d3.format('.3~s')(value) : d3.format(',.3~g')(value)

/**
 * The keys for the aggregates (in the bottom-right corner of the plot area): nested circles for
 * the sizes, and a color bar for the colors
 * @param context2D The canvas' context (translated to the plot area)
 * @param width The width of the plot area
 * @param height The height of the plot area
 * @param color The chart's color (for the text and outlines)
 * @param backgroundColor The chart's background color
 * @param size The size key: its label, the range of values, and the radius for a value
 * @param colors The color key: its label, the range of values, the color for a value, and the color
 * of the aggregates without a value (shown as "no value", when there are any)
 */
function drawKeys(
    context2D: CanvasRenderingContext2D,
    width: number,
    height: number,
    color: string,
    backgroundColor: string,
    size: {label: string, smallest: number, largest: number, radiusOf: (value: number) => number, format?: (value: number) => string} | undefined,
    colors: {label: string, domain: [number, number], colorOf: (value: number) => string, format?: (value: number) => string, missingColor?: string} | undefined,
    groups?: {groups: Array<{label: string, color: string}>, more: number},
): void {
    if (size === undefined && colors === undefined && groups === undefined) return
    const padding = 8
    const lineHeight = 14
    const largestRadius = size !== undefined ? size.radiusOf(size.largest) : 0
    // the key's values: the largest, a quarter of the way up from the smallest, and a sixteenth
    // (each about half the radius of the one before), to two significant digits
    const sizeValues = size !== undefined ?
        Array.from(new Set([1, 1 / 4, 1 / 16].map(share => Number((size.smallest + (size.largest - size.smallest) * share).toPrecision(2))))) :
        []
    // each value's label is at the top of its circle, but at least a line below the one before
    const labelYs = sizeValues.reduce<Array<number>>((ys, value) => {
        const top = 2 * largestRadius - 2 * (size?.radiusOf(value) ?? 0)
        return [...ys, ys.length === 0 ? top : Math.max(top, ys[ys.length - 1] + 11)]
    }, [])
    const sizeHeight = size !== undefined ?
        lineHeight + Math.max(2 * largestRadius, labelYs[labelYs.length - 1] ?? 0) + 6 :
        0
    const colorHeight = colors !== undefined ? 2 * lineHeight + 10 + (colors.missingColor !== undefined ? lineHeight : 0) : 0
    const groupLines = groups !== undefined ? groups.groups.length + (groups.more > 0 ? 1 : 0) : 0
    const groupsHeight = groupLines * lineHeight
    const boxWidth = Math.max(140, 2 * largestRadius + 80)
    const sections = [sizeHeight, colorHeight, groupsHeight].filter(sectionHeight => sectionHeight > 0)
    const boxHeight = 2 * padding + sections.reduce((sum, sectionHeight) => sum + sectionHeight, 0) + 6 * (sections.length - 1)
    const left = width - boxWidth - 10
    let top = height - boxHeight - 10

    context2D.globalAlpha = 1
    context2D.fillStyle = withAlpha(backgroundColor, 0.85)
    context2D.strokeStyle = withAlpha(color, 0.3)
    context2D.lineWidth = 1
    context2D.beginPath()
    context2D.rect(left, top, boxWidth, boxHeight)
    context2D.fill()
    context2D.stroke()

    context2D.font = '11px sans-serif'
    context2D.textBaseline = 'middle'
    context2D.fillStyle = color
    top += padding

    if (size !== undefined) {
        context2D.textAlign = 'left'
        context2D.fillText(size.label, left + padding, top + lineHeight / 2)
        // nested circles, sitting on the same baseline, each with a leader line to its label
        const centerX = left + padding + largestRadius
        const circlesTop = top + lineHeight + 2
        const baseY = circlesTop + 2 * largestRadius
        sizeValues.forEach((value, index) => {
            const radius = size.radiusOf(value)
            const labelY = circlesTop + labelYs[index]
            context2D.strokeStyle = withAlpha(color, 0.7)
            context2D.beginPath()
            context2D.arc(centerX, baseY - radius, radius, 0, 2 * Math.PI)
            context2D.stroke()
            context2D.beginPath()
            context2D.moveTo(centerX, baseY - 2 * radius)
            context2D.lineTo(centerX + largestRadius + 4, baseY - 2 * radius)
            context2D.lineTo(centerX + largestRadius + 8, labelY)
            context2D.strokeStyle = withAlpha(color, 0.35)
            context2D.stroke()
            context2D.fillText((size.format ?? keyLabel)(value), centerX + largestRadius + 12, labelY)
        })
        top += sizeHeight + 6
    }

    if (colors !== undefined) {
        context2D.textAlign = 'left'
        context2D.fillText(colors.label, left + padding, top + lineHeight / 2)
        const barLeft = left + padding
        const barWidth = boxWidth - 2 * padding
        const [lowest, highest] = colors.domain
        const gradient = context2D.createLinearGradient(barLeft, 0, barLeft + barWidth, 0)
        for (let stop = 0; stop <= 10; stop++) {
            gradient.addColorStop(stop / 10, colors.colorOf(lowest + (highest - lowest) * stop / 10))
        }
        context2D.fillStyle = gradient
        context2D.fillRect(barLeft, top + lineHeight, barWidth, 8)
        context2D.fillStyle = color
        context2D.fillText((colors.format ?? keyLabel)(lowest), barLeft, top + lineHeight + 8 + lineHeight / 2 + 2)
        context2D.textAlign = 'right'
        context2D.fillText((colors.format ?? keyLabel)(highest), barLeft + barWidth, top + lineHeight + 8 + lineHeight / 2 + 2)
        if (colors.missingColor !== undefined) {
            // the color of the aggregates without a value (e.g. a place without the measured kind of sensor)
            const y = top + 2 * lineHeight + 10 + lineHeight / 2
            context2D.fillStyle = colors.missingColor
            context2D.fillRect(barLeft, y - 5, 10, 10)
            context2D.fillStyle = color
            context2D.textAlign = 'left'
            context2D.fillText('no value', barLeft + 16, y)
        }
        top += colorHeight + 6
    }

    if (groups !== undefined) {
        context2D.textAlign = 'left'
        groups.groups.forEach(({label, color: swatch}, index) => {
            const y = top + index * lineHeight + lineHeight / 2
            context2D.fillStyle = swatch
            context2D.fillRect(left + padding, y - 5, 10, 10)
            context2D.fillStyle = color
            context2D.fillText(label, left + padding + 16, y)
        })
        if (groups.more > 0) {
            context2D.fillText(`+${groups.more} more`, left + padding + 16, top + groups.groups.length * lineHeight + lineHeight / 2)
        }
    }
}

/**
 * What drawing a frame needs, whatever's drawn: the projection (set up for the view), the plot area,
 * where places are drawn, and how the events fade, and dim while a series is hovered in the legend
 * (see {@link frameOf})
 */
export interface GeoFrame {
    projection: d3.GeoProjection
    // the plot area's size (px), and its margin (px) in the canvas
    width: number
    height: number
    margin: {left: number, top: number}
    // the chart's colors
    color: string
    backgroundColor: string
    // the degrees of arc a pixel spans, at the view's center
    degreesPerPixel: number
    /**
     * @param latitude A latitude
     * @param longitude A longitude
     * @return Where the place is drawn in the plot area, or `undefined` when it isn't shown
     */
    shownAt: (latitude: number, longitude: number) => [x: number, y: number] | undefined
    /**
     * @param latitude The latitude of the circle's center
     * @param longitude The longitude of the circle's center
     * @param radius The circle's radius (px, at the view's center)
     * @return The circle on the sphere (fewer points for smaller circles)
     */
    circleAt: (latitude: number, longitude: number, radius: number) => d3.GeoPermissibleObjects
    /**
     * @param time An event's (or an aggregate's latest event's) time
     * @return How faded it is, from 0 (new) to FADE_LEVELS - 1 (faded)
     */
    fadeLevelOf: (time: number) => number
    /**
     * @param level A fade level (see `fadeLevelOf`)
     * @return The opacity (a fraction of its own) it's drawn with
     */
    fadingOf: (level: number) => number
    /**
     * @param seriesName A series' name
     * @return Whether its events (and flashes) are drawn while a series is hovered in the legend: all
     * of them, unless the hovered series is isolated
     */
    shownWithHovered: (seriesName: string) => boolean
    /**
     * @param name A series' name (or an aggregate's group's)
     * @return The opacity (a fraction of its own) it's drawn with: dimmed while another series is
     * hovered in the legend
     */
    dimmingOf: (name: string) => number
    // the series hovered in the legend (`null` when none is)
    hoveredSeriesName: string | null
    // what identifies the marker under the mouse (see `markerKeyOf`), if any
    hoveredKey: unknown
}

/**
 * @param options The projection (set up for the view), the plot area's size and margin, the chart's
 * colors, the latest event's time (the stream's clock, which the fading is measured by), the fading,
 * the series hovered in the legend and whether it's isolated, and what's under the mouse
 * @return What drawing the frame needs (see {@link GeoFrame})
 */
export function frameOf(options: {
    projection: d3.GeoProjection
    width: number
    height: number
    margin: {left: number, top: number}
    color: string
    backgroundColor: string
    latestTime: number
    fade: GeoFadeOptions | undefined
    hoveredSeriesName: string | null
    isolateHoveredSeries: boolean
    hoveredKey: unknown
}): GeoFrame {
    const {projection, width, height, latestTime, fade, hoveredSeriesName, isolateHoveredSeries} = options

    // a globe hides the far side, beyond its clip angle from the view's center
    // (a projection that can't be turned, a composite, isn't a globe, and has no rotation)
    const globe = isGlobe(projection)
    const [lambda, phi] = globe ? projection.rotate() : [0, 0]
    const viewCenter: [number, number] = [-lambda, -phi]
    const maxDistance = globe ? (projection.clipAngle() ?? 0) / DEGREES : Infinity
    const shownAt = (latitude: number, longitude: number): [number, number] | undefined => {
        const location: [number, number] = [longitude, latitude]
        if (maxDistance !== Infinity && d3.geoDistance(location, viewCenter) > maxDistance) return undefined
        const projected = projection(location)
        if (projected === null || !Number.isFinite(projected[0]) || !Number.isFinite(projected[1])) return undefined
        const [x, y] = projected
        return x < 0 || y < 0 || x > width || y > height ? undefined : [x, y]
    }

    // the markers are circles on the sphere, shaped by the projection as it shapes the map (e.g.
    // flattened toward a globe's edge, or stretched toward the poles of a Mercator map). A marker's
    // radius is in pixels at the view's center, where the projection's scale is the pixels per
    // radian, so the markers keep their size as the view zooms. An event's marker is drawn as the
    // ellipse it projects to (see `markerEllipseAt`), which is a few times quicker; an aggregate's,
    // and an event's that the ellipse would get wrong, through the projection.
    const degreesPerPixel = DEGREES / projection.scale()
    const circle = d3.geoCircle()
    const circleAt = (latitude: number, longitude: number, radius: number): d3.GeoPermissibleObjects =>
        circle
            .center([longitude, latitude])
            .radius(radius * degreesPerPixel)
            .precision(radius < 4 ? 30 : radius < 10 ? 15 : 6)()

    // an event's (or an aggregate's) fading, by the age of its time relative to the latest event
    const fadeDuration = fade?.duration ?? 0
    const fadedOpacity = fade?.opacity ?? DEFAULT_FADED_OPACITY
    const fadeLevelOf = (time: number): number => fadeDuration > 0 ?
        Math.round(Math.min(1, Math.max(0, (latestTime - time) / fadeDuration)) * (FADE_LEVELS - 1)) :
        0
    const fadingOf = (level: number): number => 1 - (1 - fadedOpacity) * level / (FADE_LEVELS - 1)

    return {
        ...options,
        degreesPerPixel,
        shownAt,
        circleAt,
        fadeLevelOf,
        fadingOf,
        shownWithHovered: seriesName =>
            !isolateHoveredSeries || hoveredSeriesName === null || seriesName === hoveredSeriesName,
        dimmingOf: name => hoveredSeriesName !== null && name !== hoveredSeriesName ? DIMMED_OPACITY : 1,
    }
}

/**
 * What the map's drawing depends on (see {@link drawMap})
 */
export interface GeoMapSettings {
    graticule: d3.GeoPermissibleObjects
    showGraticule: boolean
    basemap: GeoMapData | undefined
    borders: GeoMapData | undefined
    layers: Array<GeoLayer> | undefined
    oceanColor: string
    landColor: string
    borderColor: string
    graticuleColor: string
    outlineColor: string
    // the chart's color (the layers' labels')
    color: string
}

/**
 * Draws the map: the sphere (the oceans), the graticule, the land, the layers, the borders, the
 * layers' labels, and the sphere's outline
 * @param context2D The context to draw into (translated to the plot area)
 * @param projection The projection, set up for the view
 * @param referenceShapes In the shift view mode, the map's shapes projected at the reference view
 * (see `shiftedPen`); `undefined` in the turn view mode
 * @param view The view
 * @param map What's drawn, and in what colors
 * @param width The plot area's width (px)
 * @param height The plot area's height (px)
 */
export function drawMap(
    context2D: CanvasRenderingContext2D,
    projection: d3.GeoProjection,
    referenceShapes: ReferenceShapes | undefined,
    view: GeoPlotViewState,
    map: GeoMapSettings,
    width: number,
    height: number,
): void {
    const {
        graticule, showGraticule, basemap, borders, layers, oceanColor, landColor, borderColor, graticuleColor,
        outlineColor, color,
    } = map
    // the map's data at this zoom (see `GeoMapData`). In the turn view mode, each view projects it
    // anew, so it's trimmed to the features that might show in the view (see `viewBoxOf`), and
    // clipped to the plot area (a little beyond it, so that the clipped areas' outlines fall outside
    // it); in the shift view mode, it's projected once, at the reference view, and each view scales
    // and slides it (see `shiftedPen`), so it's drawn whole
    const k = view.k
    const viewBox = referenceShapes === undefined ? viewBoxOf(projection, width, height) : undefined
    const shown = (data: GeoMapData | undefined): d3.GeoPermissibleObjects | undefined => {
        const object = data !== undefined ? detailOf(data, k) : undefined
        return object !== undefined && viewBox !== undefined ? visibleOf(object, viewBox) : object
    }
    const shownLayers = (layers ?? [])
        .filter(layer => layerShownAt(layer, k))
        .flatMap(layer => {
            const object = shown(layer.data)
            return object !== undefined ? [{layer, object}] : []
        })
    // (a composite projection clips each of its regions itself: it can't be clipped)
    const clippable = typeof projection.clipExtent === 'function'
    const clipExtent = clippable ? projection.clipExtent() : null
    if (clippable) {
        projection.clipExtent([[-MAP_CLIP_MARGIN, -MAP_CLIP_MARGIN], [width + MAP_CLIP_MARGIN, height + MAP_CLIP_MARGIN]])
    }
    const pen = referenceShapes !== undefined ?
        shiftedPen(referenceShapes, shiftOf(view, width, height)) :
        directPen(d3.geoPath(projection, context2D))

    // the sphere (the oceans) -- or, for a projection that can't be turned (a composite, whose
    // "sphere" is its regions' rectangles), the whole plot area
    const wholeSphere = canTurn(projection)
    if (wholeSphere) {
        pen.draw(context2D, SPHERE, oceanColor, undefined, 0)
    } else {
        context2D.fillStyle = oceanColor
        context2D.fillRect(0, 0, width, height)
    }

    if (showGraticule) pen.draw(context2D, graticule, undefined, graticuleColor, 0.5)
    const land = shown(basemap)
    if (land !== undefined) pen.draw(context2D, land, landColor, undefined, 0)
    shownLayers.forEach(({layer, object}) => drawLayerShapes(context2D, pen, layer, object))
    const lines = shown(borders)
    if (lines !== undefined) pen.draw(context2D, lines, undefined, borderColor, 0.5)
    // (the labels over everything else of the map)
    shownLayers.forEach(({layer, object}) => drawLayerLabels(context2D, pen, layer, object, color, width, height))
    if (wholeSphere) pen.draw(context2D, SPHERE, undefined, outlineColor, 1)
    if (clippable) projection.clipExtent(clipExtent)
}

/**
 * How the aggregates are drawn: the plot's `aggregates`, with the defaults filled in
 */
export type GeoAggregateStyle = Required<Omit<GeoAggregateOptions, 'sizeDomain' | 'colorBy' | 'colorDomain' | 'groupColors'>> &
    Pick<GeoAggregateOptions, 'sizeDomain' | 'colorBy' | 'colorDomain' | 'groupColors'>

/**
 * Draws a roll-up's aggregates: the cells (areas), then the circles (or pies), the largest first, so
 * that small ones aren't hidden under large ones, then the hovered one's outline, and the keys
 * @param context The context to draw into (translated to the plot area)
 * @param frame What drawing the frame needs
 * @param aggregates The aggregates
 * @param rollup The name of their roll-up
 * @param style How they're drawn
 * @param groupColors The categorical colors handed out to the groups so far, by group (added to)
 * @param hoveredGroup The group whose wedge is under the mouse, if any
 * @param seriesFilter The series whose events the aggregates count, when not all of them (for what's
 * under the mouse, see `GeoTooltipMetadata`)
 * @return What was drawn: the circles' markers and the cells (for hit-testing), and the hovered
 * aggregate's marker
 */
export function drawAggregates<P>(
    context: CanvasRenderingContext2D,
    frame: GeoFrame,
    aggregates: Array<GeoAggregate>,
    rollup: string,
    style: GeoAggregateStyle,
    groupColors: Map<string, string>,
    hoveredGroup: string | undefined,
    seriesFilter?: RegExp,
): DrawnScene<P> {
    const {shape, sizeBy, sizeDomain, radius: [minRadius, maxRadius], colorBy, colorDomain, colorScheme, opacity: aggregateOpacity, showKeys} = style
    const {projection, width, height, margin, color, degreesPerPixel, circleAt, shownAt, fadeLevelOf, fadingOf, hoveredKey} = frame
    const path = d3.geoPath(projection, context)
    const markers: Array<DrawnMarker<P>> = []
    const cells: Array<GeoAggregate> = []
    let highlighted: DrawnMarker<P> | undefined = undefined
    // redraws the hovered aggregate's outline (drawn last, over the other aggregates)
    let outlineHovered: (() => void) | undefined = undefined

    // the sizes: the circles' areas are proportional to the `sizeBy` values
    const smallest = sizeDomain?.[0] ?? 0
    const largest = sizeDomain?.[1] ?? aggregates.reduce(
        (max, aggregate) => Math.max(max, Number.isFinite(valueOf(aggregate, sizeBy)) ? valueOf(aggregate, sizeBy) : 0),
        0
    )
    const radiusOfValue = (value: number): number => !Number.isFinite(value) || largest <= smallest ?
        minRadius :
        minRadius + (maxRadius - minRadius) * Math.sqrt(Math.max(0, Math.min(1, (value - smallest) / (largest - smallest))))

    // the colors: by `colorBy` (or, for cells, by `sizeBy` without one)
    const asCells = (aggregate: GeoAggregate): boolean => shape === 'cells' && aggregate.bounds !== undefined
    const asPie = (aggregate: GeoAggregate): boolean => shape === 'pies' && aggregate.groups.length > 0
    const colorKey = colorBy ?? (shape === 'cells' ? sizeBy : undefined)
    // (a pie's wedges are colored by their groups' values, so the colors span those)
    const colorValues = colorKey === undefined ? [] :
        aggregates.flatMap(aggregate => asPie(aggregate) ?
            aggregate.groups.map(group => group.count > 0 ? valueOf(group, colorKey) : NaN) :
            [valueOf(aggregate, colorKey)]
        )
    // (whether any are drawn without a value, in the aggregates' `color`, for the key)
    const missingColorValue = colorValues.some(value => !Number.isFinite(value))
    const colorValuesShown = colorValues.filter(Number.isFinite)
    const [lowest, highest] = colorDomain ?? [
        colorValuesShown.reduce((min, value) => Math.min(min, value), Infinity),
        colorValuesShown.reduce((max, value) => Math.max(max, value), -Infinity),
    ]
    const colorOfValue = (value: number): string => !Number.isFinite(value) || !Number.isFinite(lowest) ?
        style.color :
        colorScheme(highest > lowest ? Math.max(0, Math.min(1, (value - lowest) / (highest - lowest))) : 1)
    const fillOf = (aggregate: GeoAggregate): string =>
        colorKey === undefined ? style.color : colorOfValue(valueOf(aggregate, colorKey))
    // an aggregate's (or a wedge's) outline: a darker shade of its fill
    const outlineOf = (fill: string): string => d3.color(fill)?.darker(0.8).formatRgb() ?? color
    const wedgeFillOf = (group: GeoAggregateGroup): string => colorKey !== undefined ?
        colorOfValue(valueOf(group, colorKey)) :
        style.groupColors?.(group.group) ?? categoricalColorOf(groupColors, group.group)
    // (while a series is hovered in the legend that names a group, e.g. a carrier, the other groups'
    // wedges are dimmed)
    const {hoveredSeriesName} = frame
    const hoveredIsGroup = hoveredSeriesName !== null && aggregates.some(
        aggregate => aggregate.groups.some(group => group.group === hoveredSeriesName)
    )
    const wedgeDimmingOf = (group: GeoAggregateGroup): number => hoveredIsGroup ? frame.dimmingOf(group.group) : 1

    aggregates.filter(asCells).forEach(aggregate => {
        const {west, south, east, north} = aggregate.bounds!
        const outline = d3.geoGraticule().extent([[west, south], [east, north]]).precision(2).outline()
        context.globalAlpha = aggregateOpacity * fadingOf(fadeLevelOf(aggregate.lastTime))
        context.beginPath()
        path(outline)
        context.fillStyle = fillOf(aggregate)
        context.fill()
        const hovered = hoveredKey === markerKeyOf({kind: 'aggregate', rollup, aggregate})
        context.globalAlpha = hovered ? 1 : 0.5
        context.strokeStyle = hovered ? color : withAlpha(color, 0.3)
        context.lineWidth = hovered ? 2 : 0.5
        context.stroke()
        cells.push(aggregate)
    })
    aggregates
        .filter(aggregate => !asCells(aggregate))
        .map(aggregate => ({aggregate, radius: radiusOfValue(valueOf(aggregate, sizeBy))}))
        .sort((a, b) => b.radius - a.radius)
        .forEach(({aggregate, radius}) => {
            const at = shownAt(aggregate.latitude, aggregate.longitude)
            if (at === undefined) return
            const [x, y] = at
            const fill = fillOf(aggregate)
            const opacity = aggregateOpacity * fadingOf(fadeLevelOf(aggregate.lastTime))
            // a pie's wedges: one per group, clockwise from north (see `pieGroupsOf`), each its share
            // of the cell's events
            const center: [number, number] = [aggregate.longitude, aggregate.latitude]
            const pieGroups = asPie(aggregate) && aggregate.groups.length > 1 ? pieGroupsOf(aggregate.groups) : []
            const wedges = pieGroups.length > 0 ?
                wedgeBearingsOf(pieGroups.map(group => group.count)).map(([from, to], index) => ({
                    group: pieGroups[index],
                    shape: wedgeOf(center, radius * degreesPerPixel, from, to, radius < 10 ? 20 : 8),
                })) :
                []
            // (a pie of one group is drawn as a circle, in the group's color)
            const circleFill = asPie(aggregate) ? wedgeFillOf(aggregate.groups[0]) : fill
            if (wedges.length > 0) {
                // (each outlined as a circle is: in a darker shade of its own fill)
                wedges.forEach(({group, shape: wedge}) => {
                    const wedgeFill = wedgeFillOf(group)
                    context.globalAlpha = opacity * wedgeDimmingOf(group)
                    context.beginPath()
                    path(wedge)
                    context.fillStyle = wedgeFill
                    context.fill()
                    context.strokeStyle = outlineOf(wedgeFill)
                    context.lineWidth = 1
                    context.stroke()
                })
            } else {
                context.globalAlpha = opacity * (asPie(aggregate) ? wedgeDimmingOf(aggregate.groups[0]) : 1)
                context.beginPath()
                path(circleAt(aggregate.latitude, aggregate.longitude, radius))
                context.fillStyle = circleFill
                context.fill()
                context.strokeStyle = outlineOf(circleFill)
                context.lineWidth = 1
                context.stroke()
            }
            const marker: DrawnMarker<P> = {
                x: x + margin.left, y: y + margin.top, hitRadius: Math.max(radius, 5),
                target: seriesFilter !== undefined ?
                    {kind: 'aggregate', rollup, aggregate, seriesFilter} :
                    {kind: 'aggregate', rollup, aggregate}
            }
            markers.push(marker)
            if (hoveredKey !== markerKeyOf(marker.target)) return
            highlighted = marker
            // hovered: the circle keeps its colors, and its outline -- or, for a pie, the hovered
            // wedge's outline (or every wedge's, when no wedge is under the mouse) -- is drawn wider
            // and opaque
            outlineHovered = (): void => {
                context.globalAlpha = 1
                context.lineWidth = 2
                if (wedges.length > 0) {
                    wedges
                        .filter(({group}) => hoveredGroup === undefined || group.group === hoveredGroup)
                        .forEach(({group, shape: wedge}) => {
                            context.beginPath()
                            path(wedge)
                            context.strokeStyle = outlineOf(wedgeFillOf(group))
                            context.stroke()
                        })
                } else {
                    context.beginPath()
                    path(circleAt(aggregate.latitude, aggregate.longitude, radius))
                    context.strokeStyle = outlineOf(circleFill)
                    context.stroke()
                }
            }
        })

    if (showKeys && aggregates.length > 0) {
        // the keys' labels carry the measures' units, and their numbers the measures' formats (see
        // the measures' options)
        const measureOptions = aggregates[0].measures
        const keyLabelOf = (name: string): string => {
            const units = measureOptions[name]?.units
            return units !== undefined && units !== '' ? `${name} (${units})` : name
        }
        const keyFormatOf = (name: string): ((value: number) => string) | undefined =>
            measureOptions[name]?.format !== undefined ?
                (value: number): string => formatMeasure(value, measureOptions[name], false) :
                undefined
        drawKeys(
            context, width, height, color, frame.backgroundColor,
            aggregates.some(aggregate => !asCells(aggregate)) ?
                {label: keyLabelOf(sizeBy), smallest, largest, radiusOf: radiusOfValue, format: keyFormatOf(sizeBy)} :
                undefined,
            colorKey !== undefined && Number.isFinite(lowest) ?
                {
                    label: keyLabelOf(colorKey), domain: [lowest, highest], colorOf: colorOfValue, format: keyFormatOf(colorKey),
                    missingColor: missingColorValue ? style.color : undefined,
                } :
                undefined,
            colorKey === undefined && aggregates.some(asPie) ? groupKeyOf(aggregates, wedgeFillOf) : undefined,
        )
    }

    // the hovered aggregate's outline, over the other aggregates
    ;(outlineHovered as (() => void) | undefined)?.()
    return {markers, cells, highlighted}
}

/**
 * How the events are drawn
 * @template P The type of the events' payload
 */
export interface GeoEventStyle<P> {
    // the series shown (the chart's filter), and their styles (their colors, by name)
    seriesFilter: RegExp
    seriesStyles: Map<string, SeriesLineStyle>
    // an event's own color and radius (see the plot's `colorOf` and `radiusOf`)
    colorOf: ((datum: GeoDatum<P>, seriesName: string) => string | undefined) | undefined
    radiusOf: ((datum: GeoDatum<P>, seriesName: string) => number) | undefined
    // the markers' radius (px), without `radiusOf`, and their opacity
    markerRadius: number
    markerOpacity: number
}

/**
 * Draws the events' markers: a path per series, color, and fading, so that a series in one color is
 * a few fills (split into paths of at most MAX_MARKERS_PER_PATH markers, see there). The series
 * hovered in the legend is drawn last, over the others (which are dimmed, when it isn't isolated).
 * @param context The context to draw into (translated to the plot area)
 * @param frame What drawing the frame needs
 * @param seriesList The series
 * @param style How the events are drawn
 * @param geometries The markers' geometry kept for this view (added to), so that only the new
 * events are projected; `undefined` while the view is changing (when it changes on every frame)
 * @return What was drawn: the markers (for hit-testing), and the hovered event's
 */
export function drawEvents<P>(
    context: CanvasRenderingContext2D,
    frame: GeoFrame,
    seriesList: ReadonlyArray<GeoSeries<P>>,
    style: GeoEventStyle<P>,
    geometries: WeakMap<GeoDatum<P>, MarkerGeometry> | undefined,
): DrawnScene<P> {
    const {seriesFilter, seriesStyles, colorOf, radiusOf, markerRadius, markerOpacity} = style
    const {projection, margin, degreesPerPixel, shownAt, circleAt, fadeLevelOf, fadingOf, hoveredKey, hoveredSeriesName} = frame
    const markers: Array<DrawnMarker<P>> = []
    let highlighted: DrawnMarker<P> | undefined = undefined

    const hoveredLast = [
        ...seriesList.filter(series => series.name !== hoveredSeriesName),
        ...seriesList.filter(series => series.name === hoveredSeriesName),
    ]
    hoveredLast.forEach(series => {
        if (!series.name.match(seriesFilter) || !frame.shownWithHovered(series.name)) return
        const seriesColor = (seriesStyles.get(series.name) ?? defaultLineStyle()).color
        const paths = new Map<string, {fill: string, level: number, paths: Array<Path2D>, count: number, geoPath: d3.GeoPath}>()

        series.data.forEach(datum => {
            // where the marker is drawn, how large, and as what ellipse (kept, while the view rests)
            let geometry = geometries?.get(datum)
            if (geometry === undefined) {
                const at = shownAt(datum.latitude, datum.longitude)
                const markerSize = Math.max(radiusOf?.(datum, series.name) ?? markerRadius, 0.5)
                geometry = at === undefined ? null : {
                    at,
                    radius: markerSize,
                    ellipse: markerEllipseAt(projection, at, datum.longitude, datum.latitude, markerSize, degreesPerPixel),
                }
                geometries?.set(datum, geometry)
            }
            if (geometry === null) return
            const {at: [x, y], radius, ellipse} = geometry
            const fill = colorOf?.(datum, series.name) ?? seriesColor
            const level = fadeLevelOf(datum.time)
            const key = `${fill}|${level}`
            let markerPath = paths.get(key)
            if (markerPath === undefined || markerPath.count >= MAX_MARKERS_PER_PATH) {
                // (a Path2D has no `beginPath`, which d3's context type asks for, but which d3 never
                // calls when it draws polygons into a context)
                const markersPath = new Path2D()
                const geoPath = d3.geoPath(projection, markersPath as unknown as d3.GeoContext)
                markerPath = markerPath === undefined ?
                    {fill, level, paths: [markersPath], count: 0, geoPath} :
                    {...markerPath, paths: [...markerPath.paths, markersPath], count: 0, geoPath}
                paths.set(key, markerPath)
            }
            const current = markerPath.paths[markerPath.paths.length - 1]
            markerPath.count += 1
            if (ellipse !== undefined) {
                const [ellipseX, ellipseY, radiusX, radiusY, rotation] = ellipse
                // (each ellipse starts a subpath of its own, so that it isn't joined to the one before)
                current.moveTo(ellipseX + radiusX * Math.cos(rotation), ellipseY + radiusX * Math.sin(rotation))
                current.ellipse(ellipseX, ellipseY, radiusX, radiusY, rotation, 0, 2 * Math.PI)
            } else {
                markerPath.geoPath(circleAt(datum.latitude, datum.longitude, radius))
            }

            const marker: DrawnMarker<P> = {
                x: x + margin.left, y: y + margin.top,
                hitRadius: Math.max(radius + 3, 6),
                target: {kind: 'event', seriesName: series.name, datum}
            }
            markers.push(marker)
            if (hoveredKey === datum) highlighted = marker
        })

        // the faintest first, so that the newest events are drawn over the older ones
        const dimming = frame.dimmingOf(series.name)
        Array.from(paths.values())
            .sort((a, b) => b.level - a.level)
            .forEach(({fill, level, paths: markerPaths}) => {
                context.globalAlpha = dimming * markerOpacity * fadingOf(level)
                context.fillStyle = fill
                markerPaths.forEach(markerPath => context.fill(markerPath))
            })
    })
    return {markers, cells: [], highlighted}
}

/**
 * A flash showing: where, how large, how long, and in what color (see the plot's `flash`), the new
 * event it's of, its series, and when (`performance.now()`) it started
 * @template P The type of the events' payload
 */
export type ShowingFlash<P> = ResolvedGeoFlash & {datum: GeoDatum<P>, seriesName: string, start: number}

/**
 * Draws the flashes: a ring, in its event's marker's color, growing and fading from each new event.
 * A ring is a circle on the sphere, like the markers, so the projection shapes it as it shapes them:
 * drawn as the ellipse it projects to, or, where that would be off, through the projection. Flashes
 * of a color that start within a flash's length of each other, close together on the screen, are
 * drawn as one ring (see `flashGroupsOf`), at their middle, as the earliest of them is, wider the
 * more of them it stands for.
 * @param context2D The context to draw into (translated to the plot area)
 * @param frame What drawing the frame needs
 * @param flashes The flashes showing
 * @param style The events' colors (see {@link GeoEventStyle}), and how close (px) flashes are
 * merged
 * @param now The time (`performance.now()`) the frame is drawn at
 */
export function drawFlashes<P>(
    context2D: CanvasRenderingContext2D,
    frame: GeoFrame,
    flashes: ReadonlyArray<ShowingFlash<P>>,
    style: Pick<GeoEventStyle<P>, 'colorOf' | 'seriesStyles'> & {mergeDistance: number},
    now: number,
): void {
    const {projection, degreesPerPixel, shownAt, circleAt} = frame
    const path = d3.geoPath(projection, context2D)
    const rings = flashes.flatMap(flash => {
        const {latitude, longitude, datum, seriesName} = flash
        if (!frame.shownWithHovered(seriesName)) return []
        const ring = flashRingOf(now - flash.start, flash.duration, flash.radius)
        const at = ring !== undefined ? shownAt(latitude, longitude) : undefined
        if (ring === undefined || at === undefined) return []
        const ringColor = flash.color ??
            style.colorOf?.(datum, seriesName) ??
            (style.seriesStyles.get(seriesName) ?? defaultLineStyle()).color
        return [{
            x: at[0], y: at[1], start: flash.start, duration: flash.duration, color: ringColor, ring, latitude, longitude,
            dimming: frame.dimmingOf(seriesName),
        }]
    })
    flashGroupsOf(rings, style.mergeDistance).forEach(group => {
        const earliest = group.reduce((first, ring) => ring.start < first.start ? ring : first)
        const mean = (of: (ring: typeof earliest) => number): number =>
            group.reduce((sum, ring) => sum + of(ring), 0) / group.length
        const at: [number, number] = [mean(ring => ring.x), mean(ring => ring.y)]
        const latitude = mean(ring => ring.latitude)
        const longitude = mean(ring => ring.longitude)
        const {radius, opacity} = earliest.ring
        context2D.globalAlpha = opacity * Math.max(...group.map(ring => ring.dimming))
        context2D.strokeStyle = earliest.color
        context2D.lineWidth = 2 + Math.min(3, Math.log2(group.length))
        context2D.beginPath()
        const ellipse = markerEllipseAt(projection, at, longitude, latitude, radius, degreesPerPixel)
        if (ellipse !== undefined) {
            const [ellipseX, ellipseY, radiusX, radiusY, rotation] = ellipse
            context2D.ellipse(ellipseX, ellipseY, radiusX, radiusY, rotation, 0, 2 * Math.PI)
        } else {
            path(circleAt(latitude, longitude, radius))
        }
        context2D.stroke()
    })
}

/**
 * Draws the hovered event over the scene: enlarged, in its series' highlight color, with a ring
 * @param context2D The context to draw into (translated to the plot area)
 * @param frame What drawing the frame needs
 * @param marker The hovered event's marker
 * @param seriesStyles The series' styles, by name
 */
export function drawHoveredEvent<P>(
    context2D: CanvasRenderingContext2D,
    frame: GeoFrame,
    marker: DrawnMarker<P>,
    seriesStyles: Map<string, SeriesLineStyle>,
): void {
    if (marker.target.kind !== 'event') return
    const {seriesName, datum} = marker.target
    const style = seriesStyles.get(seriesName) ?? defaultLineStyle()
    context2D.globalAlpha = 1
    context2D.beginPath()
    d3.geoPath(frame.projection, context2D)(frame.circleAt(datum.latitude, datum.longitude, marker.hitRadius - 1))
    context2D.fillStyle = style.highlightColor
    context2D.fill()
    context2D.strokeStyle = frame.color
    context2D.lineWidth = 1
    context2D.stroke()
}
