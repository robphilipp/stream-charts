import type {ReactElement, ReactNode} from "react"
import {type Sparkline, sparklineFor, type TooltipStyle} from "./tooltipUtils"
import {TooltipContent} from "./TooltipContent"
import type {GeoDatum} from "../series/geoSeries"
import type {GeoTooltipMetadata} from "../plots/geoProjections"
import {formatMeasure, type GeoAggregate, type GeoAggregateGroup, type GeoCellBounds} from "../datasources/geoRollups"
import {formatLatLon, formatTime} from "../utils"
import {useDataSource} from "../hooks/useDataSource"
import type {GeoChartData} from "../observables/geo"
import type {GeoSeries} from "../series/geoSeries"

// the sizes (px) of the sparklines: a full one (an event's sensor, a one-sensor cell, or the hovered
// group), and an inline one (on a group's line)
const SPARKLINE = {width: 180, height: 32}
const INLINE_SPARKLINE = {width: 60, height: 12}

// the most points a sensor's sparkline is drawn from (its latest ones)
const MAX_SPARKLINE_EVENTS = 500

/**
 * What the tooltip shows: what's under the mouse, and the sparklines of its sensors' readings
 * @template P The type of the events' payload
 */
type GeoTooltipContents<P> = {
    target: GeoTooltipMetadata<P>
    // the event's sensor's readings (the event marked), or a one-sensor cell's readings
    sparkline?: Sparkline
    // the readings of each of the listed groups whose events are one sensor's
    groupSparklines: Map<string, Sparkline>
}

/**
 * @param events Events, oldest first
 * @return `true` when there are at least two of them, all from the same sensor
 */
const oneSensorsEvents = <P, >(events: ReadonlyArray<GeoDatum<P>>): boolean =>
    events.length >= 2 && events.every(event => event.sensorId === events[0].sensorId)

/**
 * @param events A sensor's events, oldest first
 * @param valueOf The value of an event, to draw
 * @param size The sparkline's size
 * @param markedTime The time of an event to mark (e.g. the hovered one)
 * @return The sparkline of the events' values (of their latest ones), or `undefined` when there are
 * fewer than two to draw
 */
function sparklineOf<P>(
    events: ReadonlyArray<GeoDatum<P>>,
    valueOf: (datum: GeoDatum<P>) => number,
    size: {width: number, height: number},
    markedTime?: number,
): Sparkline | undefined {
    const latest = events.length > MAX_SPARKLINE_EVENTS ? events.slice(events.length - MAX_SPARKLINE_EVENTS) : events
    // (room around the line for the marked point's dot, at the full size)
    const padding = size.height > INLINE_SPARKLINE.height ? 4 : 1
    return sparklineFor(latest.map(event => ({time: event.time, value: valueOf(event)})), size.width, size.height, padding, undefined, markedTime)
}

/**
 * A sparkline, as an SVG
 * @param props The sparkline, its size, its color, and whether it's shown on a line of text
 * @return The SVG
 */
function SparklineSvg(props: {sparkline: Sparkline, size: {width: number, height: number}, color: string, inline?: boolean}): ReactElement {
    const {sparkline, size, color, inline = false} = props
    return (
        <svg
            width={size.width}
            height={size.height}
            style={inline ? {display: 'inline-block', verticalAlign: 'middle', marginLeft: 8} : {display: 'block', marginTop: 4}}
            aria-hidden="true"
        >
            <path d={sparkline.path} fill="none" stroke={color} strokeWidth={inline ? 1 : 1.25} strokeLinejoin="round" strokeLinecap="round"/>
            {sparkline.mark !== undefined && <circle cx={sparkline.mark[0]} cy={sparkline.mark[1]} r={2.5} fill={color}/>}
        </svg>
    )
}

/**
 * Shows each of a payload's fields on its own line (`field: value`), or a payload that isn't an
 * object as it is
 * @param payload The payload
 * @return The payload's lines
 */
