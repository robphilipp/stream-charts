import {useCallback, useEffect, useEffectEvent, useMemo, useRef} from 'react'
import * as d3 from "d3"
import {useChart} from "../hooks/useChart"
import {useCanvasZoomPan} from "./useCanvasZoomPan"
import {clipToArea} from "./plot"
import {type BaseAxis, defaultLineStyle, type SeriesLineStyle} from "../axes/axes"
import type {BaseAxisRange} from "../axes/BaseAxisRange"
import type {CanvasContext} from "../d3types"
import {canvasLocalPoint} from "./hitTesting"
import {noop} from "../utils"
import {withAlpha} from "../styling/canvasStyle"
import {geoViewDriverFor} from "../subscriptions/viewDrivers"
import {useDataSource, useDataSourceRunning, useStreamingSettings} from "../hooks/useDataSource"
import {useHoveredSeries} from "../hooks/useHoveredSeries"
import type {GeoChartData} from "../observables/geo"
import {formatMeasure, type GeoAggregate, type GeoAggregateGroup} from "../datasources/geoRollups"
import type {GeoDatum, GeoSeries} from "../series/geoSeries"
import {usePlotDimensions} from "../hooks/usePlotDimensions"
import {type TooltipData, useTooltip} from "../hooks/useTooltip"
import {
    detailOf,
    drawLayerLabels,
    drawLayerShapes,
    type GeoLayer,
    type GeoMapData,
    layerShownAt,
    viewBoxOf,
    visibleOf,
} from "./geoLayers"
import {
    type GeoPlotViewState,
    type GeoProjectionName,
    GeoProjections,
    type GeoTooltipMetadata,
    autoLevelOf,
    bearingOf,
    type DrawnMarker,
    flashGroupsOf,
    flashRingOf,
    type GeoFlash,
    resolvedFlashes,
    type ResolvedGeoFlash,
    isGlobe,
    markerAt,
    type MarkerEllipse,
    markerEllipseAt,
    panView,
    placeUnder,
    setUpProjection,
    viewCenteredOn,
    viewFitting,
    wedgeIndexAt,
    wedgeOf,
    zoomViewAbout,
} from "./geoProjections"

/**
 * The properties of the {@link GeoPlot}
 * @template P The type of the events' payload
 */
export interface Props<P> {
    /**
     * The map projection: the name of one of the {@link GeoProjections} (defaults to
     * `orthographic`, a globe), or a d3 projection. The plot sets a projection's scale, translation,
     * and rotation itself (to fit the plot, and as the user drags and zooms).
     */
    projection?: GeoProjectionName | d3.GeoProjection
    /**
     * The `[longitude, latitude]` (degrees) at the center of the view when the plot first shows,
     * and after its view is reset. Defaults to `[0, 20]`. Changing it re-centers the view. Not used
     * with `fitTo`.
     */
    center?: [longitude: number, latitude: number]
    /**
     * A shape (GeoJSON, e.g. a country, or a state) that the view frames when the plot first shows,
     * and after its view is reset: centered on the shape, and zoomed in until it fills the plot area,
     * less `fitPadding`. Changing it re-frames the view; and until the user moves the view, the view
     * keeps the shape framed as the plot's size changes. (The zoom's limit is raised to the framing
     * zoom, when that's past `zoomMaxScaleFactor`.)
     */
    fitTo?: d3.GeoPermissibleObjects
    /**
     * The space (px) left around the shape that the view frames (see `fitTo`). Defaults to 20.
     */
    fitPadding?: number
    /**
     * The land (or any other areas) to draw under the events, as GeoJSON (e.g. the `land` features
     * of a world atlas) -- or versions of it at different levels of detail, each drawn from its own
     * zoom in (see {@link GeoMapData}). The plot doesn't come with a map, so that the application
     * chooses its level of detail. Drawn filled, in `landColor`.
     */
    basemap?: GeoMapData
    /**
     * The borders (or any other lines) to draw over the basemap and the layers, as GeoJSON (e.g. a
     * mesh of a world atlas' country borders) -- or versions of it by zoom (see {@link GeoMapData}).
     * Drawn as lines, in `borderColor`.
     */
    borders?: GeoMapData
    /**
     * More of the map, drawn over the basemap, in order, and under the borders (see {@link GeoLayer}):
     * e.g. a country's states, colored by a value of each (a choropleth, with a `fill` function of the
     * feature), its counties (only once zoomed in, see `minZoom`), its roads, or its lakes -- each
     * with its own colors, line width, and opacity, versions by zoom, and labels. Only the features
     * that might show in the view are drawn, and the map is clipped to the plot area, so that a
     * detailed map, zoomed in, draws quickly.
     */
    layers?: Array<GeoLayer>
    /**
     * Whether to draw the graticule (the lines of latitude and longitude, every 10°). Defaults to `true`.
     */
    showGraticule?: boolean
    /**
     * The fill of the sphere (the oceans). Defaults to a faint tint of the chart's color.
     */
    oceanColor?: string
    /**
     * The fill of the basemap. Defaults to a light tint of the chart's color.
     */
    landColor?: string
    /**
     * The color of the borders. Defaults to a tint of the chart's color.
     */
    borderColor?: string
    /**
     * The color of the graticule. Defaults to a faint tint of the chart's color.
     */
    graticuleColor?: string
    /**
     * The color of the sphere's outline. Defaults to a tint of the chart's color.
     */
    outlineColor?: string
    /**
     * The radius (px) of each event's marker. Defaults to 3.
     */
    markerRadius?: number
    /**
     * The opacity of the markers (0 to 1). Defaults to 0.85.
     */
    markerOpacity?: number
    /**
     * The radius (px) of an event's marker, e.g. from a payload field (overrides `markerRadius`)
     * @param datum The event
     * @param seriesName The name of the event's series
     * @return The marker's radius
     */
    radiusOf?: (datum: GeoDatum<P>, seriesName: string) => number
    /**
     * The color of an event's marker, e.g. from a payload field (overrides the series' color);
     * `undefined` means the series' color
     * @param datum The event
     * @param seriesName The name of the event's series
     * @return The marker's color
     */
    colorOf?: (datum: GeoDatum<P>, seriesName: string) => string | undefined
    /**
     * What the plot shows: each event (`points`, the default); the aggregates of one of the data
     * source's roll-ups (`aggregates`, see `rollup`, and the {@link GeoDataSource}'s `rollups`); or,
     * depending on the zoom, a roll-up whose cells are about as small on the screen as what can be
     * told apart, or, zoomed in far enough, the events (`auto`, see `autoRollups` and
     * `clusterDistance`) -- so that a busy map, seen from afar, shows clusters, which come apart as
     * it's zoomed in
     */
    mode?: 'points' | 'aggregates' | 'auto'
    /**
     * The name of the data source's roll-up to show in the `aggregates` mode
     */
    rollup?: string
    /**
     * The roll-ups that the `auto` mode chooses among, by name: roll-ups of the same events whose
     * cells are of different sizes (e.g. `byGridCell(10)`, `byGridCell(1)`, `byGridCell(0.1)`), so
     * that it shows, at each zoom, the coarsest whose cells span at most `clusterDistance` pixels --
     * or the events, once even the finest's cells span more. Defaults to all of the data source's
     * roll-ups whose cells are of a size (see `GeoBinning`'s `cellSize`).
     */
    autoRollups?: Array<string>
    /**
     * In the `auto` mode, the most (px) that a roll-up's cells may span on the screen: events closer
     * than about this are shown merged, as an aggregate. Defaults to 20.
     */
    clusterDistance?: number
    /**
     * What an aggregate's size shows: `count` (the default, its number of events), or the name of
     * one of the roll-up's measures. The circles' areas are proportional to it.
     */
    sizeBy?: string
    /**
     * What an aggregate's color shows: `count`, or the name of one of the roll-up's measures
     * (colored by `colorScheme`, over `colorDomain`). Without it, aggregates are drawn in
     * `aggregateColor`.
     */
    colorBy?: string
    /**
     * The fixed `[lowest, largest]` range of the `sizeBy` values that the sizes span: an aggregate at
     * (or below) the lowest value gets `minAggregateRadius`, and one at (or above) the largest gets
     * `maxAggregateRadius`, with the circles' areas growing in proportion in between. Defaults to
     * `[0, the largest value shown]`, so the sizes are relative to the largest aggregate.
     */
    sizeDomain?: [number, number]
    /**
     * The fixed `[lowest, highest]` range of the `colorBy` values that the colors span. Defaults to
     * the range of the values shown.
     */
    colorDomain?: [number, number]
    /**
     * The colors for the `colorBy` values: maps 0 (the lowest) to 1 (the highest) to a color.
     * Defaults to d3's yellow-orange-red (`d3.interpolateYlOrRd`).
     */
    colorScheme?: (t: number) => string
    /**
     * The color of the aggregates when they aren't colored by a value (see `colorBy`). Defaults to
     * a blue.
     */
    aggregateColor?: string
    /**
     * The opacity of the aggregates (0 to 1). Defaults to 0.6.
     */
    aggregateOpacity?: number
    /**
     * How aggregates are drawn:
     * - `circles` (the default): a circle per cell, sized by `sizeBy`, and colored by `colorBy`;
     * - `pies`: a circle per cell, sized by `sizeBy`, and divided into a wedge per group (see the
     *   roll-up's `groupBy`): each wedge's angle is the group's share of the cell's events, and its
     *   color the group's own `colorBy` value (or, without `colorBy`, the group's color, see
     *   `groupColors`) -- e.g. each sensor's mean delay, within each area. A cell without groups is
     *   drawn as a plain circle;
     * - `cells`: the cells themselves (for a roll-up whose cells are areas, see `byGridCell`),
     *   colored by `colorBy` (or by `sizeBy`, without one). A roll-up whose cells aren't areas is
     *   drawn as circles.
     */
    aggregateShape?: 'circles' | 'pies' | 'cells'
    /**
     * The color of a group's wedges (with the `pies` shape, without `colorBy`); `undefined` means one
     * of d3's ten categorical colors, handed out in the order the groups first show up, so a group
     * keeps its color as the data changes (beyond ten groups, the colors repeat)
     * @param group The group's name
     * @return The group's color
     */
    groupColors?: (group: string) => string | undefined
    /**
     * The radius (px) of the largest aggregate's circle. Defaults to 20.
     */
    maxAggregateRadius?: number
    /**
     * The radius (px) of the smallest aggregate's circle. Defaults to 2.
     */
    minAggregateRadius?: number
    /**
     * Whether to draw the keys (in the bottom-right corner) for the aggregates' sizes and colors.
     * Defaults to `true`.
     */
    showKeys?: boolean
    /**
     * When set, events fade as they age: from `markerOpacity`, when they arrive, to
     * `markerOpacity * fadedOpacity` once they're this old (ms), so that the newest events stand
     * out. An event's age is measured from the data source's latest event (the stream's clock), so
     * nothing fades while the data source is paused. Aggregates fade by the age of their latest
     * event. Defaults to no fading.
     */
    fadeDuration?: number
    /**
     * How faint (0 to 1, a fraction of `markerOpacity`) events become once they're `fadeDuration`
     * old. Defaults to 0.15. Only used with `fadeDuration`.
     */
    fadedOpacity?: number
    /**
     * When set, each new event flashes as it arrives: a ring, in its marker's color, grows from it
     * and fades over this many milliseconds (e.g. to show where something just happened -- a phone
     * just located, a sensor just reporting). Flashes show in either mode, so a roll-up's aggregates
     * flash as their events arrive, too. The plot redraws up to 60 times a second while any ring
     * shows. Defaults to no flashes.
     */
    flashDuration?: number
    /**
     * The radius (px, at the view's center) a flash's ring grows to. A ring is a circle on the earth,
     * like the markers, so the projection shapes it as it shapes them (e.g. flattened toward a
     * globe's edge). Defaults to 20. Only used with `flashDuration`.
     */
    flashRadius?: number
    /**
     * Which new events flash, and how (e.g. only one series'); all of them, once each, when not set.
     * Only used with `flashDuration`.
     * @param datum The event
     * @param seriesName The name of the event's series
     * @return `true` to flash the event once, at its place, as the plot's settings say; `false` not to
     * flash it; or its flashes (see {@link GeoFlash}), each of which can have a place, radius,
     * duration, and color of its own -- e.g. a second, smaller and shorter flash somewhere else the
     * event is about (an estimated location's true place, say)
     */
    flashes?: (datum: GeoDatum<P>, seriesName: string) => boolean | ReadonlyArray<GeoFlash>
    /**
     * Flashes of the same color and length that start within one flash's length of each other, and
     * this close (px) to each other on the screen, are drawn as one ring, wider the more flashes it
     * stands for -- so that a place with many new events (e.g. a city, seen from afar) pulses
     * steadily, one ring at a time, rather than flashing ring over ring. Defaults to 20; 0 never
     * merges them.
     */
    flashMergeDistance?: number
    /**
     * Whether dragging moves the view: a globe (an azimuthal projection, like the default
     * `orthographic`) turns under the mouse; a flat map shifts east and west, and, zoomed in,
     * north and south. Defaults to `true`.
     */
    rotateEnabled?: boolean
    /**
     * Whether the mouse wheel zooms the view, about the mouse (the place under the mouse stays
     * under it). Defaults to `true`.
     */
    zoomEnabled?: boolean
    /**
     * When `true` (the default), zooming requires the shift or control key to be held down while
     * scrolling (so that scrolling the page over the chart doesn't zoom it)
     */
    zoomKeyModifiersRequired?: boolean
    /**
     * How far the view can be zoomed in (a factor of the fitted view's scale). Defaults to 20.
     */
    zoomMaxScaleFactor?: number
    /**
     * What hovering a series in the legend does: show that series' events alone (`true`, the
     * default -- a map's series often overlap at the same places), or dim the others' (`false`).
     * Either way, only the events (and their flashes) are affected, not the aggregates.
     */
    isolateHoveredSeries?: boolean
    /**
     * When set, the view turns westward (the earth spins eastward) at this many degrees per second,
     * pausing while the view is dragged and while an event is hovered. Defaults to no rotation. The
     * plot redraws up to 60 times a second while it turns, so with many tens of thousands of events
     * held, show a roll-up's aggregates instead, or keep fewer events (the data source's
     * `dropDataAfter`).
     */
    autoRotate?: number
    /**
     * An (optional) view to restore when the plot mounts -- commonly the last view reported
     * through `onViewChange` and held by the application (e.g. in a store), so that the view
     * survives the plot being unmounted and remounted (e.g. navigating away and back). Only read
     * once, when the plot mounts.
     */
    viewState?: GeoPlotViewState
    /**
     * Called with the plot's view after it's dragged, zoomed, or reset, when the auto-rotation
     * pauses, and when the plot unmounts
     * @param view The view
     */
    onViewChange?: (view: GeoPlotViewState) => void
    /**
     * Called whenever this plot (re)creates its zoom behavior, handing the caller a `resetZoom`
     * function that resets the view (its rotation and zoom) -- e.g. for a "Clear" action. Only
     * meaningful (called) while `zoomEnabled` is `true`.
     */
    onZoomReset?: (resetZoom: () => void) => void
}

