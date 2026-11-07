import type {ReactElement, ReactNode} from "react"
import type {TooltipStyle} from "./tooltipUtils"
import {TooltipContent} from "./TooltipContent"
import type {GeoDatum} from "../series/geoSeries"
import type {GeoTooltipMetadata} from "../plots/geoProjections"
import {formatLatLon, formatTime} from "../utils"

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
}

/**
 * The tooltip content for the {@link GeoPlot}: the series and sensor of the event under the mouse,
 * where and when it happened, and its payload. Place it inside the chart's `<Tooltip>`.
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
    } = props

    return (
        <TooltipContent<GeoDatum<P>, GeoTooltipMetadata<P>, GeoTooltipMetadata<P>>
            style={style}
            boxStyle={{lineHeight: 1.5}}
            capture={(_seriesName, _time, {metadata}) => metadata}
        >
            {({seriesName, datum}, tooltipStyle) =>
                <>
                    <div style={{fontWeight: tooltipStyle.fontWeight + 500, fontSize: tooltipStyle.fontSize + 2}}>
                        {seriesName}
                    </div>
                    <div>Sensor: <b>{datum.sensorId}</b></div>
                    <div>{positionFormatter(datum.latitude, datum.longitude)}</div>
                    <div>{timeFormatter(datum.time)}</div>
                    <hr/>
                    {payloadFormatter(datum.payload, datum)}
                </>
            }
        </TooltipContent>
    )
}
