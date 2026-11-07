import type {ReactElement, ReactNode} from "react"
import type {TooltipStyle} from "./tooltipUtils"
import {TooltipContent} from "./TooltipContent"
import type {GeoDatum} from "../series/geoSeries"
import type {GeoTooltipMetadata} from "../plots/geoProjections"
import type {GeoAggregate, GeoCellBounds} from "../datasources/geoRollups"
import {formatLatLon, formatTime} from "../utils"
import * as d3 from "d3"

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

const defaultValueFormatter = (_name: string, value: number): string =>
    Number.isFinite(value) ? d3.format(',.3~f')(value) : '---'

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
     * Formats a measure's value, for an aggregate. Defaults to the value with up to three decimals.
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
     * @return The tooltip content
     */
    aggregateFormatter?: (aggregate: GeoAggregate, rollup: string) => ReactNode
}

/**
 * The tooltip content for the {@link GeoPlot}: for an event, its series and sensor, where and when it
 * happened, and its payload; for an aggregate (in the plot's `aggregates` mode), its roll-up, how
 * many events (from how many sensors) it holds, where and over what time, its measures, and its
 * largest groups. Place it inside the chart's `<Tooltip>`.
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
        valueFormatter = defaultValueFormatter,
        maxGroups = 6,
        aggregateFormatter,
    } = props

    return (
        <TooltipContent<GeoDatum<P>, GeoTooltipMetadata<P>, GeoTooltipMetadata<P>>
            style={style}
            boxStyle={{lineHeight: 1.5}}
            capture={(_seriesName, _time, {metadata}) => metadata}
        >
            {(target, tooltipStyle) => {
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
                    </>
                }

                const {rollup, aggregate} = target
                if (aggregateFormatter !== undefined) return aggregateFormatter(aggregate, rollup)
                const {count, sensorCount, bounds, values, groups, firstTime, lastTime} = aggregate
                return <>
                    <div style={titleStyle}>{rollup}</div>
                    <div>
                        <b>{count.toLocaleString()}</b> {count === 1 ? 'event' : 'events'} from <b>{sensorCount}</b> {sensorCount === 1 ? 'sensor' : 'sensors'}
                    </div>
                    <div>{bounds !== undefined ? formatBounds(bounds) : positionFormatter(aggregate.latitude, aggregate.longitude)}</div>
                    <div>{timeFormatter(firstTime)} – {timeFormatter(lastTime)}</div>
                    {Object.keys(values).length > 0 && <hr/>}
                    {Object.entries(values).map(([name, value]) =>
                        <div key={name}>{name}: <b>{valueFormatter(name, value)}</b></div>
                    )}
                    {groups.length > 0 && <hr/>}
                    {groups.slice(0, maxGroups).map(group =>
                        <div key={group.group}>{group.group}: <b>{group.count.toLocaleString()}</b></div>
                    )}
                    {groups.length > maxGroups && <div><em>+{groups.length - maxGroups} more</em></div>}
                </>
            }}
        </TooltipContent>
    )
}
