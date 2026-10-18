import type {ChartData} from "./ChartData.ts";
import type {OutlierDatum} from "../series/outlierSeries.ts";

/**
 * The chart data for outlier charts: each series' new {@link OutlierDatum}s (each a value, with
 * the bands it may fall outside of)
 */
export interface OutlierChartData<M extends readonly number[]> extends ChartData {

    /**
     * Maps the series name to the new outlier datum for that series
     */
    newPoints: Map<string, Array<OutlierDatum<M>>>

    /**
     * The current time (used with cadence, when the axes should continue to scroll even when no
     * new data has arrived)
     */
    currentTime?: number
}