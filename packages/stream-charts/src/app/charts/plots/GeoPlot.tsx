import {useCallback, useEffect, useEffectEvent, useMemo, useRef} from 'react'
import * as d3 from "d3"
import {useChart} from "../hooks/useChart"
import {useCanvasZoomPan} from "./useCanvasZoomPan"
import {clipToArea} from "./plot"
import {type BaseAxis, type SeriesLineStyle} from "../axes/axes"
import type {BaseAxisRange} from "../axes/BaseAxisRange"
import type {CanvasContext} from "../d3types"
import {canvasLocalPoint} from "./hitTesting"
import {noop} from "../utils"
import {useLatest} from "../hooks/useLatest"
import {withAlpha} from "../styling/canvasStyle"
import {geoViewDriverFor} from "../subscriptions/viewDrivers"
import {useDataSource, useDataSourceRunning, useStreamingSettings} from "../hooks/useDataSource"
import {useHoveredSeries} from "../hooks/useHoveredSeries"
import type {GeoChartData} from "../observables/geo"
import {type GeoAggregate} from "../datasources/geoRollups"
import {isGeoDataSource} from "../datasources/geoDataSource"
import type {GeoDatum, GeoSeries} from "../series/geoSeries"
import {usePlotDimensions} from "../hooks/usePlotDimensions"
import {type TooltipData, useTooltip} from "../hooks/useTooltip"
import {type GeoLayer, type GeoMapData} from "./geoLayers"
import {
    type GeoPlotViewState,
    type GeoProjectionName,
    GeoProjections,
    canTurn,
    panView,
    placeUnder,
    setUpProjection,
    setUpShiftedProjection,
    SHIFT_REFERENCE_VIEW,
    shiftView,
    viewCenteredOn,
    viewFitting,
    zoomShiftedViewAbout,
    zoomViewAbout,
} from "./geoProjections"
import {
    autoLevelOf,
    bearingOf,
    type DrawnMarker,
    type GeoTooltipMetadata,
    keyOf,
    legendSeriesOf,
    markerAt,
    markerKeyOf,
    pieGroupsOf,
    wedgeIndexAt,
} from "./geoMarkers"
import {type GeoFlashOptions, resolvedFlashes} from "./geoFlashes"
import {ReferenceShapes} from "./geoPens"
import {
    drawAggregates,
    drawEvents,
    drawFlashes,
    drawHoveredEvent,
    drawMap,
    type DrawnScene,
    frameOf,
    type GeoAggregateStyle,
    type GeoEventStyle,
    type GeoMapSettings,
    type MarkerGeometry,
    type ShowingFlash,
    SPHERE,
} from "./geoScene"

/**
 * The colors of a {@link GeoPlot}'s map (see its `mapColors`). Each defaults to a tint of the chart's
 * color.
 */
export interface GeoMapColors {
    /**
     * The fill of the sphere (the oceans). Defaults to a faint tint.
     */
    ocean?: string
    /**
     * The fill of the basemap. Defaults to a light tint.
     */
    land?: string
    /**
     * The color of the borders
     */
    borders?: string
    /**
     * The color of the graticule. Defaults to a faint tint.
     */
    graticule?: string
    /**
     * The color of the sphere's outline
     */
    outline?: string
}

/**
 * How a {@link GeoPlot} draws a roll-up's aggregates (see its `aggregates`)
 */
export interface GeoAggregateOptions {
    /**
     * How the aggregates are drawn:
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
    shape?: 'circles' | 'pies' | 'cells'
    /**
     * What an aggregate's size shows: `count` (the default, its number of events), or the name of
     * one of the roll-up's measures. The circles' areas are proportional to it.
     */
    sizeBy?: string
    /**
     * The fixed `[lowest, largest]` range of the `sizeBy` values that the sizes span: an aggregate at
     * (or below) the lowest value gets the smallest `radius`, and one at (or above) the largest gets
     * the largest, with the circles' areas growing in proportion in between. Defaults to
     * `[0, the largest value shown]`, so the sizes are relative to the largest aggregate.
     */
    sizeDomain?: [number, number]
    /**
     * The `[smallest, largest]` radius (px) of the aggregates' circles. Defaults to `[2, 20]`.
     */
    radius?: [smallest: number, largest: number]
    /**
     * What an aggregate's color shows: `count`, or the name of one of the roll-up's measures
     * (colored by `colorScheme`, over `colorDomain`). Without it, aggregates are drawn in `color`.
     */
    colorBy?: string
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
    color?: string
    /**
     * The color of a group's wedges (with the `pies` shape, without `colorBy`); `undefined` means one
     * of d3's ten categorical colors, handed out in the order the groups first show up, so a group
     * keeps its color as the data changes (beyond ten groups, the colors repeat)
     * @param group The group's name
     * @return The group's color
     */
    groupColors?: (group: string) => string | undefined
    /**
     * The opacity of the aggregates (0 to 1). Defaults to 0.6.
     */
    opacity?: number
    /**
     * Whether to draw the keys (in the bottom-right corner) for the aggregates' sizes and colors.
     * Defaults to `true`.
     */
    showKeys?: boolean
}

