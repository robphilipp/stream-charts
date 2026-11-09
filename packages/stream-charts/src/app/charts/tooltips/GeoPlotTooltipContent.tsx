import type {ReactElement, ReactNode} from "react"
import * as d3 from "d3"
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
// group), with axes, and an inline one (on a group's line); a full one's size is its plot area's,
// without its axes' labels
const SPARKLINE = {width: 180, height: 40}
const INLINE_SPARKLINE = {width: 60, height: 12}
// the space around a sparkline's line, within its plot area (at the full size, room for the marked
// point's dot)
const SPARKLINE_PADDING = 4
const INLINE_SPARKLINE_PADDING = 1
// the space around a full sparkline's plot area for its axes: their ticks and labels (the y-axis' on
// the left; the time axis' below, with its "s" caption to the right of its end)
const AXES_MARGIN = {left: 28, right: 14, top: 4, bottom: 14}
// the length of the axes' ticks
const TICK_LENGTH = 3
// the (most) ticks on the axes (the y-axis' round values, of which only the middle one, if any, is
// labelled, besides the ends)
const VALUE_TICK_COUNT = 2
const TIME_TICK_COUNT = 4

// the most points a sensor's sparkline is drawn from (its latest ones)
const MAX_SPARKLINE_EVENTS = 500

/**
 * A sensor's readings, as a sparkline, and the ranges of the values and the times it spans (for its
 * axes)
 */
type Readings = {
    sparkline: Sparkline
    // the range of values the sparkline's height spans (with axes, a round range, so that the
    // y-axis' ticks are round values)
    values: [lowest: number, highest: number]
    // the times of the first and the last of the readings drawn
    times: [first: number, last: number]
}

/**
 * What the tooltip shows: what's under the mouse, and the sparklines of its sensors' readings
 * @template P The type of the events' payload
 */