/**
 * @param target What's under the mouse
 * @return What identifies it from one redraw to the next: the event itself, or the aggregate's
 * roll-up and cell (an aggregate is a new object each time its cell changes)
 */
const keyOf = <P, >(target: GeoTooltipMetadata<P>): unknown =>
    target.kind === 'event' ? target.datum : `${target.rollup}::${target.aggregate.id}::${target.group ?? ''}`

/**
 * @param target What's under the mouse
 * @return What identifies its marker (or cell) from one redraw to the next: the event, or the
 * aggregate's roll-up and cell, whichever of its groups is under the mouse
 */
const markerKeyOf = <P, >(target: GeoTooltipMetadata<P>): unknown =>
    target.kind === 'event' ? target.datum : `${target.rollup}::${target.aggregate.id}`

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
 * @param target What's under the mouse
 * @return The name the tooltip's handlers get: the event's series, or the aggregate's roll-up
 */
const nameOf = <P, >(target: GeoTooltipMetadata<P>): string =>
    target.kind === 'event' ? target.seriesName : target.rollup

/**
 * @param dataSource The chart's data source
 * @param rollup The name of a roll-up
 * @return The roll-up's aggregates, when the data source keeps roll-ups (a {@link GeoDataSource}
 * does); otherwise none
 */
function aggregatesOf(dataSource: unknown, rollup: string): Array<GeoAggregate> {
    return dataSource !== null && typeof dataSource === 'object' && 'aggregates' in dataSource ?
        (dataSource as {aggregates: (name: string) => Array<GeoAggregate>}).aggregates(rollup) :
        []
}

/**
 * @param dataSource The chart's data source
 * @param rollups The names of roll-ups, or `undefined` for all of the data source's
 * @return The roll-ups whose cells are of a size, and the size (degrees), when the data source keeps
 * roll-ups (a {@link GeoDataSource} does); otherwise none
 */
function rollupCellSizesOf(dataSource: unknown, rollups: Array<string> | undefined): Array<{rollup: string, degrees: number}> {
    if (dataSource === null || typeof dataSource !== 'object' || !('rollupCellSize' in dataSource) || !('rollupNames' in dataSource)) return []
    const source = dataSource as {rollupCellSize: (name: string) => number | undefined, rollupNames: () => Array<string>}
    return (rollups ?? source.rollupNames())
        .map(rollup => ({rollup, degrees: source.rollupCellSize(rollup) ?? NaN}))
        .filter(({degrees}) => Number.isFinite(degrees) && degrees > 0)
}

