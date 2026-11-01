import {type JSX} from "react"
import {useOutlierTooltip} from "./useOutlierTooltip"

/**
 * The default content of the {@link OutlierPlotTooltipContent} (used when it has no children of
 * its own): reads what the tooltip shows, and the formatters, from {@link useOutlierTooltip}
 * @return The series' name, the outlier (if any), the band, its measure, and the number of points
 * in the band
 */
export function DefaultOutlierTooltipContent(): JSX.Element {
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
            <div style={{fontWeight: tooltipStyle.fontWeight + 500, fontSize: tooltipStyle.fontSize + 2}}>Series: {seriesName}</div>
            <hr/>
            {datum && <div>{datumFormatter(datum.datum.x, datum.datum.y)}</div>}
            <div>{bandFormatter(lowerMeasure, upperMeasure)}</div>
            <div>{measureFormatter(innerProb, outerProb)}</div>
            <div>Points in band: {pointsInBand}</div>
        </>
    )
}