type GeoTooltipContents<P> = {
    target: GeoTooltipMetadata<P>
    // the event's sensor's readings (the event marked), or a one-sensor cell's readings
    sparkline?: Readings
    // the readings of each of the listed groups whose events are one sensor's
    groupSparklines: Map<string, Readings>
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
 * @param full Whether it's a full sparkline (with axes), or an inline one
 * @param markedTime The time of an event to mark (e.g. the hovered one)
 * @return The sparkline of the events' values (of their latest ones), or `undefined` when there are
 * fewer than two to draw
 */
function sparklineOf<P>(
    events: ReadonlyArray<GeoDatum<P>>,
    valueOf: (datum: GeoDatum<P>) => number,
    full: boolean,
    markedTime?: number,
): Readings | undefined {
    const latest = events.length > MAX_SPARKLINE_EVENTS ? events.slice(events.length - MAX_SPARKLINE_EVENTS) : events
    const points = latest
        .map(event => ({time: event.time, value: valueOf(event)}))
        .filter(({time, value}) => Number.isFinite(time) && Number.isFinite(value))
    if (points.length < 2) return undefined

    // a full sparkline's height spans a round range of values, for its y-axis' ticks (and a flat
    // line's, a range around its value); an inline one's, the values' own range
    const lowest = points.reduce((min, {value}) => Math.min(min, value), Infinity)
    const highest = points.reduce((max, {value}) => Math.max(max, value), -Infinity)
    const values: [number, number] = !full ? [lowest, highest] :
        lowest < highest ? d3.nice(lowest, highest, VALUE_TICK_COUNT) as [number, number] :
            [lowest - 1, highest + 1]
    const sparkline = full ?
        sparklineFor(points, SPARKLINE.width, SPARKLINE.height, SPARKLINE_PADDING, values, markedTime) :
        sparklineFor(points, INLINE_SPARKLINE.width, INLINE_SPARKLINE.height, INLINE_SPARKLINE_PADDING, undefined, markedTime)
    return sparkline === undefined ?
        undefined :
        {sparkline, values, times: [points[0].time, points[points.length - 1].time]}
}

/**
 * A sensor's readings over time, as a sparkline with axes (like the scatter chart tooltip's
 * autocorrelation): a y-axis on the left, with ticks (and labels) at the ends of a round range of
 * values, and at its middle, when that's a round value too; and a time axis along the bottom, with
 * ticks at round times before the latest reading (in seconds, labelled below the plot), captioned "s"
 * just to the right of its end, at the latest reading
 * @param props The readings' sparkline (and the ranges of their values and times), the color of the
 * line and the axes, and the font size of the axes' labels
 * @return The sparkline, with its axes
 */
function ReadingsChart(props: {readings: Readings, color: string, fontSize: number}): ReactElement {
    const {readings: {sparkline, values: [lowest, highest], times: [first, last]}, color, fontSize} = props
    const {width, height} = SPARKLINE
    // where a time (seconds before the latest reading), and a value, are within the plot area (as
    // `sparklineFor` places them)
    const innerWidth = width - 2 * SPARKLINE_PADDING
    const innerHeight = height - 2 * SPARKLINE_PADDING
    const span = (last - first) / 1000
    const xOf = (secondsBefore: number): number =>
        SPARKLINE_PADDING + (span > 0 ? (span + secondsBefore) / span * innerWidth : innerWidth / 2)
    const yOf = (value: number): number => SPARKLINE_PADDING + (highest - value) / (highest - lowest) * innerHeight
    // (the y-axis sits just left of the plot area, and the time axis just below it, so that they
    // don't cover the line)
    const yAxisX = -TICK_LENGTH
    const timeAxisY = height
    // (the y-axis is short: its labels are the range's ends, and its middle, when that's a round value)
    const middle = (lowest + highest) / 2
    const valueTicks = d3.ticks(lowest, highest, VALUE_TICK_COUNT).includes(middle) ?
        [lowest, middle, highest] :
        [lowest, highest]
    const valueFormat = d3.tickFormat(lowest, highest, VALUE_TICK_COUNT)
    const timeTicks = span > 0 ? d3.ticks(-span, 0, TIME_TICK_COUNT) : []
    const timeFormat = d3.tickFormat(-span, 0, TIME_TICK_COUNT)
    const axisStyle = {stroke: color, strokeOpacity: 0.6, strokeWidth: 1}
    const labelStyle = {fill: color, fillOpacity: 0.8, fontSize}

    return (
        <svg
            width={AXES_MARGIN.left + width + AXES_MARGIN.right}
            height={AXES_MARGIN.top + height + AXES_MARGIN.bottom}
            style={{display: 'block', marginTop: 4}}
            aria-hidden="true"
        >
            <g transform={`translate(${AXES_MARGIN.left}, ${AXES_MARGIN.top})`}>
                {/* the y-axis: the values, the lowest at the bottom */}
                <line x1={yAxisX} y1={yOf(highest)} x2={yAxisX} y2={yOf(lowest)} {...axisStyle}/>
                {valueTicks.map(value => (
                    <g key={value}>
                        <line x1={yAxisX - TICK_LENGTH} y1={yOf(value)} x2={yAxisX} y2={yOf(value)} {...axisStyle}/>
                        <text
                            x={yAxisX - TICK_LENGTH - 2} y={yOf(value)}
                            textAnchor="end" dominantBaseline="middle"
                            {...labelStyle}
                        >
                            {valueFormat(value)}
                        </text>
                    </g>
                ))}
                {/* the time axis: seconds before the latest reading, with ticks at round times */}
                <line x1={yAxisX} y1={timeAxisY} x2={xOf(0)} y2={timeAxisY} {...axisStyle}/>
                {timeTicks.map(secondsBefore => (
                    <g key={secondsBefore}>
                        <line
                            x1={xOf(secondsBefore)} y1={timeAxisY}
                            x2={xOf(secondsBefore)} y2={timeAxisY + TICK_LENGTH}
                            {...axisStyle}
                        />
                        <text
                            x={xOf(secondsBefore)} y={height + AXES_MARGIN.bottom - 2}
                            textAnchor="middle"
                            {...labelStyle}
                        >
                            {timeFormat(secondsBefore)}
                        </text>
                    </g>
                ))}
                {/* the time axis' caption, just to the right of its end */}
                <text
                    x={xOf(0) + TICK_LENGTH} y={timeAxisY}
                    textAnchor="start" dominantBaseline="middle"
                    {...labelStyle}
                >
                    s
                </text>
                <path
                    d={sparkline.path}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.25}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />
                {sparkline.mark !== undefined && <circle cx={sparkline.mark[0]} cy={sparkline.mark[1]} r={2.5} fill={color}/>}
            </g>
        </svg>
    )
}