/**
 * @param aggregate An aggregate
 * @param name `count`, or the name of one of the roll-up's measures
 * @return The aggregate's count, or the measure's value (`NaN` for an unknown measure)
 */
const valueOf = (aggregate: GeoAggregate, name: string): number =>
    name === 'count' ? aggregate.count : (aggregate.values[name] ?? NaN)

/**
 * @param group A group of a cell's events
 * @param name `count`, or the name of one of the roll-up's measures
 * @return The group's count, or its value of the measure (`NaN` for an unknown measure)
 */
const groupValueOf = (group: GeoAggregateGroup, name: string): number =>
    name === 'count' ? group.count : (group.values[name] ?? NaN)

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

const DEFAULT_CENTER: [number, number] = [0, 20]
// how far (px) beyond the plot area the map is clipped (so that the outlines of the areas clipped
// there fall outside the plot area, which the canvas clips to)
const MAP_CLIP_MARGIN = 4
const DEGREES = 180 / Math.PI
// the number of distinct opacities the faded markers are drawn with (so that markers can still be
// drawn a path per color and opacity)
const FADE_LEVELS = 12
// the opacity (a fraction of their own) of the other series' events, while a series is hovered in
// the legend (when it isn't isolated, see `isolateHoveredSeries`)
const DIMMED_OPACITY = 0.2
// the most frames per second that the animations (the auto-rotation, and the flashes) redraw (they
// move by the time elapsed, so they move at the same speed, however often they're redrawn): a slowly
// turning globe looks as smooth at 60 frames a second, and the faster displays would otherwise
// redraw it twice as often, or more
const ANIMATION_FRAME_RATE = 60
// (a frame is skipped when it comes too soon after the last one redrawn, with some slack, so that a
// display a little faster than the frame rate still redraws on every other frame)
const ANIMATION_FRAME_INTERVAL = 0.8 * 1000 / ANIMATION_FRAME_RATE
// the most markers in a path (filled at once): filling a path takes time that grows faster than its
// number of shapes (four times as many shapes take over ten times as long), so a color and fading's
// markers are split into paths of at most this many
const MAX_MARKERS_PER_PATH = 256
// the most flashes shown at once (the latest), so that a burst of events can't swamp the redraws
const MAX_FLASHES = 500

/**
 * What a scene's drawing drew (see the `GeoPlot`'s `drawScene`): the markers, and the cells (for
 * finding what's under the mouse), and the hovered marker, if it was drawn
 */
type DrawnScene<P> = {
    markers: Array<DrawnMarker<P>>
    cells: Array<GeoAggregate>
    highlighted: DrawnMarker<P> | undefined
}

/**
 * An event's marker's geometry, for a view: where its center is drawn (px, in the plot area), its
 * radius (px, at the view's center), and the ellipse it's drawn as (`undefined` when it's drawn
 * through the projection instead, see `markerEllipseAt`); or `null` when it isn't shown
 */
type MarkerGeometry = {at: [number, number], radius: number, ellipse: MarkerEllipse | undefined} | null

/**
 * Renders streaming sensor events on a map, or a globe, for the series held by the
 * {@link GeoDataSource} handed to the {@link Chart} (its `dataSource` prop): one marker per event,
 * at its latitude and longitude, in its series' color (or its own, see `colorOf`). Uses d3-geo's
 * projections (see {@link GeoProjections}) and draws onto the chart's canvas. Dragging moves the
 * view, the mouse wheel zooms it about the mouse, and the view can turn by itself (`autoRotate`).
 * The plot needs no axes.
 *
 * This component uses the {@link useChart} hook, and therefore must be a child of the {@link Chart}.
 * @param props The properties of the geo plot
 * @return `null` (the plot draws onto the chart's canvas)
 * @template P The type of the events' payload
 * @example
 * ```tsx
 * <Chart chartId={1} width={800} height={600} dataSource={dataSource} seriesStyles={styles}>
 *     <GeoPlot<Reading>
 *         projection="orthographic"
 *         basemap={land}
 *         borders={countryBorders}
 *         radiusOf={datum => 2 + datum.payload.magnitude}
 *         fadeDuration={30_000}
 *     />
 *     <Tooltip visible={true}>
 *         <GeoPlotTooltipContent<Reading> payloadFormatter={payload => `magnitude ${payload.magnitude}`}/>
 *     </Tooltip>
 * </Chart>
 * ```
 */