/**
 * How a {@link GeoPlot}'s events fade as they age (see its `fade`): from `markerOpacity`, when they
 * arrive, to `markerOpacity * opacity` once they're `duration` old. An event's age is measured from
 * the data source's latest event (the stream's clock), so nothing fades while the data source is
 * paused. Aggregates fade by the age of their latest event.
 */
export interface GeoFadeOptions {
    /**
     * How old (ms) an event is once it's faded
     */
    duration: number
    /**
     * How faint (0 to 1, a fraction of the plot's `markerOpacity`) events become once they're
     * `duration` old. Defaults to 0.15.
     */
    opacity?: number
}

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
     * The map's colors: the oceans, the land, the borders, the graticule, and the sphere's outline.
     * Each defaults to a tint of the chart's color.
     */
    mapColors?: GeoMapColors
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
     * What the plot shows: each event (`events`, the default); the aggregates of one of the data
     * source's roll-ups (`aggregates`, see `rollup`, and the {@link GeoDataSource}'s `rollups`); or,
     * depending on the zoom, a roll-up whose cells are about as small on the screen as what can be
     * told apart, or, zoomed in far enough, the events (`auto`, see `autoRollups` and
     * `clusterDistance`) -- so that a busy map, seen from afar, shows clusters, which come apart as
     * it's zoomed in. The auto mode's clusters, like its events, are of the series the chart's
     * `seriesFilter` shows; a roll-up shown in the `aggregates` mode takes the events it says it
     * takes (see its `filter`).
     */
    mode?: 'events' | 'aggregates' | 'auto'
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
     * In the `auto` mode, called when what it shows changes as the view zooms -- and when it first
     * shows something: one of the `autoRollups` (clusters), or the events
     * @param rollup The name of the roll-up shown, or `undefined` when the events are shown
     */
    onAutoRollupChange?: (rollup: string | undefined) => void
    /**
     * In the `auto` mode, the most (px) that a roll-up's cells may span on the screen: events closer
     * than about this are shown merged, as an aggregate. Defaults to 20.
     */
    clusterDistance?: number
    /**
     * How the aggregates are drawn (in the `aggregates` and `auto` modes): as circles, pies, or cells,
     * sized and colored by what, and with what keys (see {@link GeoAggregateOptions}). The object
     * itself, and its ranges, can be written inline; its functions (`colorScheme`, `groupColors`)
     * should keep their identity from one render to the next (defined outside the component, or
     * memoized), as `radiusOf` and `colorOf` should, since a new one redraws the plot.
     */
    aggregates?: GeoAggregateOptions
    /**
     * When set, the events fade as they age, so that the newest stand out (see
     * {@link GeoFadeOptions}). Defaults to no fading.
     */
    fade?: GeoFadeOptions
    /**
     * When set, each new event flashes as it arrives: a ring grows from it and fades (see
     * {@link GeoFlashOptions}). Defaults to no flashes.
     */
    flash?: GeoFlashOptions<P>
    /**
     * Whether dragging moves the view: a globe (an azimuthal projection, like the default
     * `orthographic`) turns under the mouse; a flat map shifts east and west, and, zoomed in,
     * north and south. Defaults to `true`.
     */
    panEnabled?: boolean
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
     * What hovering a series in the legend does: show that series' events alone (`isolate`, the
     * default -- a map's series often overlap at the same places), or dim the others' and draw its
     * over them (`highlight`). Either way, the events and their flashes are affected; and the
     * aggregates' pies, when the hovered series names one of their groups, dim the other groups'
     * wedges.
     */
    hoveredSeries?: 'isolate' | 'highlight'
    /**
     * When set, the view turns westward (the earth spins eastward) at this many degrees per second,
     * pausing while the view is dragged and while an event is hovered. Defaults to no rotation. The
     * plot redraws up to 60 times a second while it turns, so with many tens of thousands of events
     * held, show a roll-up's aggregates instead, or keep fewer events (the data source's
     * `dropDataAfter`). Not in the "shift" view mode.
     */
    autoRotate?: number
    /**
     * How the view moves: by turning the earth (`turn`, the default) -- a globe turns under a drag,
     * every way, and a flat map turns east and west, and shifts north and south -- or by shifting the
     * map, like a picture (`shift`): fitted to `fitTo` (or the whole sphere), a drag slides it, and
     * the wheel zooms it about the mouse, the projection's own rotation left as it is (e.g. a conic
     * map of one state, set up for it). A projection that can't be turned -- a composite of several,
     * like `albersUsa` (the lower 48 states, with Alaska and Hawaii moved in) -- is always shown in
     * the `shift` mode, and needs `fitTo` (e.g. the United States), since it can't show the whole
     * sphere.
     */
    viewMode?: 'turn' | 'shift'
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
 * @return The name the tooltip's handlers get: the event's series, or the aggregate's roll-up
 */
