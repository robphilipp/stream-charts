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
import type {GeoChartData} from "../observables/geo"
import {formatMeasure, type GeoAggregate, type GeoAggregateGroup} from "../datasources/geoRollups"
import type {GeoDatum, GeoSeries} from "../series/geoSeries"
import {usePlotDimensions} from "../hooks/usePlotDimensions"
import {type TooltipData, useTooltip} from "../hooks/useTooltip"
import {
    type GeoPlotViewState,
    type GeoProjectionName,
    GeoProjections,
    type GeoTooltipMetadata,
    bearingOf,
    type DrawnMarker,
    isGlobe,
    markerAt,
    markerEllipseAt,
    panView,
    placeUnder,
    setUpProjection,
    viewCenteredOn,
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
     * and after its view is reset. Defaults to `[0, 20]`. Changing it re-centers the view.
     */
    center?: [longitude: number, latitude: number]
    /**
     * The land (or any other areas) to draw under the events, as GeoJSON (e.g. the `land` features
     * of a world atlas). The plot doesn't come with a map, so that the application chooses its
     * level of detail. Drawn filled, in `landColor`.
     */
    basemap?: d3.GeoPermissibleObjects
    /**
     * The borders (or any other lines) to draw over the basemap, as GeoJSON (e.g. a mesh of a world
     * atlas' country borders). Drawn as lines, in `borderColor`.
     */
    borders?: d3.GeoPermissibleObjects
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
     * What the plot shows: each event (`points`, the default), or the aggregates of one of the data
     * source's roll-ups (`aggregates`, see `rollup`, and the {@link GeoDataSource}'s `rollups`)
     */
    mode?: 'points' | 'aggregates'
    /**
     * The name of the data source's roll-up to show in the `aggregates` mode
     */
    rollup?: string
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
const DEGREES = 180 / Math.PI
// the number of distinct opacities the faded markers are drawn with (so that markers can still be
// drawn a path per color and opacity)
const FADE_LEVELS = 12
// the most frames per second that the auto-rotation redraws (the view turns by the time elapsed, so
// it turns at the same speed, however often it's redrawn): a slowly turning globe looks as smooth at
// 60 frames a second, and the faster displays would otherwise redraw it twice as often, or more
const AUTO_ROTATE_FRAME_RATE = 60

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

    const {
        projection: projectionProp = 'orthographic',
        center = DEFAULT_CENTER,
        basemap,
        borders,
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
        rotateEnabled = true,
        zoomEnabled = true,
        zoomKeyModifiersRequired = true,
        zoomMaxScaleFactor = 20,
        autoRotate,
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
    const initialView = useMemo(
        () => viewCenteredOn([centerLongitude, centerLatitude]),
        [centerLongitude, centerLatitude]
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
    // the categorical colors handed out to the groups (see `groupColors`), by group
    const groupColorsRef = useRef<Map<string, string>>(new Map())
    // what's under the mouse (an event, or an aggregate)
    const hoveredRef = useRef<GeoTooltipMetadata<P> | undefined>(undefined)

    // what the map's drawing depends on: a new object whenever any of it changes, so that a map layer
    // drawn with other settings isn't reused (see `baseLayerRef`). (The draw function itself is
    // recreated as each batch of events arrives, so it can't be what identifies them.)
    const mapSettings = useMemo(
        () => ({
            projection, width, height, graticule, showGraticule, basemap, borders, oceanColor, landColor,
            borderColor, graticuleColor, outlineColor,
        }),
        [
            projection, width, height, graticule, showGraticule, basemap, borders, oceanColor, landColor,
            borderColor, graticuleColor, outlineColor,
        ]
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
                if (basemap !== undefined) {
                    context2D.beginPath()
                    path(basemap)
                    context2D.fillStyle = landColor
                    context2D.fill()
                }
                if (borders !== undefined) {
                    context2D.beginPath()
                    path(borders)
                    context2D.strokeStyle = borderColor
                    context2D.lineWidth = 0.5
                    context2D.stroke()
                }
                context2D.beginPath()
                path({type: 'Sphere'})
                context2D.strokeStyle = outlineColor
                context2D.lineWidth = 1
                context2D.stroke()
            }

            const draw = (context: CanvasContext): void => {
                const {context2D, dpr} = context
                const view = viewRef.current
                setUpProjection(projection, view, width, height)
                const path = d3.geoPath(projection, context2D)

                context2D.save()
                clipToArea(context, plotDimensions, {x: margin.left, y: margin.top})
                context2D.translate(margin.left, margin.top)

                // the map: copied from the layer it was last drawn into, when that was for this view
                // (e.g. as events arrive under a resting view); drawn directly while the view is
                // changing (turning, or being dragged), since it changes on every frame then; and
                // otherwise drawn into the layer (once the view has held still for a redraw), and
                // copied from it
                const layer = baseLayerRef.current
                const viewChanged = lastViewRef.current !== view
                lastViewRef.current = view
                if (layer !== undefined && layer.view === view && layer.settings === mapSettings) {
                    context2D.drawImage(layer.canvas, 0, 0, width, height)
                } else if (viewChanged || width <= 0 || height <= 0) {
                    drawMap(context2D)
                } else {
                    const canvas = layer?.canvas ?? document.createElement('canvas')
                    canvas.width = Math.round(width * dpr)
                    canvas.height = Math.round(height * dpr)
                    const layerContext = canvas.getContext('2d')
                    if (layerContext !== null) {
                        layerContext.setTransform(dpr, 0, 0, dpr, 0, 0)
                        drawMap(layerContext)
                        baseLayerRef.current = {canvas, view, settings: mapSettings}
                        context2D.drawImage(canvas, 0, 0, width, height)
                    } else {
                        drawMap(context2D)
                    }
                }

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

                const markers: Array<DrawnMarker<P>> = []
                const cells: Array<GeoAggregate> = []
                const hoveredKey = hoveredRef.current !== undefined ? markerKeyOf(hoveredRef.current) : undefined
                let highlighted: DrawnMarker<P> | undefined = undefined
                // redraws the hovered aggregate's outline (drawn last, over the other aggregates)
                let outlineHovered: (() => void) | undefined = undefined

                if (mode === 'aggregates') {
                    const aggregates = rollup !== undefined ? aggregatesOf(dataSource, rollup) : []

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
                        context2D.globalAlpha = aggregateOpacity * fadingOf(fadeLevelOf(aggregate.lastTime))
                        context2D.beginPath()
                        path(outline)
                        context2D.fillStyle = fillOf(aggregate)
                        context2D.fill()
                        const hovered = hoveredKey === `${rollup}::${aggregate.id}`
                        context2D.globalAlpha = hovered ? 1 : 0.5
                        context2D.strokeStyle = hovered ? color : withAlpha(color, 0.3)
                        context2D.lineWidth = hovered ? 2 : 0.5
                        context2D.stroke()
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
                                    context2D.globalAlpha = opacity
                                    context2D.beginPath()
                                    path(wedgeOf(center, radius * degreesPerPixel, start, end, radius < 10 ? 20 : 8))
                                    context2D.fillStyle = wedgeFill
                                    context2D.fill()
                                    context2D.strokeStyle = outlineOf(wedgeFill)
                                    context2D.lineWidth = 1
                                    context2D.stroke()
                                    start = end
                                })
                            } else {
                                const circleFill = asPie(aggregate) ? wedgeFillOf(aggregate.groups[0]) : fill
                                context2D.globalAlpha = opacity
                                context2D.beginPath()
                                path(circleAt(aggregate.latitude, aggregate.longitude, radius))
                                context2D.fillStyle = circleFill
                                context2D.fill()
                                context2D.strokeStyle = outlineOf(circleFill)
                                context2D.lineWidth = 1
                                context2D.stroke()
                            }
                            const marker: DrawnMarker<P> = {
                                x: x + margin.left, y: y + margin.top, hitRadius: Math.max(radius, 5),
                                target: {kind: 'aggregate', rollup: rollup ?? '', aggregate}
                            }
                            markers.push(marker)
                            if (hoveredKey !== markerKeyOf(marker.target)) return
                            highlighted = marker
                            // hovered: the circle keeps its colors, and its outline -- or, for a
                            // pie, the hovered wedge's outline (or every wedge's, when no wedge is
                            // under the mouse) -- is drawn wider and opaque
                            outlineHovered = (): void => {
                                context2D.globalAlpha = 1
                                context2D.lineWidth = 2
                                if (asPie(aggregate) && aggregate.groups.length > 1) {
                                    const hoveredGroup = hoveredRef.current?.kind === 'aggregate' ? hoveredRef.current.group : undefined
                                    const center: [number, number] = [aggregate.longitude, aggregate.latitude]
                                    const total = aggregate.groups.reduce((sum, group) => sum + group.count, 0)
                                    let start = 0
                                    aggregate.groups.forEach(group => {
                                        const end = start + 360 * group.count / total
                                        if (hoveredGroup === undefined || group.group === hoveredGroup) {
                                            context2D.beginPath()
                                            path(wedgeOf(center, radius * degreesPerPixel, start, end, radius < 10 ? 20 : 8))
                                            context2D.strokeStyle = outlineOf(wedgeFillOf(group))
                                            context2D.stroke()
                                        }
                                        start = end
                                    })
                                } else {
                                    context2D.beginPath()
                                    path(circleAt(aggregate.latitude, aggregate.longitude, radius))
                                    context2D.strokeStyle = outlineOf(asPie(aggregate) ? wedgeFillOf(aggregate.groups[0]) : fill)
                                    context2D.stroke()
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
                            context2D, width, height, color, backgroundColor,
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
                    dataSource?.seriesList().forEach(series => {
                        if (!series.name.match(seriesFilter)) return
                        const style = seriesStyles.get(series.name) ?? defaultLineStyle()
                        // the markers, a path per color and fading, so that a series in one color
                        // is a few fills
                        const paths = new Map<string, {fill: string, level: number, path: Path2D, geoPath: d3.GeoPath}>()

                        series.data.forEach(datum => {
                            const at = shownAt(datum.latitude, datum.longitude)
                            if (at === undefined) return
                            const [x, y] = at
                            const radius = Math.max(radiusOf?.(datum, series.name) ?? markerRadius, 0.5)
                            const fill = colorOf?.(datum, series.name) ?? style.color
                            const level = fadeLevelOf(datum.time)
                            const key = `${fill}|${level}`
                            let markerPath = paths.get(key)
                            if (markerPath === undefined) {
                                // (a Path2D has no `beginPath`, which d3's context type asks for, but
                                // which d3 never calls when it draws polygons into a context)
                                const markersPath = new Path2D()
                                const geoPath = d3.geoPath(projection, markersPath as unknown as d3.GeoContext)
                                markerPath = {fill, level, path: markersPath, geoPath}
                                paths.set(key, markerPath)
                            }
                            const ellipse = markerEllipseAt(projection, at, datum.longitude, datum.latitude, radius, degreesPerPixel)
                            if (ellipse !== undefined) {
                                const [ellipseX, ellipseY, radiusX, radiusY, rotation] = ellipse
                                // (each ellipse starts a subpath of its own, so that it isn't joined to
                                // the one before)
                                markerPath.path.moveTo(ellipseX + radiusX * Math.cos(rotation), ellipseY + radiusX * Math.sin(rotation))
                                markerPath.path.ellipse(ellipseX, ellipseY, radiusX, radiusY, rotation, 0, 2 * Math.PI)
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
                            .forEach(({fill, level, path: markerPath}) => {
                                context2D.globalAlpha = markerOpacity * fadingOf(level)
                                context2D.fillStyle = fill
                                context2D.fill(markerPath)
                            })
                    })
                }

                // the hovered event (enlarged, in its series' highlight color, with a ring), or the
                // hovered aggregate (its own outline, wider and opaque)
                const shown = highlighted as DrawnMarker<P> | undefined
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
                } else if (shown !== undefined) {
                    (outlineHovered as (() => void) | undefined)?.()
                }

                // while the data changes under a resting mouse (the data source running), keep the
                // tooltip current: close it when what it shows is gone (e.g. dropped as too old, or
                // out of view), and update it when the aggregate it shows has changed
                const hoveredTarget = hoveredRef.current
                if (hoveredTarget !== undefined) {
                    const tooltipId = `tooltip-${chartId}`
                    const current = hoveredTarget.kind === 'aggregate' && aggregateShape === 'cells' ?
                        cells.find(cell => `${rollup}::${cell.id}` === hoveredKey) :
                        undefined
                    const now: GeoTooltipMetadata<P> | undefined = shown !== undefined ? shown.target :
                        current !== undefined ? {kind: 'aggregate', rollup: rollup ?? '', aggregate: current} :
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
                markersRef.current = undefined
                context2D.restore()
            }

            onUpdateChartTime(currentTimeRef.current)
            cc.register(`geo-plot-${chartId}`, draw, 10)
            cc.requestRedraw()
        },
        [
            chartId, projection, width, height, plotDimensions, margin.left, margin.top, graticule, mapSettings,
            showGraticule, basemap, borders, oceanColor, landColor, borderColor, graticuleColor,
            outlineColor, markerRadius, markerOpacity, radiusOf, colorOf, fadeDuration, fadedOpacity,
            seriesStyles, seriesFilter, color, backgroundColor, dataSource, onUpdateChartTime, mode, rollup,
            sizeBy, colorBy, sizeDomain, colorDomain, colorScheme, aggregateColor, aggregateOpacity,
            aggregateShape, groupColors, maxAggregateRadius, minAggregateRadius, showKeys, mouseOverHandlerFor,
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
    const {resetZoomTransform, setZoomScale} = useCanvasZoomPan(canvasContext, {
        panEnabled: rotateEnabled,
        zoomEnabled,
        keyModifiersRequired: zoomKeyModifiersRequired,
        scaleExtent: [1, zoomMaxScaleFactor],
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

    // a new `center` re-centers (and un-zooms) the view -- but not when the plot mounts, so that a
    // view handed in is kept
    const centeredOnRef = useRef(initialView)
    useEffect(
        () => {
            if (centeredOnRef.current === initialView) return
            centeredOnRef.current = initialView
            viewRef.current = initialView
            resetZoomTransform()
            canvasContext?.requestRedraw()
            reportView()
        },
        [initialView, canvasContext, resetZoomTransform, reportView]
    )

    // reports the view when the plot unmounts (e.g. to keep the auto-rotation's progress)
    useEffect(() => (): void => reportView(), [reportView])

    // turns the view westward, at `autoRotate` degrees per second, redrawing at up to
    // AUTO_ROTATE_FRAME_RATE frames a second -- except while it's being dragged, or an event is
    // hovered (and reports the view when it pauses)
    useEffect(
        () => {
            if (autoRotate === undefined || autoRotate === 0 || canvasContext === null) return
            let previousTime: number | undefined = undefined
            let wasPaused = false
            // (a frame is skipped when it comes too soon after the last one redrawn, with some slack,
            // so that a display a little faster than the frame rate still redraws on every other frame)
            const frameInterval = 0.8 * 1000 / AUTO_ROTATE_FRAME_RATE
            let frame = requestAnimationFrame(function turn(time: number): void {
                const paused = draggingRef.current || hoveredRef.current !== undefined
                if (paused || previousTime === undefined || time - previousTime >= frameInterval) {
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
                if (cellsRef.current.length === 0 || rollup === undefined) return undefined

                setUpProjection(projection, viewRef.current, width, height)
                const place = placeUnder(projection, [x - margin.left, y - margin.top])
                if (place === undefined) return undefined
                const [longitude, latitude] = place
                const cell = cellsRef.current.find(({bounds}) => bounds !== undefined &&
                    latitude >= bounds.south && latitude <= bounds.north &&
                    longitude >= bounds.west && longitude <= bounds.east)
                return cell !== undefined ? {kind: 'aggregate', rollup, aggregate: cell} : undefined
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
            canvasContext, chartId, mouseOverHandlerFor, mouseLeaveHandlerFor, tooltipVisible, rollup,
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