export function GeoPlot<P>(props: Props<P>): null {
    const {
        chartId,
        canvasContext,
        color,
        backgroundColor,
        seriesStyles,
        seriesFilter,
        mouse,
    } = useChart<GeoDatum<P>, SeriesLineStyle, GeoTooltipMetadata<P>, BaseAxisRange, BaseAxis>()
    const {mouseOverHandlerFor, mouseLeaveHandlerFor} = mouse

    const {plotDimensions, margin} = usePlotDimensions()
    const {width, height} = plotDimensions
    const {windowingTime = 100, dataUpdatePeriod, onUpdateChartTime = noop} = useStreamingSettings()

    // the application-owned source of the events, and whether it's running (streaming)
    const dataSource = useDataSource<GeoChartData<P>, GeoDatum<P>, GeoSeries<P>>()
    const running = useDataSourceRunning(dataSource)

    const {visibilityState: tooltipVisible} = useTooltip()

    // the series hovered in the legend (see `isolateHoveredSeries`)
    const {hoveredSeriesName} = useHoveredSeries()

    const {
        projection: projectionProp = 'orthographic',
        center = DEFAULT_CENTER,
        fitTo,
        fitPadding = 20,
        basemap,
        borders,
        layers,
        showGraticule = true,
        oceanColor = withAlpha(color, 0.05),
        landColor = withAlpha(color, 0.2),
        borderColor = withAlpha(color, 0.4),
        graticuleColor = withAlpha(color, 0.15),
        outlineColor = withAlpha(color, 0.5),
        markerRadius = 3,
        markerOpacity = 0.85,
        radiusOf,
        colorOf,
        mode = 'points',
        rollup,
        autoRollups,
        clusterDistance = 20,
        sizeBy = 'count',
        colorBy,
        sizeDomain,
        colorDomain,
        colorScheme = d3.interpolateYlOrRd,
        aggregateColor = '#4e79a7',
        aggregateOpacity = 0.6,
        aggregateShape = 'circles',
        groupColors,
        maxAggregateRadius = 20,
        minAggregateRadius = 2,
        showKeys = true,
        fadeDuration,
        fadedOpacity = 0.15,
        flashDuration,
        flashRadius = 20,
        flashes,
        flashMergeDistance = 20,
        rotateEnabled = true,
        zoomEnabled = true,
        zoomKeyModifiersRequired = true,
        zoomMaxScaleFactor = 20,
        autoRotate,
        isolateHoveredSeries = true,
        viewState,
        onViewChange = noop,
        onZoomReset = noop,
    } = props

    // the projection (a new one when the projection's name changes; one handed in is used as-is)
    const projection = useMemo<d3.GeoProjection>(
        () => typeof projectionProp === 'string' ?
            (GeoProjections[projectionProp] ?? d3.geoOrthographic)() :
            projectionProp,
        [projectionProp]
    )
    const graticule = useMemo(() => d3.geoGraticule10(), [])

    // the view (rotation, zoom, and a flat map's vertical shift), changed by dragging, zooming, and
    // the auto-rotation; starts as the view handed in (see `viewState`), or centered on `center`
    const [centerLongitude, centerLatitude] = center
    // (framing `fitTo`, when it's set: for the plot's size, and the projection)
    const initialView = useMemo(
        () => fitTo !== undefined ?
            viewFitting(projection, fitTo, width, height, fitPadding) :
            viewCenteredOn([centerLongitude, centerLatitude]),
        [fitTo, fitPadding, projection, width, height, centerLongitude, centerLatitude]
    )
    const viewRef = useRef<GeoPlotViewState>(viewState ?? initialView)

    // reports the view (see `onViewChange`)
    const onViewChangeRef = useRef(onViewChange)
    useEffect(
        () => {
            onViewChangeRef.current = onViewChange
        },
        [onViewChange]
    )
    const reportView = useCallback((): void => onViewChangeRef.current({...viewRef.current}), [])

    // the time of the latest event, reported to the chart's `onUpdateChartTime`
    const currentTimeRef = useRef<number>(0)

    // tooltips are shown whether or not the data source is running, but not while dragging
    const allowTooltipRef = useRef<boolean>(true)
    // where the mouse last was over the canvas (canvas coordinates), for updating the tooltip of
    // what's under it as the data changes
    const mouseRef = useRef<[x: number, y: number]>([0, 0])
    // whether the view is being dragged (which pauses the auto-rotation)
    const draggingRef = useRef<boolean>(false)

    // the last-drawn markers, for finding the one under the mouse, and the largest hit radius; and
    // the last-drawn cells (in the `cells` shape), for finding the one under the mouse
    // (the markers' index is built only when the mouse first needs it after a redraw: a turning globe
    // redraws on every frame, but pauses while hovered)
    const drawnMarkersRef = useRef<Array<DrawnMarker<P>>>([])
    const markersRef = useRef<d3.Quadtree<DrawnMarker<P>> | undefined>(undefined)
    const maxHitRadiusRef = useRef<number>(0)
    const cellsRef = useRef<Array<GeoAggregate>>([])
    // the map, as last drawn into a layer of its own (an offscreen canvas the size of the plot area),
    // for its view and the draw function's settings, so that redrawing the events under a resting
    // view doesn't redraw the map; and the view last drawn (to tell when it's changing)
    const baseLayerRef = useRef<{canvas: HTMLCanvasElement, view: GeoPlotViewState, settings: object} | undefined>(undefined)
    const lastViewRef = useRef<GeoPlotViewState | undefined>(undefined)
    // the scene (the map, and the events or aggregates: everything but the flashes and the hovered
    // event), as last drawn into a layer of its own, by which draw function (which changes with the
    // events and the settings), for which view, and with what hovered -- so that the frames between
    // batches of events (e.g. as the flashes animate) copy it, rather than drawing every marker again
    const sceneRef = useRef<{canvas: HTMLCanvasElement, draw: unknown, view: GeoPlotViewState, hoveredKey: unknown, scene: DrawnScene<P>} | undefined>(undefined)
    // each event's marker's geometry (see `MarkerGeometry`), for a view and the markers' settings, so
    // that redrawing the events under a resting view (e.g. as new events arrive) projects only the
    // new ones; not kept while the view is changing, since it changes on every frame then
    const geometryRef = useRef<{view: GeoPlotViewState, settings: object, byDatum: WeakMap<GeoDatum<P>, MarkerGeometry>} | undefined>(undefined)
    // the categorical colors handed out to the groups (see `groupColors`), by group
    const groupColorsRef = useRef<Map<string, string>>(new Map())
    // what's under the mouse (an event, or an aggregate)
    const hoveredRef = useRef<GeoTooltipMetadata<P> | undefined>(undefined)
    // the roll-up shown (`undefined` for the events): in the `auto` mode, the level last chosen (`null`
    // before the first), for its hysteresis (see `autoLevelOf`); and in any mode, for hit-testing
    const autoLevelRef = useRef<string | undefined | null>(null)
    const shownRollupRef = useRef<string | undefined>(undefined)
    // the flashes showing: where, how large, how long, and in what color (see `flashes`), the new events
    // they're of, their series, and when (`performance.now()`) they arrived
    const flashesRef = useRef<Array<ResolvedGeoFlash & {datum: GeoDatum<P>, seriesName: string, start: number}>>([])

    // what the map's drawing depends on: a new object whenever any of it changes, so that a map layer
    // drawn with other settings isn't reused (see `baseLayerRef`). (The draw function itself is
    // recreated as each batch of events arrives, so it can't be what identifies them.)
    const mapSettings = useMemo(
        () => ({
            projection, width, height, graticule, showGraticule, basemap, borders, layers, oceanColor, landColor,
            borderColor, graticuleColor, outlineColor, color,
        }),
        [
            projection, width, height, graticule, showGraticule, basemap, borders, layers, oceanColor, landColor,
            borderColor, graticuleColor, outlineColor, color,
        ]
    )

    // what the markers' geometry depends on: a new object whenever any of it changes, so that the
    // geometry kept for other settings isn't reused (see `geometryRef`)
    const markerSettings = useMemo(
        () => ({mapSettings, radiusOf, markerRadius}),
        [mapSettings, radiusOf, markerRadius]
    )

    const updatePlot = useCallback(
        /**
         * (Re-)registers this plot's draw function with the canvas context and requests a redraw
         * @param cc The canvas context to register the draw function with
         */
        (cc: CanvasContext): void => {
            /**
             * Draws the map: the sphere (the oceans), the graticule, the land, the borders, and the
             * sphere's outline
             * @param context2D The context to draw into (translated to the plot area)
             */
            const drawMap = (context2D: CanvasRenderingContext2D): void => {
                // the map's data at this zoom (see `GeoMapData`), trimmed to the features that might
                // show in the view (see `viewBoxOf`), and clipped to the plot area (a little beyond
                // it, so that the clipped areas' outlines fall outside it)
                const k = viewRef.current.k
                const viewBox = viewBoxOf(projection, width, height)
                const shown = (data: GeoMapData | undefined): d3.GeoPermissibleObjects | undefined => {
                    const object = data !== undefined ? detailOf(data, k) : undefined
                    return object !== undefined ? visibleOf(object, viewBox) : undefined
                }
                const shownLayers = (layers ?? [])
                    .filter(layer => layerShownAt(layer, k))
                    .flatMap(layer => {
                        const object = shown(layer.data)
                        return object !== undefined ? [{layer, object}] : []
                    })
                const clipExtent = projection.clipExtent()
                projection.clipExtent([[-MAP_CLIP_MARGIN, -MAP_CLIP_MARGIN], [width + MAP_CLIP_MARGIN, height + MAP_CLIP_MARGIN]])
                const path = d3.geoPath(projection, context2D)

                context2D.beginPath()
                path({type: 'Sphere'})
                context2D.fillStyle = oceanColor
                context2D.fill()

                if (showGraticule) {
                    context2D.beginPath()
                    path(graticule)
                    context2D.strokeStyle = graticuleColor
                    context2D.lineWidth = 0.5
                    context2D.stroke()
                }
                const land = shown(basemap)
                if (land !== undefined) {
                    context2D.beginPath()
                    path(land)
                    context2D.fillStyle = landColor
                    context2D.fill()
                }
                shownLayers.forEach(({layer, object}) => drawLayerShapes(context2D, path, layer, object))
                const lines = shown(borders)
                if (lines !== undefined) {
                    context2D.beginPath()
                    path(lines)
                    context2D.strokeStyle = borderColor
                    context2D.lineWidth = 0.5
                    context2D.stroke()
                }
                // (the labels over everything else of the map)
                shownLayers.forEach(({layer, object}) => drawLayerLabels(context2D, path, layer, object, color, width, height))
                context2D.beginPath()
                path({type: 'Sphere'})
                context2D.strokeStyle = outlineColor
                context2D.lineWidth = 1
                context2D.stroke()
                projection.clipExtent(clipExtent)
            }

            const draw = (context: CanvasContext): void => {
                const {context2D, dpr} = context
                const view = viewRef.current
                setUpProjection(projection, view, width, height)
                // (for what's drawn over the scene, see `drawScene`)
                const path = d3.geoPath(projection, context2D)
                const viewChanged = lastViewRef.current !== view
                lastViewRef.current = view

                context2D.save()
                clipToArea(context, plotDimensions, {x: margin.left, y: margin.top})
                context2D.translate(margin.left, margin.top)

                // a globe hides the far side, beyond its clip angle from the view's center
                const [lambda, phi] = projection.rotate()
                const viewCenter: [number, number] = [-lambda, -phi]
                const maxDistance = isGlobe(projection) ? (projection.clipAngle() ?? 0) / DEGREES : Infinity
                /**
                 * @param latitude A latitude
                 * @param longitude A longitude
                 * @return Where the place is drawn in the plot area, or `undefined` when it isn't shown
                 */
                const shownAt = (latitude: number, longitude: number): [number, number] | undefined => {
                    const location: [number, number] = [longitude, latitude]
                    if (maxDistance !== Infinity && d3.geoDistance(location, viewCenter) > maxDistance) return undefined
                    const projected = projection(location)
                    if (projected === null || !Number.isFinite(projected[0]) || !Number.isFinite(projected[1])) return undefined
                    const [x, y] = projected
                    return x < 0 || y < 0 || x > width || y > height ? undefined : [x, y]
                }

                // the markers are circles on the sphere, shaped by the projection as it shapes the map
                // (e.g. flattened toward a globe's edge, or stretched toward the poles of a Mercator
                // map). A marker's radius is in pixels at the view's center, where the projection's
                // scale is the pixels per radian, so the markers keep their size as the view zooms. An
                // event's marker is drawn as the ellipse it projects to (see `markerEllipseAt`), which
                // is a few times quicker; an aggregate's, and an event's that the ellipse would get
                // wrong, through the projection. (Small circles get fewer points.)
                const degreesPerPixel = DEGREES / projection.scale()
                const circle = d3.geoCircle()
                const circleAt = (latitude: number, longitude: number, radius: number): d3.GeoPermissibleObjects =>
                    circle
                        .center([longitude, latitude])
                        .radius(radius * degreesPerPixel)
                        .precision(radius < 4 ? 30 : radius < 10 ? 15 : 6)()

                // an event's (or an aggregate's) fading, by the age of its time relative to the
                // latest event: from 0 (new) to FADE_LEVELS - 1 (faded)
                const latestTime = dataSource?.latestTime() ?? 0
                const fades = fadeDuration !== undefined && fadeDuration > 0
                const fadeLevelOf = (time: number): number => fades ?
                    Math.round(Math.min(1, Math.max(0, (latestTime - time) / fadeDuration)) * (FADE_LEVELS - 1)) :
                    0
                const fadingOf = (level: number): number => 1 - (1 - fadedOpacity) * level / (FADE_LEVELS - 1)

                /**
                 * @param seriesName A series' name
                 * @return Whether its events (and flashes) are drawn while a series is hovered in the
                 * legend: all of them, unless the hovered series is isolated
                 */
                const shownWithHovered = (seriesName: string): boolean =>
                    !isolateHoveredSeries || hoveredSeriesName === null || seriesName === hoveredSeriesName

                const hoveredKey = hoveredRef.current !== undefined ? markerKeyOf(hoveredRef.current) : undefined

                // what's shown: the events, or a roll-up's aggregates -- in the auto mode, the
                // roll-up whose cells are about as small on the screen as what can be told apart at
                // this zoom (a degree spans the projection's scale over DEGREES pixels at the view's
                // center), or, zoomed in far enough, the events (see `autoLevelOf`)
                let shownRollup = mode === 'aggregates' ? rollup : undefined
                if (mode === 'auto') {
                    const pixelsPerDegree = projection.scale() / DEGREES
                    const levels = rollupCellSizesOf(dataSource, autoRollups)
                        .map(({rollup: name, degrees}) => ({rollup: name, cellPixels: degrees * pixelsPerDegree}))
                    shownRollup = autoLevelOf(levels, clusterDistance, autoLevelRef.current)
                    autoLevelRef.current = shownRollup
                }
                const showsAggregates = mode === 'aggregates' || shownRollup !== undefined
                shownRollupRef.current = shownRollup

                /**
                 * Draws the scene: the map, and the events (or the aggregates, with their keys, and the
                 * hovered aggregate's outline) -- everything but the flashes and the hovered event,
                 * which are drawn over it
                 * @param sceneContext The context to draw into (translated to the plot area): the
                 * canvas', or the scene's layer's (see `sceneRef`)
                 * @return What was drawn: the markers and cells (for hit-testing), and the hovered one
                 */
                const drawScene = (sceneContext: CanvasRenderingContext2D): DrawnScene<P> => {
                    const path = d3.geoPath(projection, sceneContext)
                    const markers: Array<DrawnMarker<P>> = []
                    const cells: Array<GeoAggregate> = []
                    let highlighted: DrawnMarker<P> | undefined = undefined
                    // redraws the hovered aggregate's outline (drawn last, over the other aggregates)
                    let outlineHovered: (() => void) | undefined = undefined

                    // the map: copied from the layer it was last drawn into, when that was for this view
                    // (e.g. as events arrive under a resting view); drawn directly while the view is
                    // changing (turning, or being dragged), since it changes on every frame then; and
                    // otherwise drawn into the layer (once the view has held still for a redraw), and
                    // copied from it
                    const layer = baseLayerRef.current
                    if (layer !== undefined && layer.view === view && layer.settings === mapSettings) {
                        sceneContext.drawImage(layer.canvas, 0, 0, width, height)
                    } else if (viewChanged || width <= 0 || height <= 0) {
                        drawMap(sceneContext)
                    } else {
                        const canvas = layer?.canvas ?? document.createElement('canvas')
                        canvas.width = Math.round(width * dpr)
                        canvas.height = Math.round(height * dpr)
                        const layerContext = canvas.getContext('2d')
                        if (layerContext !== null) {
                            layerContext.setTransform(dpr, 0, 0, dpr, 0, 0)
                            drawMap(layerContext)
                            baseLayerRef.current = {canvas, view, settings: mapSettings}
                            sceneContext.drawImage(canvas, 0, 0, width, height)
                        } else {
                            drawMap(sceneContext)
                        }
                    }

                    if (showsAggregates) {
                        const aggregates = shownRollup !== undefined ? aggregatesOf(dataSource, shownRollup) : []

                        // the sizes: the circles' areas are proportional to the `sizeBy` values
                        const smallest = sizeDomain?.[0] ?? 0
                        const largest = sizeDomain?.[1] ?? aggregates.reduce(
                            (max, aggregate) => Math.max(max, Number.isFinite(valueOf(aggregate, sizeBy)) ? valueOf(aggregate, sizeBy) : 0),
                            0
                        )
                        const radiusOfValue = (value: number): number => !Number.isFinite(value) || largest <= smallest ?
                            minAggregateRadius :
                            minAggregateRadius + (maxAggregateRadius - minAggregateRadius) *
                                Math.sqrt(Math.max(0, Math.min(1, (value - smallest) / (largest - smallest))))

                        // the colors: by `colorBy` (or, for cells, by `sizeBy` without one)
                        const asCells = (aggregate: GeoAggregate): boolean => aggregateShape === 'cells' && aggregate.bounds !== undefined
                        const asPie = (aggregate: GeoAggregate): boolean => aggregateShape === 'pies' && aggregate.groups.length > 0
                        const colorKey = colorBy ?? (aggregateShape === 'cells' ? sizeBy : undefined)
                        // (a pie's wedges are colored by their groups' values, so the colors span those)
                        const colorValues = colorKey === undefined ? [] :
                            aggregates.flatMap(aggregate => asPie(aggregate) ?
                                aggregate.groups.map(group => group.count > 0 ? groupValueOf(group, colorKey) : NaN) :
                                [valueOf(aggregate, colorKey)]
                            )
                        // (whether any are drawn without a value, in the `aggregateColor`, for the key)
                        const missingColorValue = colorValues.some(value => !Number.isFinite(value))
                        const colorValuesShown = colorValues.filter(Number.isFinite)
                        const [lowest, highest] = colorDomain ?? [
                            colorValuesShown.reduce((min, value) => Math.min(min, value), Infinity),
                            colorValuesShown.reduce((max, value) => Math.max(max, value), -Infinity),
                        ]
                        const colorOfValue = (value: number): string => !Number.isFinite(value) || !Number.isFinite(lowest) ?
                            aggregateColor :
                            colorScheme(highest > lowest ? Math.max(0, Math.min(1, (value - lowest) / (highest - lowest))) : 1)
                        const fillOf = (aggregate: GeoAggregate): string =>
                            colorKey === undefined ? aggregateColor : colorOfValue(valueOf(aggregate, colorKey))
                        // an aggregate's (or a wedge's) outline: a darker shade of its fill
                        const outlineOf = (fill: string): string => d3.color(fill)?.darker(0.8).formatRgb() ?? color
                        const wedgeFillOf = (group: GeoAggregateGroup): string => colorKey !== undefined ?
                            colorOfValue(groupValueOf(group, colorKey)) :
                            groupColors?.(group.group) ?? categoricalColorOf(groupColorsRef.current, group.group)

                        // the cells (areas), then the circles, the largest first, so that small ones
                        // aren't hidden under large ones
                        aggregates.filter(asCells).forEach(aggregate => {
                            const {west, south, east, north} = aggregate.bounds!
                            const outline = d3.geoGraticule().extent([[west, south], [east, north]]).precision(2).outline()
                            sceneContext.globalAlpha = aggregateOpacity * fadingOf(fadeLevelOf(aggregate.lastTime))
                            sceneContext.beginPath()
                            path(outline)
                            sceneContext.fillStyle = fillOf(aggregate)
                            sceneContext.fill()
                            const hovered = hoveredKey === `${shownRollup}::${aggregate.id}`
                            sceneContext.globalAlpha = hovered ? 1 : 0.5
                            sceneContext.strokeStyle = hovered ? color : withAlpha(color, 0.3)
                            sceneContext.lineWidth = hovered ? 2 : 0.5
                            sceneContext.stroke()
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
                                if (asPie(aggregate) && aggregate.groups.length > 1) {
                                    // a wedge per group, clockwise from north, each its share of the
                                    // cell's events, and each outlined as a circle is: in a darker shade
                                    // of its own fill
                                    const center: [number, number] = [aggregate.longitude, aggregate.latitude]
                                    const total = aggregate.groups.reduce((sum, group) => sum + group.count, 0)
                                    let start = 0
                                    aggregate.groups.forEach(group => {
                                        const end = start + 360 * group.count / total
                                        const wedgeFill = wedgeFillOf(group)
                                        sceneContext.globalAlpha = opacity
                                        sceneContext.beginPath()
                                        path(wedgeOf(center, radius * degreesPerPixel, start, end, radius < 10 ? 20 : 8))
                                        sceneContext.fillStyle = wedgeFill
                                        sceneContext.fill()
                                        sceneContext.strokeStyle = outlineOf(wedgeFill)
                                        sceneContext.lineWidth = 1
                                        sceneContext.stroke()
                                        start = end
                                    })
                                } else {
                                    const circleFill = asPie(aggregate) ? wedgeFillOf(aggregate.groups[0]) : fill
                                    sceneContext.globalAlpha = opacity
                                    sceneContext.beginPath()
                                    path(circleAt(aggregate.latitude, aggregate.longitude, radius))
                                    sceneContext.fillStyle = circleFill
                                    sceneContext.fill()
                                    sceneContext.strokeStyle = outlineOf(circleFill)
                                    sceneContext.lineWidth = 1
                                    sceneContext.stroke()
                                }
                                const marker: DrawnMarker<P> = {
                                    x: x + margin.left, y: y + margin.top, hitRadius: Math.max(radius, 5),
                                    target: {kind: 'aggregate', rollup: shownRollup ?? '', aggregate}
                                }
                                markers.push(marker)
                                if (hoveredKey !== markerKeyOf(marker.target)) return
                                highlighted = marker
                                // hovered: the circle keeps its colors, and its outline -- or, for a
                                // pie, the hovered wedge's outline (or every wedge's, when no wedge is
                                // under the mouse) -- is drawn wider and opaque
                                outlineHovered = (): void => {
                                    sceneContext.globalAlpha = 1
                                    sceneContext.lineWidth = 2
                                    if (asPie(aggregate) && aggregate.groups.length > 1) {
                                        const hoveredGroup = hoveredRef.current?.kind === 'aggregate' ? hoveredRef.current.group : undefined
                                        const center: [number, number] = [aggregate.longitude, aggregate.latitude]
                                        const total = aggregate.groups.reduce((sum, group) => sum + group.count, 0)
                                        let start = 0
                                        aggregate.groups.forEach(group => {
                                            const end = start + 360 * group.count / total
                                            if (hoveredGroup === undefined || group.group === hoveredGroup) {
                                                sceneContext.beginPath()
                                                path(wedgeOf(center, radius * degreesPerPixel, start, end, radius < 10 ? 20 : 8))
                                                sceneContext.strokeStyle = outlineOf(wedgeFillOf(group))
                                                sceneContext.stroke()
                                            }
                                            start = end
                                        })
                                    } else {
                                        sceneContext.beginPath()
                                        path(circleAt(aggregate.latitude, aggregate.longitude, radius))
                                        sceneContext.strokeStyle = outlineOf(asPie(aggregate) ? wedgeFillOf(aggregate.groups[0]) : fill)
                                        sceneContext.stroke()
                                    }
                                }
                            })

                        if (showKeys && aggregates.length > 0) {
                            // the keys' labels carry the measures' units, and their numbers the measures'
                            // formats (see the measures' options)
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
                                sceneContext, width, height, color, backgroundColor,
                                aggregates.some(aggregate => !asCells(aggregate)) ?
                                    {label: keyLabelOf(sizeBy), smallest, largest, radiusOf: radiusOfValue, format: keyFormatOf(sizeBy)} :
                                    undefined,
                                colorKey !== undefined && Number.isFinite(lowest) ?
                                    {
                                        label: keyLabelOf(colorKey), domain: [lowest, highest], colorOf: colorOfValue, format: keyFormatOf(colorKey),
                                        missingColor: missingColorValue ? aggregateColor : undefined,
                                    } :
                                    undefined,
                                colorKey === undefined && aggregates.some(asPie) ? groupKeyOf(aggregates, wedgeFillOf) : undefined,
                            )
                        }
                    } else {
                        // the markers' geometry, kept while the view rests (and started anew for a new
                        // view, or new settings), but not while it's changing
                        const kept = geometryRef.current
                        const geometries = viewChanged ? undefined :
                            kept !== undefined && kept.view === view && kept.settings === markerSettings ? kept :
                                {view, settings: markerSettings, byDatum: new WeakMap<GeoDatum<P>, MarkerGeometry>()}
                        geometryRef.current = geometries ?? kept

                        dataSource?.seriesList().forEach(series => {
                            if (!series.name.match(seriesFilter) || !shownWithHovered(series.name)) return
                            const style = seriesStyles.get(series.name) ?? defaultLineStyle()
                            // (dimmed while another series is hovered in the legend, when not isolating it)
                            const dimming = hoveredSeriesName !== null && series.name !== hoveredSeriesName ? DIMMED_OPACITY : 1
                            // the markers, a path per color and fading, so that a series in one color
                            // is a few fills
                            // (a color and fading's markers are split into paths of at most
                            // MAX_MARKERS_PER_PATH, see there)
                            const paths = new Map<string, {fill: string, level: number, paths: Array<Path2D>, count: number, geoPath: d3.GeoPath}>()

                            series.data.forEach(datum => {
                                // where the marker is drawn, how large, and as what ellipse (kept, while
                                // the view rests, see `geometryRef`)
                                let geometry = geometries?.byDatum.get(datum)
                                if (geometry === undefined) {
                                    const at = shownAt(datum.latitude, datum.longitude)
                                    const markerSize = Math.max(radiusOf?.(datum, series.name) ?? markerRadius, 0.5)
                                    geometry = at === undefined ? null : {
                                        at,
                                        radius: markerSize,
                                        ellipse: markerEllipseAt(projection, at, datum.longitude, datum.latitude, markerSize, degreesPerPixel),
                                    }
                                    geometries?.byDatum.set(datum, geometry)
                                }
                                if (geometry === null) return
                                const {at: [x, y], radius, ellipse} = geometry
                                const fill = colorOf?.(datum, series.name) ?? style.color
                                const level = fadeLevelOf(datum.time)
                                const key = `${fill}|${level}`
                                let markerPath = paths.get(key)
                                if (markerPath === undefined || markerPath.count >= MAX_MARKERS_PER_PATH) {
                                    // (a Path2D has no `beginPath`, which d3's context type asks for, but
                                    // which d3 never calls when it draws polygons into a context)
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
                                    // (each ellipse starts a subpath of its own, so that it isn't joined to
                                    // the one before)
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
                            Array.from(paths.values())
                                .sort((a, b) => b.level - a.level)
                                .forEach(({fill, level, paths: markerPaths}) => {
                                    sceneContext.globalAlpha = dimming * markerOpacity * fadingOf(level)
                                    sceneContext.fillStyle = fill
                                    markerPaths.forEach(markerPath => sceneContext.fill(markerPath))
                                })
                        })
                    }

                    // the hovered aggregate's outline, over the other aggregates
                    const hovered = highlighted as DrawnMarker<P> | undefined
                    if (hovered !== undefined && hovered.target.kind === 'aggregate') {
                        (outlineHovered as (() => void) | undefined)?.()
                    }
                    return {markers, cells, highlighted: hovered}
                }

                // the scene: copied from the layer it was last drawn into, when that was by this draw
                // function (for the same events and settings), for the same view, and with the same
                // thing hovered -- e.g. as the flashes animate between batches of events; drawn
                // directly while the view is changing, since it changes on every frame then; and
                // otherwise drawn into the layer, and copied from it
                const kept = sceneRef.current
                let scene: DrawnScene<P>
                if (kept !== undefined && kept.draw === draw && kept.view === view && kept.hoveredKey === hoveredKey) {
                    context2D.drawImage(kept.canvas, 0, 0, width, height)
                    scene = kept.scene
                } else {
                    // (the markers changed: their index is rebuilt when the mouse next needs it)
                    markersRef.current = undefined
                    const canvas = viewChanged || width <= 0 || height <= 0 ? undefined : kept?.canvas ?? document.createElement('canvas')
                    const sceneContext = canvas?.getContext('2d') ?? null
                    if (canvas === undefined || sceneContext === null) {
                        scene = drawScene(context2D)
                    } else {
                        canvas.width = Math.round(width * dpr)
                        canvas.height = Math.round(height * dpr)
                        sceneContext.setTransform(dpr, 0, 0, dpr, 0, 0)
                        scene = drawScene(sceneContext)
                        sceneRef.current = {canvas, draw, view, hoveredKey, scene}
                        context2D.drawImage(canvas, 0, 0, width, height)
                    }
                }
                const {markers, cells, highlighted} = scene

                // the flashes: a ring, in its event's marker's color, growing and fading from each new
                // event (see `flashDuration`). A ring is a circle on the sphere, like the markers, so
                // the projection shapes it as it shapes them: drawn as the ellipse it projects to, or,
                // where that would be off, through the projection.
                // Flashes of a color that start within a flash's length of each other, close together
                // on the screen, are drawn as one ring (see `flashMergeDistance`), at their middle, as
                // the earliest of them is, wider the more of them it stands for.
                if (flashDuration !== undefined && flashDuration > 0 && flashesRef.current.length > 0) {
                    const now = performance.now()
                    const rings = flashesRef.current.flatMap(flash => {
                        const {latitude, longitude, datum, seriesName} = flash
                        if (!shownWithHovered(seriesName)) return []
                        const ring = flashRingOf(now - flash.start, flash.duration, flash.radius)
                        const at = ring !== undefined ? shownAt(latitude, longitude) : undefined
                        if (ring === undefined || at === undefined) return []
                        const ringColor = flash.color ??
                            colorOf?.(datum, seriesName) ??
                            (seriesStyles.get(seriesName) ?? defaultLineStyle()).color
                        return [{x: at[0], y: at[1], start: flash.start, duration: flash.duration, color: ringColor, ring, latitude, longitude}]
                    })
                    flashGroupsOf(rings, flashMergeDistance).forEach(group => {
                        const earliest = group.reduce((first, ring) => ring.start < first.start ? ring : first)
                        const mean = (of: (ring: typeof earliest) => number): number =>
                            group.reduce((sum, ring) => sum + of(ring), 0) / group.length
                        const at: [number, number] = [mean(ring => ring.x), mean(ring => ring.y)]
                        const latitude = mean(ring => ring.latitude)
                        const longitude = mean(ring => ring.longitude)
                        const {radius, opacity} = earliest.ring
                        context2D.globalAlpha = opacity
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

                // the hovered event (enlarged, in its series' highlight color, with a ring), over the
                // scene (the hovered aggregate's outline is part of it)
                const shown = highlighted
                if (shown !== undefined && shown.target.kind === 'event') {
                    const {seriesName, datum} = shown.target
                    const style = seriesStyles.get(seriesName) ?? defaultLineStyle()
                    context2D.globalAlpha = 1
                    context2D.beginPath()
                    path(circleAt(datum.latitude, datum.longitude, shown.hitRadius - 1))
                    context2D.fillStyle = style.highlightColor
                    context2D.fill()
                    context2D.strokeStyle = color
                    context2D.lineWidth = 1
                    context2D.stroke()
                }

                // while the data changes under a resting mouse (the data source running), keep the
                // tooltip current: close it when what it shows is gone (e.g. dropped as too old, or
                // out of view), and update it when the aggregate it shows has changed
                const hoveredTarget = hoveredRef.current
                if (hoveredTarget !== undefined) {
                    const tooltipId = `tooltip-${chartId}`
                    const current = hoveredTarget.kind === 'aggregate' && aggregateShape === 'cells' ?
                        cells.find(cell => `${shownRollup}::${cell.id}` === hoveredKey) :
                        undefined
                    const now: GeoTooltipMetadata<P> | undefined = shown !== undefined ? shown.target :
                        current !== undefined ? {kind: 'aggregate', rollup: shownRollup ?? '', aggregate: current} :
                            undefined
                    if (now === undefined) {
                        hoveredRef.current = undefined
                        mouseLeaveHandlerFor(tooltipId)?.(nameOf(hoveredTarget))
                    } else if (now.kind === 'aggregate' && hoveredTarget.kind === 'aggregate' && now.aggregate !== hoveredTarget.aggregate) {
                        const updated: GeoTooltipMetadata<P> = {...now, group: hoveredTarget.group}
                        hoveredRef.current = updated
                        mouseOverHandlerFor(tooltipId)?.(
                            nameOf(updated), now.aggregate.lastTime, {series: [], metadata: updated}, mouseRef.current
                        )
                    }
                }

                cellsRef.current = cells
                drawnMarkersRef.current = markers
                context2D.restore()
            }

            onUpdateChartTime(currentTimeRef.current)
            cc.register(`geo-plot-${chartId}`, draw, 10)
            cc.requestRedraw()
        },
        [
            chartId, projection, width, height, plotDimensions, margin.left, margin.top, graticule, mapSettings, markerSettings,
            showGraticule, basemap, borders, layers, oceanColor, landColor, borderColor, graticuleColor,
            outlineColor, markerRadius, markerOpacity, radiusOf, colorOf, fadeDuration, fadedOpacity, flashDuration,
            seriesStyles, seriesFilter, color, backgroundColor, dataSource, onUpdateChartTime, mode, rollup, autoRollups,
            clusterDistance, flashMergeDistance,
            sizeBy, colorBy, sizeDomain, colorDomain, colorScheme, aggregateColor, aggregateOpacity,
            aggregateShape, groupColors, maxAggregateRadius, minAggregateRadius, showKeys, hoveredSeriesName,
            isolateHoveredSeries, mouseOverHandlerFor,
            mouseLeaveHandlerFor,
        ]
    )

    // the latest `updatePlot`, for the view driver (which would otherwise keep a stale one)
    const updatePlotRef = useRef(updatePlot)
    useEffect(
        () => {
            updatePlotRef.current = updatePlot
            if (canvasContext !== null) updatePlot(canvasContext)
        },
        [updatePlot, canvasContext]
    )

    // dragging moves the view, and the wheel zooms it about the mouse (see `useCanvasZoomPan`). The
    // zoom scale grows as the view zooms in (like the bar plot's, not the time-axis plots'), so the
    // wheel is inverted to zoom the same way as the other plots for the same gesture.
    // (d3-zoom's scale setter, for the reset, which the zoom's options are handed before it exists)
    const zoomScaleRef = useRef<(k: number) => void>(noop)
    const {resetZoomTransform, setZoomScale} = useCanvasZoomPan(canvasContext, {
        panEnabled: rotateEnabled,
        zoomEnabled,
        keyModifiersRequired: zoomKeyModifiersRequired,
        // (raised to the starting view's zoom, e.g. framing a small shape, see `fitTo`)
        scaleExtent: [1, Math.max(zoomMaxScaleFactor, initialView.k)],
        invertWheel: true,
        translateExtent: [[margin.left, margin.top], [width, height]],
        onPanStart: () => {
            allowTooltipRef.current = false
            draggingRef.current = true
        },
        onPan: (dx, dy) => {
            viewRef.current = panView(projection, viewRef.current, dx, dy, width, height)
            canvasContext?.requestRedraw()
        },
        onPanEnd: () => {
            allowTooltipRef.current = true
            draggingRef.current = false
            reportView()
        },
        onZoom: ({k, x, y}) => {
            viewRef.current = zoomViewAbout(projection, viewRef.current, k, [x - margin.left, y - margin.top], width, height)
            canvasContext?.requestRedraw()
            reportView()
        },
        onZoomReset,
        resetView: () => {
            viewRef.current = initialView
            // (d3-zoom's transform was reset to a scale of 1: the starting view's may be more)
            zoomScaleRef.current(initialView.k)
            canvasContext?.requestRedraw()
            reportView()
        },
    })

    // restores the zoom of a view handed in (see `viewState`) into d3-zoom's own transform, once the
    // canvas exists (a new canvas' transform starts at a scale of 1, which would mis-measure how far
    // the user may zoom in or out)
    const zoomRestoredRef = useRef<boolean>(false)
    useEffect(
        () => {
            if (canvasContext === null || zoomRestoredRef.current) return
            zoomRestoredRef.current = true
            setZoomScale(viewRef.current.k)
        },
        [canvasContext, setZoomScale]
    )

    useEffect(
        () => {
            zoomScaleRef.current = setZoomScale
        },
        [setZoomScale]
    )

    // a new starting view: a new `center` (or `fitTo`) re-centers (or re-frames) the view, and a new
    // size re-frames it while the user hasn't moved it -- but not when the plot mounts, so that a view
    // handed in is kept
    const framedOnRef = useRef({fitTo, centerLongitude, centerLatitude, initialView})
    useEffect(
        () => {
            const framed = framedOnRef.current
            if (framed.initialView === initialView) return
            const moved = framed.fitTo !== fitTo || framed.centerLongitude !== centerLongitude || framed.centerLatitude !== centerLatitude
            const following = viewRef.current === framed.initialView
            framedOnRef.current = {fitTo, centerLongitude, centerLatitude, initialView}
            if (!moved && !following) return
            viewRef.current = initialView
            resetZoomTransform()
            setZoomScale(initialView.k)
            canvasContext?.requestRedraw()
            reportView()
        },
        [initialView, fitTo, centerLongitude, centerLatitude, canvasContext, resetZoomTransform, setZoomScale, reportView]
    )

    // reports the view when the plot unmounts (e.g. to keep the auto-rotation's progress)
    useEffect(() => (): void => reportView(), [reportView])

    // turns the view westward, at `autoRotate` degrees per second, redrawing at up to
    // ANIMATION_FRAME_RATE frames a second -- except while it's being dragged, or an event is
    // hovered (and reports the view when it pauses)
    useEffect(
        () => {
            if (autoRotate === undefined || autoRotate === 0 || canvasContext === null) return
            let previousTime: number | undefined = undefined
            let wasPaused = false
            let frame = requestAnimationFrame(function turn(time: number): void {
                const paused = draggingRef.current || hoveredRef.current !== undefined
                if (paused || previousTime === undefined || time - previousTime >= ANIMATION_FRAME_INTERVAL) {
                    if (!paused && previousTime !== undefined) {
                        const [lambda, phi, gamma] = viewRef.current.rotate
                        const turned = lambda + autoRotate * (time - previousTime) / 1000
                        viewRef.current = {...viewRef.current, rotate: [((turned % 360) + 540) % 360 - 180, phi, gamma]}
                        canvasContext.requestRedraw()
                    }
                    if (paused && !wasPaused) reportView()
                    wasPaused = paused
                    previousTime = time
                }
                frame = requestAnimationFrame(turn)
            })
            return (): void => cancelAnimationFrame(frame)
        },
        [autoRotate, canvasContext, reportView]
    )

    // the flashes' filters, as of the latest render (read as events arrive, without resubscribing)
    const flashesFilterRef = useRef(flashes)
    const seriesFilterRef = useRef(seriesFilter)
    const flashRadiusRef = useRef(flashRadius)
    useEffect(
        () => {
            flashesFilterRef.current = flashes
            seriesFilterRef.current = seriesFilter
            flashRadiusRef.current = flashRadius
        },
        [flashes, seriesFilter, flashRadius]
    )

    // flashes each new event (see `flashDuration`): takes the events as the data source ingests them,
    // and redraws, at up to ANIMATION_FRAME_RATE frames a second, while any of their rings shows
    useEffect(
        () => {
            if (flashDuration === undefined || flashDuration <= 0 || dataSource === undefined || canvasContext === null) {
                flashesRef.current = []
                return
            }
            let frame: number | undefined = undefined
            let previousTime: number | undefined = undefined
            const animate = (time: number): void => {
                // (the flashes that are over are dropped; the animation stops once none are left)
                const now = performance.now()
                flashesRef.current = flashesRef.current.filter(({start, duration}) => now - start < duration)
                if (previousTime === undefined || time - previousTime >= ANIMATION_FRAME_INTERVAL) {
                    previousTime = time
                    canvasContext.requestRedraw()
                }
                frame = flashesRef.current.length > 0 ? requestAnimationFrame(animate) : undefined
            }
            const subscription = dataSource.chartDataUpdatesObservable.subscribe(data => {
                const start = performance.now()
                const flashing = flashesRef.current
                data.newPoints.forEach((points, seriesName) => {
                    if (!seriesName.match(seriesFilterRef.current)) return
                    points.forEach(datum => {
                        const spec = flashesFilterRef.current?.(datum, seriesName) ?? true
                        resolvedFlashes(spec, datum, {radius: flashRadiusRef.current, duration: flashDuration})
                            .forEach(flash => flashing.push({...flash, datum, seriesName, start}))
                    })
                })
                if (flashing.length > MAX_FLASHES) flashesRef.current = flashing.slice(flashing.length - MAX_FLASHES)
                if (frame === undefined && flashesRef.current.length > 0) frame = requestAnimationFrame(animate)
            })
            return (): void => {
                subscription.unsubscribe()
                if (frame !== undefined) cancelAnimationFrame(frame)
                flashesRef.current = []
            }
        },
        [flashDuration, dataSource, canvasContext]
    )

    // hovering an event (or an aggregate) shows its tooltip (see `GeoPlotTooltipContent`) and
    // highlights it
    useEffect(
        () => {
            if (canvasContext === null) return
            const canvas = canvasContext.canvas
            const tooltipId = `tooltip-${chartId}`

            const leave = (): void => {
                const previous = hoveredRef.current
                if (previous === undefined) return
                mouseLeaveHandlerFor(tooltipId)?.(nameOf(previous))
                hoveredRef.current = undefined
                canvasContext.requestRedraw()
            }

            /**
             * @param x The mouse's x (canvas coordinates)
             * @param y The mouse's y (canvas coordinates)
             * @return What's under the mouse: the nearest marker within its reach, or else the cell
             * (in the `cells` shape) holding the place under the mouse
             */
            const targetAt = (x: number, y: number): GeoTooltipMetadata<P> | undefined => {
                if (markersRef.current === undefined) {
                    const markers = drawnMarkersRef.current
                    markersRef.current = d3.quadtree<DrawnMarker<P>>().x(marker => marker.x).y(marker => marker.y).addAll(markers)
                    maxHitRadiusRef.current = markers.reduce((max, marker) => Math.max(max, marker.hitRadius), 0)
                }
                const hit = markerAt(markersRef.current, maxHitRadiusRef.current, x, y)
                if (hit !== undefined) {
                    const target = hit.target
                    if (target.kind !== 'aggregate' || aggregateShape !== 'pies' || target.aggregate.groups.length === 0) return target
                    // the wedge under the mouse: by the bearing, from the circle's center, of the
                    // place under the mouse
                    setUpProjection(projection, viewRef.current, width, height)
                    const place = placeUnder(projection, [x - margin.left, y - margin.top])
                    const {groups, longitude, latitude} = target.aggregate
                    const index = place === undefined ? -1 :
                        wedgeIndexAt(groups.map(group => group.count), bearingOf([longitude, latitude], place))
                    return index >= 0 ? {...target, group: groups[index].group} : target
                }
                const shownRollup = shownRollupRef.current
                if (cellsRef.current.length === 0 || shownRollup === undefined) return undefined

                setUpProjection(projection, viewRef.current, width, height)
                const place = placeUnder(projection, [x - margin.left, y - margin.top])
                if (place === undefined) return undefined
                const [longitude, latitude] = place
                const cell = cellsRef.current.find(({bounds}) => bounds !== undefined &&
                    latitude >= bounds.south && latitude <= bounds.north &&
                    longitude >= bounds.west && longitude <= bounds.east)
                return cell !== undefined ? {kind: 'aggregate', rollup: shownRollup, aggregate: cell} : undefined
            }

            const handleMove = (event: MouseEvent): void => {
                if (!allowTooltipRef.current || !tooltipVisible) {
                    leave()
                    return
                }
                const [x, y] = canvasLocalPoint(event, canvas)
                mouseRef.current = [x, y]
                const target = targetAt(x, y)
                if (target !== undefined && hoveredRef.current !== undefined && keyOf(hoveredRef.current) === keyOf(target)) return

                leave()
                if (target === undefined) return
                hoveredRef.current = target
                const tooltipData: TooltipData<GeoDatum<P>, GeoTooltipMetadata<P>> = {
                    series: target.kind === 'event' ? [target.datum] : [],
                    metadata: target
                }
                const time = target.kind === 'event' ? target.datum.time : target.aggregate.lastTime
                mouseOverHandlerFor(tooltipId)?.(nameOf(target), time, tooltipData, [x, y])
                canvasContext.requestRedraw()
            }

            canvas.addEventListener('mousemove', handleMove)
            canvas.addEventListener('mouseleave', leave)
            return (): void => {
                canvas.removeEventListener('mousemove', handleMove)
                canvas.removeEventListener('mouseleave', leave)
            }
        },
        [
            canvasContext, chartId, mouseOverHandlerFor, mouseLeaveHandlerFor, tooltipVisible,
            projection, width, height, margin.left, margin.top, aggregateShape
        ]
    )

    // creates the view driver that redraws the plot as events arrive, with the current settings
    // (an effect event, so the driver is only created when the run starts)
    const createViewDriver = useEffectEvent(
        (source: NonNullable<typeof dataSource>) => geoViewDriverFor<P>(
            source,
            windowingTime,
            () => {
                if (canvasContext !== null) updatePlotRef.current(canvasContext)
            },
            time => currentTimeRef.current = time,
            dataUpdatePeriod,
        )
    )

    // while the data source is running (and this plot has a canvas), redraw as events arrive. The
    // driver belongs to this plot instance alone and is torn down with it.
    useEffect(
        () => {
            if (dataSource === undefined || !running || canvasContext === null) return
            const driver = createViewDriver(dataSource)
            return (): void => driver.unsubscribe()
        },
        [dataSource, running, canvasContext]
    )

    // this plot needs a data source (see the `Chart`'s `dataSource` prop)
    useEffect(
        () => {
            if (dataSource === undefined) {
                console.error("GeoPlot requires a data source; set the enclosing Chart's `dataSource` prop")
            }
        },
        [dataSource]
    )

    // unregister this plot's draw function on unmount
    useEffect(
        () => (): void => canvasContext?.unregister(`geo-plot-${chartId}`),
        [canvasContext, chartId]
    )

    return null
}