const nameOf = <P, >(target: GeoTooltipMetadata<P>): string =>
    target.kind === 'event' ? target.seriesName : target.rollup

/**
 * @param rollup The name of a roll-up
 * @param aggregate One of its aggregates
 * @param seriesFilter The series whose events it counts, when not all of them
 * @return What the tooltip gets about the aggregate, under the mouse
 */
const aggregateTargetOf = <P, >(rollup: string, aggregate: GeoAggregate, seriesFilter: RegExp | undefined): GeoTooltipMetadata<P> =>
    seriesFilter !== undefined ? {kind: 'aggregate', rollup, aggregate, seriesFilter} : {kind: 'aggregate', rollup, aggregate}

/**
 * @param dataSource The chart's data source
 * @param rollup The name of a roll-up
 * @param seriesFilter The series whose events count; all of them when not given
 * @return The roll-up's aggregates, when the data source keeps roll-ups (a {@link GeoDataSource}
 * does); otherwise none
 */
const aggregatesOf = (dataSource: unknown, rollup: string, seriesFilter: RegExp | undefined): Array<GeoAggregate> =>
    isGeoDataSource(dataSource) ? dataSource.aggregates(rollup, seriesFilter) : []

/**
 * @param dataSource The chart's data source
 * @param rollups The names of roll-ups, or `undefined` for all of the data source's
 * @return The roll-ups whose cells are of a size, and the size (degrees), when the data source keeps
 * roll-ups (a {@link GeoDataSource} does); otherwise none
 */
function rollupCellSizesOf(dataSource: unknown, rollups: Array<string> | undefined): Array<{rollup: string, degrees: number}> {
    if (!isGeoDataSource(dataSource)) return []
    return (rollups ?? dataSource.rollupNames())
        .map(rollup => ({rollup, degrees: dataSource.rollupCellSize(rollup) ?? NaN}))
        .filter(({degrees}) => Number.isFinite(degrees) && degrees > 0)
}