/**
 * An inline sparkline (on a group's line of text), as an SVG, without axes
 * @param props The sparkline, and its color
 * @return The SVG
 */
function InlineSparklineSvg(props: {sparkline: Sparkline, color: string}): ReactElement {
    const {sparkline, color} = props
    return (
        <svg
            width={INLINE_SPARKLINE.width}
            height={INLINE_SPARKLINE.height}
            style={{display: 'inline-block', verticalAlign: 'middle', marginLeft: 8}}
            aria-hidden="true"
        >
            <path d={sparkline.path} fill="none" stroke={color} strokeWidth={1} strokeLinejoin="round" strokeLinecap="round"/>
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
     * larger one for the hovered group). The larger sparklines (the event's sensor's, the one-sensor
     * cell's, and the hovered group's) have axes: the readings' values, and the time (seconds) before
     * the latest reading. Only one sensor's events are ever drawn together, so a
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
        const groupSparklines = new Map<string, Readings>()
        if (sparklineValueOf === undefined) return {target, groupSparklines}

        if (target.kind === 'event') {
            const {seriesName, datum} = target
            const series = dataSource?.series.get(seriesName)
            const events = series === undefined ? [] :
                Array.from(series.data).filter(event => event.sensorId === datum.sensorId)
            return {target, sparkline: sparklineOf(events, sparklineValueOf, true, datum.time), groupSparklines}
        }

        const {rollup, aggregate, group: hoveredGroup} = target
        let sparkline: Readings | undefined = undefined
        if (aggregate.groups.length === 0 && aggregate.sensorCount === 1) {
            sparkline = sparklineOf(eventsOf(rollup, aggregate.id), sparklineValueOf, true)
        }
        listedGroups(aggregate.groups, maxGroups, hoveredGroup).forEach(group => {
            const events = eventsOf(rollup, aggregate.id, group.group)
            if (!oneSensorsEvents(events)) return
            const groupSparkline = sparklineOf(events, sparklineValueOf, group.group === hoveredGroup)
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
                        {sparkline !== undefined && <ReadingsChart readings={sparkline} color={tooltipStyle.fontColor} fontSize={tooltipStyle.fontSize - 3}/>}
                    </>
                }

                const {rollup, aggregate, group: hoveredGroup} = target
                if (aggregateFormatter !== undefined) return aggregateFormatter(aggregate, rollup, hoveredGroup)
                const {count, sensorCount, bounds, values, groups, firstTime, lastTime} = aggregate
                // (the hovered group is always listed, even when it isn't one of the largest)
                const shownGroups = listedGroups(groups, maxGroups, hoveredGroup)
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
                    {sparkline !== undefined && <ReadingsChart readings={sparkline} color={tooltipStyle.fontColor} fontSize={tooltipStyle.fontSize - 3}/>}
                    {groups.length > 0 && <hr/>}
                    {shownGroups.map(group => group.group === hoveredGroup ?
                        // the group whose wedge is under the mouse: highlighted, with its own measures
                        <div key={group.group} style={{margin: '2px 0'}}>
                            <div><b>{group.group}: {group.count.toLocaleString()}</b></div>
                            {Object.entries(group.values).filter(([, value]) => Number.isFinite(value)).map(([name, value]) =>
                                <div key={name} style={{paddingLeft: 14}}>{name}: <b>{formatValue(name, value)}</b></div>
                            )}
                            {groupSparklines.has(group.group) &&
                                <div style={{paddingLeft: 14}}>
                                    <ReadingsChart readings={groupSparklines.get(group.group)!} color={tooltipStyle.fontColor} fontSize={tooltipStyle.fontSize - 3}/>
                                </div>
                            }
                        </div> :
                        // (the other groups' counts are plain while a group is hovered, so it stands out)
                        <div key={group.group}>
                            {group.group}: {hoveredGroup === undefined ? <b>{group.count.toLocaleString()}</b> : group.count.toLocaleString()}
                            {groupSparklines.has(group.group) &&
                                <InlineSparklineSvg sparkline={groupSparklines.get(group.group)!.sparkline} color={tooltipStyle.fontColor}/>
                            }
                        </div>
                    )}
                    {groups.length > shownGroups.length && <div><em>+{groups.length - shownGroups.length} more</em></div>}
                </>
            }}
        </TooltipContent>
    )
}