function defaultPayloadFormatter(payload: unknown): ReactNode {
    if (payload === null || typeof payload !== 'object') return String(payload)
    return Object.entries(payload as Record<string, unknown>).map(([field, value]) =>
        <div key={field}>{field}: <b>{String(value)}</b></div>
    )
}

/**
 * Formats a grid cell's bounds as, e.g., `30° N – 40° N, 130° E – 140° E`
 * @param bounds The cell's bounds
 * @return The formatted bounds
 */
function formatBounds({west, south, east, north}: GeoCellBounds): string {
    const latitude = (degrees: number): string => `${Math.abs(degrees)}° ${degrees < 0 ? 'S' : 'N'}`
    const longitude = (degrees: number): string => `${Math.abs(degrees)}° ${degrees < 0 ? 'W' : 'E'}`
    return `${latitude(south)} – ${latitude(north)}, ${longitude(west)} – ${longitude(east)}`
}

/**
 * @param groups An aggregate's groups, the largest first
 * @param maxGroups The most groups to list
 * @param hoveredGroup The group whose wedge is under the mouse, which is always listed
 * @return The groups to list
 */
function listedGroups(groups: ReadonlyArray<GeoAggregateGroup>, maxGroups: number, hoveredGroup: string | undefined): Array<GeoAggregateGroup> {
    const listed = groups.slice(0, maxGroups)
    const hovered = groups.find(group => group.group === hoveredGroup)
    return hovered !== undefined && !listed.includes(hovered) ? [...listed, hovered] : listed
}


/**
 * The properties of the {@link GeoPlotTooltipContent}
 * @template P The type of the events' payload
 */
export interface Props<P> {
    /**
     * The tooltip's style (merged with the enclosing `<Tooltip>`'s style)
     */
    style?: Partial<TooltipStyle>
    /**
     * Formats the event's position. Defaults to {@link formatLatLon} (e.g. `37.77° N, 122.42° W`).
     * @param latitude The latitude (degrees)
     * @param longitude The longitude (degrees)
     * @return The formatted position
     */
    positionFormatter?: (latitude: number, longitude: number) => ReactNode
    /**
     * Formats the event's time. Defaults to the time in ms (e.g. `12,345 ms`).
     * @param time The time (ms)
     * @return The formatted time
     */
    timeFormatter?: (time: number) => ReactNode
    /**
     * Formats the event's payload. Defaults to one line per field of the payload (`field: value`).
     * @param payload The event's payload
     * @param datum The whole event
     * @return The formatted payload
     */
    payloadFormatter?: (payload: P, datum: GeoDatum<P>) => ReactNode
    /**
     * Formats a measure's value, for an aggregate. Defaults to the value in the measure's own format
     * and units (see the measures' `units` and `format` options, and {@link formatMeasure}).
     * @param name The measure's name
     * @param value The value
     * @return The formatted value
     */
    valueFormatter?: (name: string, value: number) => ReactNode
    /**
     * The most groups to list, for an aggregate (the largest ones). Defaults to 6.
     */
    maxGroups?: number
    /**
     * Replaces the whole tooltip content for an aggregate (the formatters above don't apply then)
     * @param aggregate The aggregate under the mouse
     * @param rollup The name of its roll-up
     * @param group The group whose wedge is under the mouse (with the plot's `pies` shape)
     * @return The tooltip content
     */
    aggregateFormatter?: (aggregate: GeoAggregate, rollup: string, group?: string) => ReactNode
    /**
     * The value of an event to draw in its sensor's sparkline (e.g. `datum => datum.payload.delay`).
     * With it, the tooltip shows sparklines of the sensors' readings over time, from the events the
     * data source holds: for an event, its sensor's (with the event marked); for an aggregate, a
     * one-sensor cell's, and, on their lines, each listed group's whose events are one sensor's (a
     * larger one for the hovered group). Only one sensor's events are ever drawn together, so a
     * sparkline never mixes sensors (or the quantities they measure). Without it, there are no
     * sparklines.
     * @param datum An event
     * @return The value to draw
     */
    sparklineValueOf?: (datum: GeoDatum<P>) => number
}