const DEFAULT_CENTER: [number, number] = [0, 20]
// in the shift view mode, how closely (px) the map's shapes, projected once (see `ReferenceShapes`),
// follow their curves: finer than d3's default (√½ px), since they're scaled up as the view zooms in
const REFERENCE_PRECISION = 0.1
// the most frames per second that the animations (the auto-rotation, and the flashes) redraw (they
// move by the time elapsed, so they move at the same speed, however often they're redrawn): a slowly
// turning globe looks as smooth at 60 frames a second, and the faster displays would otherwise
// redraw it twice as often, or more
const ANIMATION_FRAME_RATE = 60
// (a frame is skipped when it comes too soon after the last one redrawn, with some slack, so that a
// display a little faster than the frame rate still redraws on every other frame)
const ANIMATION_FRAME_INTERVAL = 0.8 * 1000 / ANIMATION_FRAME_RATE
// the most flashes shown at once (the latest), so that a burst of events can't swamp the redraws
const MAX_FLASHES = 500

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
 *         fade={{duration: 30_000}}
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

    // the series hovered in the legend (see `hoveredSeries`)
    const {hoveredSeriesName, setHoveredSeriesName} = useHoveredSeries()

    const {
        projection: projectionProp = 'orthographic',
        center = DEFAULT_CENTER,
        fitTo,
        fitPadding = 20,
        basemap,
        borders,
        layers,
        showGraticule = true,
        mapColors,
        markerRadius = 3,
        markerOpacity = 0.85,
        radiusOf,
        colorOf,
        mode = 'events',
        rollup,
        autoRollups,
        onAutoRollupChange = noop,
        clusterDistance = 20,
        aggregates: aggregateOptions,
        fade,
        flash,
        panEnabled = true,
        zoomEnabled = true,
        zoomKeyModifiersRequired = true,
        zoomMaxScaleFactor = 20,
        autoRotate,
        viewMode = 'turn',
        hoveredSeries = 'isolate',
        viewState,
        onViewChange = noop,
        onZoomReset = noop,
    } = props
    // (the option objects' settings, each on its own: an object handed in anew on each render, e.g.
    // written inline, would otherwise redraw the map on every render)
    const {
        ocean: oceanColor = withAlpha(color, 0.05),
        land: landColor = withAlpha(color, 0.2),
        borders: borderColor = withAlpha(color, 0.4),
        graticule: graticuleColor = withAlpha(color, 0.15),
        outline: outlineColor = withAlpha(color, 0.5),
    } = mapColors ?? {}
    const {
        shape: aggregateShape = 'circles',
        sizeBy = 'count',
        sizeDomain,
        radius: [minAggregateRadius, maxAggregateRadius] = [2, 20],
        colorBy,
        colorDomain,
        colorScheme = d3.interpolateYlOrRd,
        color: aggregateColor = '#4e79a7',
        groupColors,
        opacity: aggregateOpacity = 0.6,
        showKeys = true,
    } = aggregateOptions ?? {}
    const fadeDuration = fade?.duration
    const fadedOpacity = fade?.opacity
    const flashDuration = flash?.duration
    const flashRadius = flash?.radius ?? 20
    const flashes = flash?.which
    const flashMergeDistance = flash?.mergeDistance ?? 20
    const isolateHoveredSeries = hoveredSeries === 'isolate'

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
    // whether the view shifts (and zooms), rather than turns (see `viewMode`): always for a projection
    // that can't be turned (a composite); and the shape it's fitted to before it's shifted or zoomed
    const shifting = viewMode === 'shift' || !canTurn(projection)
    const base = useMemo<d3.GeoPermissibleObjects>(() => fitTo ?? SPHERE, [fitTo])

    /**
     * Sets the projection up for a view: turned (see `setUpProjection`), or, in the shift mode, fitted
     * to the base shape and shifted (see `setUpShiftedProjection`)
     * @param view The view
     */
    const setUp = useCallback(
        (view: GeoPlotViewState): void => {
            if (shifting) setUpShiftedProjection(projection, base, view, width, height, fitPadding)
            else setUpProjection(projection, view, width, height)
        },
        [shifting, projection, base, width, height, fitPadding]
    )

    // (framing `fitTo`, when it's set: for the plot's size, and the projection; in the shift mode, the
    // base shape is the frame, unzoomed and unshifted)
    const initialView = useMemo(
        (): GeoPlotViewState => shifting ? {rotate: [0, 0, 0], k: 1, offsetX: 0, offsetY: 0} :
            fitTo !== undefined ?
                viewFitting(projection, fitTo, width, height, fitPadding) :
                viewCenteredOn([centerLongitude, centerLatitude]),
        [shifting, fitTo, fitPadding, projection, width, height, centerLongitude, centerLatitude]
    )
    const viewRef = useRef<GeoPlotViewState>(viewState ?? initialView)

    // in the shift view mode, the map's shapes projected (each once, when first drawn) at the
    // reference view, which each view only scales and slides (see `shiftedPen`): anew whenever the
    // reference changes
    const referenceShapes = useMemo(
        () => {
            if (!shifting) return undefined
            // (the reference's scale and translation, found once: fitting is slow)
            let reference: {scale: number, translate: [number, number]} | undefined = undefined
            return new ReferenceShapes(<T, >(project: (path: d3.GeoPath) => T): T => {
                const scale = projection.scale()
                const translate = projection.translate()
                const precision = projection.precision()
                const clippable = typeof projection.clipExtent === 'function'
                const clipExtent = clippable ? projection.clipExtent() : null
                if (reference === undefined) {
                    setUpShiftedProjection(projection, base, SHIFT_REFERENCE_VIEW, width, height, fitPadding)
                    reference = {scale: projection.scale(), translate: projection.translate()}
                } else {
                    projection.scale(reference.scale).translate(reference.translate)
                }
                // (unclipped: the views slide what's beyond the plot area at the reference into it)
                projection.precision(REFERENCE_PRECISION)
                if (clippable) projection.clipExtent(null)
                try {
                    return project(d3.geoPath(projection))
                } finally {
                    projection.precision(precision)
                    if (clippable) projection.clipExtent(clipExtent)
                    projection.scale(scale).translate(translate)
                }
            })
        },
        [shifting, projection, base, width, height, fitPadding]
    )

    // reports the view (see `onViewChange`)
    const onViewChangeRef = useLatest(onViewChange)
    const reportView = useCallback((): void => onViewChangeRef.current({...viewRef.current}), [onViewChangeRef])

    // reports what the auto mode shows (see `onAutoRollupChange`)
    const onAutoRollupChangeRef = useLatest(onAutoRollupChange)

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
    // the series the aggregates shown count, when not all of them (see `GeoTooltipMetadata`)
    const aggregateFilterRef = useRef<RegExp | undefined>(undefined)
    // the flashes showing: where, how large, how long, and in what color (see `flash`), the new events
    // they're of, their series, and when (`performance.now()`) they arrived
    const flashesRef = useRef<Array<ShowingFlash<P>>>([])

    // what the map's drawing depends on (see `drawMap`): a new object whenever any of it changes, so
    // that a map layer drawn with other settings isn't reused (see `baseLayerRef`) -- including how a
    // view is projected (`setUp`: e.g. in the shift view mode, the shape fitted, and its padding) and,
    // in the shift view mode, the shapes projected at the reference view. (The draw function itself is
    // recreated as each batch of events arrives, so it can't be what identifies them.)
    const mapSettings = useMemo(
        (): GeoMapSettings & {projection: d3.GeoProjection, setUp: unknown, referenceShapes: unknown, width: number, height: number} => ({
            projection, setUp, referenceShapes, width, height, graticule, showGraticule, basemap, borders, layers,
            oceanColor, landColor, borderColor, graticuleColor, outlineColor, color,
        }),
        [
            projection, setUp, referenceShapes, width, height, graticule, showGraticule, basemap, borders, layers,
            oceanColor, landColor, borderColor, graticuleColor, outlineColor, color,
        ]
    )

    // how the events, and the aggregates, are drawn, and how they fade (each a new object only when
    // it changes)
    const eventStyle = useMemo(
        (): GeoEventStyle<P> => ({seriesFilter, seriesStyles, colorOf, radiusOf, markerRadius, markerOpacity}),
        [seriesFilter, seriesStyles, colorOf, radiusOf, markerRadius, markerOpacity]
    )
    // (the ranges are compared by value, so that one written inline -- e.g. `colorDomain: [0, 50]` --
    // doesn't redraw the scene on every render)
    const [lowestSize, largestSize] = sizeDomain ?? []
    const [lowestColor, highestColor] = colorDomain ?? []
    const aggregateStyle = useMemo(
        (): GeoAggregateStyle => ({
            shape: aggregateShape,
            sizeBy,
            sizeDomain: lowestSize !== undefined && largestSize !== undefined ? [lowestSize, largestSize] : undefined,
            radius: [minAggregateRadius, maxAggregateRadius],
            colorBy,
            colorDomain: lowestColor !== undefined && highestColor !== undefined ? [lowestColor, highestColor] : undefined,
            colorScheme,
            color: aggregateColor,
            groupColors,
            opacity: aggregateOpacity,
            showKeys,
        }),
        [
            aggregateShape, sizeBy, lowestSize, largestSize, minAggregateRadius, maxAggregateRadius, colorBy,
            lowestColor, highestColor, colorScheme, aggregateColor, groupColors, aggregateOpacity, showKeys,
        ]
    )
    const fadeOptions = useMemo(
        (): GeoFadeOptions | undefined => fadeDuration !== undefined ? {duration: fadeDuration, opacity: fadedOpacity} : undefined,
        [fadeDuration, fadedOpacity]
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
            const draw = (context: CanvasContext): void => {
                const {context2D, dpr} = context
                const view = viewRef.current
                setUp(view)
                const viewChanged = lastViewRef.current !== view
                lastViewRef.current = view

                context2D.save()
                clipToArea(context, plotDimensions, {x: margin.left, y: margin.top})
                context2D.translate(margin.left, margin.top)

                const hoveredKey = hoveredRef.current !== undefined ? markerKeyOf(hoveredRef.current) : undefined
                const frame = frameOf({
                    projection, width, height, margin, color, backgroundColor,
                    latestTime: dataSource?.latestTime() ?? 0,
                    fade: fadeOptions,
                    hoveredSeriesName,
                    isolateHoveredSeries,
                    hoveredKey,
                })

                // what's shown: the events, or a roll-up's aggregates -- in the auto mode, the
                // roll-up whose cells are about as small on the screen as what can be told apart at
                // this zoom, or, zoomed in far enough, the events (see `autoLevelOf`)
                let shownRollup = mode === 'aggregates' ? rollup : undefined
                if (mode === 'auto') {
                    const levels = rollupCellSizesOf(dataSource, autoRollups)
                        .map(({rollup: name, degrees}) => ({rollup: name, cellPixels: degrees / frame.degreesPerPixel}))
                    shownRollup = autoLevelOf(levels, clusterDistance, autoLevelRef.current)
                    const changed = autoLevelRef.current !== shownRollup
                    autoLevelRef.current = shownRollup
                    if (changed) onAutoRollupChangeRef.current(shownRollup)
                }
                const showsAggregates = mode === 'aggregates' || shownRollup !== undefined
                shownRollupRef.current = shownRollup
                // (the auto mode's clusters are of the series the chart's filter shows, as its events
                // are; a roll-up shown on its own takes the events it says it takes)
                const aggregateFilter = mode === 'auto' ? seriesFilter : undefined
                aggregateFilterRef.current = aggregateFilter

                /**
                 * Draws the scene: the map, and the events (or the aggregates, with their keys, and the
                 * hovered aggregate's outline) -- everything but the flashes and the hovered event,
                 * which are drawn over it
                 * @param sceneContext The context to draw into (translated to the plot area): the
                 * canvas', or the scene's layer's (see `sceneRef`)
                 * @return What was drawn: the markers and cells (for hit-testing), and the hovered one
                 */
                const drawScene = (sceneContext: CanvasRenderingContext2D): DrawnScene<P> => {
                    // the map: copied from the layer it was last drawn into, when that was for this view
                    // (e.g. as events arrive under a resting view); drawn directly while the view is
                    // changing (turning, or being dragged), since it changes on every frame then; and
                    // otherwise drawn into the layer (once the view has held still for a redraw), and
                    // copied from it
                    const layer = baseLayerRef.current
                    const drawMapInto = (mapContext: CanvasRenderingContext2D): void =>
                        drawMap(mapContext, projection, referenceShapes, view, mapSettings, width, height)
                    if (layer !== undefined && layer.view === view && layer.settings === mapSettings) {
                        sceneContext.drawImage(layer.canvas, 0, 0, width, height)
                    } else if (viewChanged || width <= 0 || height <= 0) {
                        drawMapInto(sceneContext)
                    } else {
                        const canvas = layer?.canvas ?? document.createElement('canvas')
                        canvas.width = Math.round(width * dpr)
                        canvas.height = Math.round(height * dpr)
                        const layerContext = canvas.getContext('2d')
                        if (layerContext !== null) {
                            layerContext.setTransform(dpr, 0, 0, dpr, 0, 0)
                            drawMapInto(layerContext)
                            baseLayerRef.current = {canvas, view, settings: mapSettings}
                            sceneContext.drawImage(canvas, 0, 0, width, height)
                        } else {
                            drawMapInto(sceneContext)
                        }
                    }

                    if (showsAggregates) {
                        const hoveredGroup = hoveredRef.current?.kind === 'aggregate' ? hoveredRef.current.group : undefined
                        return drawAggregates<P>(
                            sceneContext, frame,
                            shownRollup !== undefined ? aggregatesOf(dataSource, shownRollup, aggregateFilter) : [],
                            shownRollup ?? '', aggregateStyle, groupColorsRef.current, hoveredGroup, aggregateFilter,
                        )
                    }
                    // the markers' geometry, kept while the view rests (and started anew for a new
                    // view, or new settings), but not while it's changing
                    const kept = geometryRef.current
                    const geometries = viewChanged ? undefined :
                        kept !== undefined && kept.view === view && kept.settings === markerSettings ? kept :
                            {view, settings: markerSettings, byDatum: new WeakMap<GeoDatum<P>, MarkerGeometry>()}
                    geometryRef.current = geometries ?? kept
                    return drawEvents(sceneContext, frame, dataSource?.seriesList() ?? [], eventStyle, geometries?.byDatum)
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

                // over the scene: the flashes, and the hovered event (the hovered aggregate's outline
                // is part of the scene)
                if (flashDuration !== undefined && flashDuration > 0 && flashesRef.current.length > 0) {
                    drawFlashes(context2D, frame, flashesRef.current, {...eventStyle, mergeDistance: flashMergeDistance}, performance.now())
                }
                if (highlighted !== undefined) drawHoveredEvent(context2D, frame, highlighted, seriesStyles)

                // while the data changes under a resting mouse (the data source running), keep the
                // tooltip current: close it when what it shows is gone (e.g. dropped as too old, or
                // out of view), and update it when the aggregate it shows has changed
                const hoveredTarget = hoveredRef.current
                if (hoveredTarget !== undefined) {
                    const tooltipId = `tooltip-${chartId}`
                    const current = hoveredTarget.kind === 'aggregate' && aggregateShape === 'cells' ?
                        cells.find(cell => markerKeyOf({kind: 'aggregate', rollup: shownRollup ?? '', aggregate: cell}) === hoveredKey) :
                        undefined
                    const now: GeoTooltipMetadata<P> | undefined = highlighted !== undefined ? highlighted.target :
                        current !== undefined ? aggregateTargetOf(shownRollup ?? '', current, aggregateFilter) :
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
                        // (the handlers take the roll-up's name as the series hovered: the legend
                        // highlights the hovered wedge's series instead, if it's of one)
                        setHoveredSeriesName(legendSeriesOf(updated, dataSource?.series))
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
            chartId, projection, setUp, referenceShapes, width, height, plotDimensions, margin, mapSettings,
            markerSettings, eventStyle, aggregateStyle, fadeOptions, onAutoRollupChangeRef, flashDuration,
            flashMergeDistance, seriesStyles, seriesFilter, color, backgroundColor, dataSource, onUpdateChartTime, mode, rollup,
            autoRollups, clusterDistance, aggregateShape, hoveredSeriesName, isolateHoveredSeries,
            mouseOverHandlerFor, mouseLeaveHandlerFor, setHoveredSeriesName,
        ]
    )

    // the latest `updatePlot`, for the view driver (which would otherwise keep a stale one)
    const updatePlotRef = useLatest(updatePlot)
    useEffect(
        () => {
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
        panEnabled,
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
            viewRef.current = shifting ?
                shiftView(viewRef.current, dx, dy) :
                panView(projection, viewRef.current, dx, dy, width, height)
            canvasContext?.requestRedraw()
        },
        onPanEnd: () => {
            allowTooltipRef.current = true
            draggingRef.current = false
            reportView()
        },
        onZoom: ({k, x, y}) => {
            const point: [number, number] = [x - margin.left, y - margin.top]
            viewRef.current = shifting ?
                zoomShiftedViewAbout(viewRef.current, k, point, width, height) :
                zoomViewAbout(projection, viewRef.current, k, point, width, height)
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

    // a new starting view: a new `center` (or `fitTo`) re-centers (or re-frames) the view, as does the
    // view starting or stopping shifting (see `viewMode`: a turned view and a shifted one mean
    // different things), and a new size re-frames it while the user hasn't moved it -- but not when
    // the plot mounts, so that a view handed in is kept
    const framedOnRef = useRef({fitTo, centerLongitude, centerLatitude, shifting, initialView})
    useEffect(
        () => {
            const framed = framedOnRef.current
            if (framed.initialView === initialView) return
            const moved = framed.fitTo !== fitTo || framed.centerLongitude !== centerLongitude ||
                framed.centerLatitude !== centerLatitude || framed.shifting !== shifting
            const following = viewRef.current === framed.initialView
            framedOnRef.current = {fitTo, centerLongitude, centerLatitude, shifting, initialView}
            if (!moved && !following) return
            viewRef.current = initialView
            resetZoomTransform()
            setZoomScale(initialView.k)
            canvasContext?.requestRedraw()
            reportView()
        },
        [initialView, fitTo, centerLongitude, centerLatitude, shifting, canvasContext, resetZoomTransform, setZoomScale, reportView]
    )

    // reports the view when the plot unmounts (e.g. to keep the auto-rotation's progress)
    useEffect(() => (): void => reportView(), [reportView])

    // turns the view westward, at `autoRotate` degrees per second, redrawing at up to
    // ANIMATION_FRAME_RATE frames a second -- except while it's being dragged, or an event is
    // hovered (and reports the view when it pauses)
    useEffect(
        () => {
            if (autoRotate === undefined || autoRotate === 0 || canvasContext === null || shifting) return
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
        [autoRotate, canvasContext, reportView, shifting]
    )

    // the flashes' filters, as of the latest render (read as events arrive, without resubscribing)
    const flashesFilterRef = useLatest(flashes)
    const seriesFilterRef = useLatest(seriesFilter)
    const flashRadiusRef = useLatest(flashRadius)

    // flashes each new event (see `flash`): takes the events as the data source ingests them,
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
        [flashDuration, dataSource, canvasContext, flashesFilterRef, seriesFilterRef, flashRadiusRef]
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
                    setUp(viewRef.current)
                    const place = placeUnder(projection, [x - margin.left, y - margin.top])
                    const {longitude, latitude} = target.aggregate
                    const groups = pieGroupsOf(target.aggregate.groups)
                    const index = place === undefined ? -1 :
                        wedgeIndexAt(groups.map(group => group.count), bearingOf([longitude, latitude], place))
                    return index >= 0 ? {...target, group: groups[index].group} : target
                }
                const shownRollup = shownRollupRef.current
                if (cellsRef.current.length === 0 || shownRollup === undefined) return undefined

                setUp(viewRef.current)
                const place = placeUnder(projection, [x - margin.left, y - margin.top])
                if (place === undefined) return undefined
                const [longitude, latitude] = place
                const cell = cellsRef.current.find(({bounds}) => bounds !== undefined &&
                    latitude >= bounds.south && latitude <= bounds.north &&
                    longitude >= bounds.west && longitude <= bounds.east)
                return cell !== undefined ? aggregateTargetOf(shownRollup, cell, aggregateFilterRef.current) : undefined
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
                // (for an aggregate, the handlers take its roll-up's name as the series hovered: the
                // legend highlights the hovered wedge's series instead, if it's of one, and is left as
                // it is otherwise)
                if (target.kind === 'aggregate') setHoveredSeriesName(legendSeriesOf(target, dataSource?.series))
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
            projection, setUp, width, height, margin.left, margin.top, aggregateShape, dataSource?.series,
            setHoveredSeriesName,
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

    // what this plot needs: a data source (see the `Chart`'s `dataSource` prop); and, for a projection
    // that can't be turned (a composite), which can't show the whole sphere, a shape to frame
    useEffect(
        () => {
            if (dataSource === undefined) {
                console.error("GeoPlot requires a data source; set the enclosing Chart's `dataSource` prop")
            }
            if (!canTurn(projection) && fitTo === undefined) {
                console.error("GeoPlot: a projection that can't be turned (a composite, like albersUsa) needs `fitTo` (e.g. the United States)")
            }
        },
        [dataSource, projection, fitTo]
    )

    // unregister this plot's draw function on unmount
    useEffect(
        () => (): void => canvasContext?.unregister(`geo-plot-${chartId}`),
        [canvasContext, chartId]
    )

    return null
}
