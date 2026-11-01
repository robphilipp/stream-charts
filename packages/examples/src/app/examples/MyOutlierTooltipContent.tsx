import {type JSX} from "react"
import {useOutlierTooltip} from "stream-charts";

/**
 * Note: this is unused but serves as an additional example of a custom tooltip. To use
 * this tooltip, uncomment its usage in the {@link StreamingOutlierChart}.
 * <br/>
 * Custom content for the {@link OutlierPlotTooltipContent} (put it inside one): reads what the
 * tooltip shows, and the formatters, from {@link useOutlierTooltip}.
 * @return The custom tooltip content
 */
export function MyOutlierTooltipContent(): JSX.Element {
    const {
        tooltipContent,
        tooltipStyle,
        datumFormatter,
        bandFormatter,
        measureFormatter,
    } = useOutlierTooltip()

    const {
        seriesName,
        datum,
        upperMeasure = 1,
        lowerMeasure = 0,
        pointsInBand,
    } = tooltipContent

    const outerProb = 1 - upperMeasure
    const innerProb = upperMeasure - lowerMeasure

    return (
        <>
            <div style={{fontWeight: tooltipStyle.fontWeight + 500, fontSize: tooltipStyle.fontSize + 2}}>My Series: {seriesName}</div>
            <hr/>
            {datum && <div>{datumFormatter(datum.datum.x, datum.datum.y)}</div>}
            <div>{bandFormatter(lowerMeasure, upperMeasure)}</div>
            <div>{measureFormatter(innerProb, outerProb)}</div>
            <div>Points in band: {pointsInBand}</div>
            <hr/>
            <div>(custom HTML tooltip)</div>
        </>
    )
}
