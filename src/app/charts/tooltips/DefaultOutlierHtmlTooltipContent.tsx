import {type JSX} from "react"
import {useOutlierTooltip} from "./useOutlierTooltip.tsx"

/**
 * Default tooltip content for {@link OutlierPlotHtmlTooltipContent}. Reads tooltip data and
 * formatters from context via {@link useOutlierTooltip}. Used automatically when no custom
 * children are provided to {@link OutlierPlotHtmlTooltipContent}.
 * @return The series' name, the datum, the band, its measure, and the number of points in the
 * band (or nothing, when there's no tooltip content)
 */
export function DefaultOutlierHtmlTooltipContent(): JSX.Element {
    const {
        tooltipContent,
        tooltipStyle,
        datumFormatter,
        bandFormatter,
        measureFormatter,
    } = useOutlierTooltip()

    if (tooltipContent === null) return <></>

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