/**
 * The tooltip content for the {@link GeoPlot}: for an event, its series and sensor, where and when it
 * happened, and its payload; for an aggregate (in the plot's `aggregates` mode), its roll-up, how
 * many events (from how many sensors) it holds, where and over what time, its measures, and its
 * largest groups (and, with the plot's `pies` shape, the measures of the group whose wedge is under
 * the mouse). With `sparklineValueOf`, it also shows sparklines of the sensors' readings over time.
 * Place it inside the chart's `<Tooltip>`.
 * @param props The style and the formatters
 * @return The tooltip content
 * @template P The type of the events' payload
 */
export function GeoPlotTooltipContent<P>(props: Props<P>): ReactElement | null {
    const {
        style,
        positionFormatter = formatLatLon,
        timeFormatter = (time: number): string => formatTime(time, "ms"),
        payloadFormatter = defaultPayloadFormatter,
        valueFormatter,
        maxGroups = 6,
        aggregateFormatter,
        sparklineValueOf,
    } = props

    // the events behind the sparklines: an event's sensor's (in its series), or a cell's (or one of
    // its groups', from the roll-up), held by the data source
    const dataSource = useDataSource<GeoChartData<P>, GeoDatum<P>, GeoSeries<P>>()
    const eventsOf = (rollup: string, cellId: string, group?: string): Array<GeoDatum<P>> =>
        dataSource !== undefined && 'eventsOf' in dataSource ?
            (dataSource as unknown as {eventsOf: (rollup: string, cellId: string, group?: string) => Array<GeoDatum<P>>}).eventsOf(rollup, cellId, group) :
            []

    /**
     * Takes what's under the mouse, with the sparklines of its sensors' readings
     * @param target What's under the mouse
     * @return The tooltip's contents
     */
    const capture = (target: GeoTooltipMetadata<P>): GeoTooltipContents<P> => {
        const groupSparklines = new Map<string, Sparkline>()
        if (sparklineValueOf === undefined) return {target, groupSparklines}

        if (target.kind === 'event') {
            const {seriesName, datum} = target
            const series = dataSource?.series.get(seriesName)
            const events = series === undefined ? [] :
                Array.from(series.data).filter(event => event.sensorId === datum.sensorId)
            return {target, sparkline: sparklineOf(events, sparklineValueOf, SPARKLINE, datum.time), groupSparklines}
        }

        const {rollup, aggregate, group: hoveredGroup} = target
        let sparkline: Sparkline | undefined = undefined
        if (aggregate.groups.length === 0 && aggregate.sensorCount === 1) {
            sparkline = sparklineOf(eventsOf(rollup, aggregate.id), sparklineValueOf, SPARKLINE)
        }
        listedGroups(aggregate.groups, maxGroups, hoveredGroup).forEach(group => {
            const events = eventsOf(rollup, aggregate.id, group.group)
            if (!oneSensorsEvents(events)) return
            const groupSparkline = sparklineOf(events, sparklineValueOf, group.group === hoveredGroup ? SPARKLINE : INLINE_SPARKLINE)
            if (groupSparkline !== undefined) groupSparklines.set(group.group, groupSparkline)
        })
        return {target, sparkline, groupSparklines}
    }

    return (
        <TooltipContent<GeoDatum<P>, GeoTooltipMetadata<P>, GeoTooltipContents<P>>
            style={style}
            boxStyle={{lineHeight: 1.5}}
            capture={(_seriesName, _time, {metadata}) => capture(metadata)}
        >
            {({target, sparkline, groupSparklines}, tooltipStyle) => {
                const titleStyle = {fontWeight: tooltipStyle.fontWeight + 500, fontSize: tooltipStyle.fontSize + 2}
                if (target.kind === 'event') {
                    const {seriesName, datum} = target
                    return <>
                        <div style={titleStyle}>{seriesName}</div>
                        <div>Sensor: <b>{datum.sensorId}</b></div>
                        <div>{positionFormatter(datum.latitude, datum.longitude)}</div>
                        <div>{timeFormatter(datum.time)}</div>
                        <hr/>
                        {payloadFormatter(datum.payload, datum)}
                        {/* the sensor's readings over time, with this event marked (the dot) */}
                        {sparkline !== undefined && <SparklineSvg sparkline={sparkline} size={SPARKLINE} color={tooltipStyle.fontColor}/>}
                    </>
                }

                const {rollup, aggregate, group: hoveredGroup} = target
                if (aggregateFormatter !== undefined) return aggregateFormatter(aggregate, rollup, hoveredGroup)
                const {count, sensorCount, bounds, values, groups, firstTime, lastTime} = aggregate
                // a measure's value: as the application formats it, or in the measure's own format and units
                const formatValue = (name: string, value: number): ReactNode => valueFormatter !== undefined ?
                    valueFormatter(name, value) :
                    formatMeasure(value, aggregate.measures[name])
                return <>
                    <div style={titleStyle}>{rollup}</div>
                    <div>
                        <b>{count.toLocaleString()}</b> {count === 1 ? 'event' : 'events'} from <b>{sensorCount}</b> {sensorCount === 1 ? 'sensor' : 'sensors'}
                    </div>
                    <div>{bounds !== undefined ? formatBounds(bounds) : positionFormatter(aggregate.latitude, aggregate.longitude)}</div>
                    <div>{timeFormatter(firstTime)} – {timeFormatter(lastTime)}</div>
                    {/* (a measure without a value -- e.g. one that only some cells' events have -- is left out) */}
                    {Object.values(values).some(Number.isFinite) && <hr/>}
                    {Object.entries(values).filter(([, value]) => Number.isFinite(value)).map(([name, value]) =>
                        <div key={name}>{name}: <b>{formatValue(name, value)}</b></div>
                    )}
                    {/* a one-sensor cell's readings over time */}
                    {sparkline !== undefined && <SparklineSvg sparkline={sparkline} size={SPARKLINE} color={tooltipStyle.fontColor}/>}
                    {groups.length > 0 && <hr/>}
                    {listedGroups(groups, maxGroups, hoveredGroup).map(group => group.group === hoveredGroup ?
                        // the group whose wedge is under the mouse: highlighted, with its own measures
                        <div key={group.group} style={{margin: '2px 0'}}>
                            <div><b>{group.group}: {group.count.toLocaleString()}</b></div>
                            {Object.entries(group.values).filter(([, value]) => Number.isFinite(value)).map(([name, value]) =>
                                <div key={name} style={{paddingLeft: 14}}>{name}: <b>{formatValue(name, value)}</b></div>
                            )}
                            {groupSparklines.has(group.group) &&
                                <div style={{paddingLeft: 14}}>
                                    <SparklineSvg sparkline={groupSparklines.get(group.group)!} size={SPARKLINE} color={tooltipStyle.fontColor}/>
                                </div>
                            }
                        </div> :
                        // (the other groups' counts are plain while a group is hovered, so it stands out)
                        <div key={group.group}>
                            {group.group}: {hoveredGroup === undefined ? <b>{group.count.toLocaleString()}</b> : group.count.toLocaleString()}
                            {groupSparklines.has(group.group) &&
                                <SparklineSvg sparkline={groupSparklines.get(group.group)!} size={INLINE_SPARKLINE} color={tooltipStyle.fontColor} inline/>
                            }
                        </div>
                    )}
                    {groups.length > maxGroups && <div><em>+{groups.length - maxGroups} more</em></div>}
                </>
            }}
        </TooltipContent>
    )
}
