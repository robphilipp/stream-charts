/**
 * Intended base interface for chart data. All chart data need to hold
 * a {@link Set} of series names.
 * @see TimeSeriesChartData
 * @see IterateChartData
 * @see OrdinalChartData
 */
export interface ChartData {
    seriesNames: Set<string>
}

/**
 * @return A default {@link ChartData} object with an empty set of series
 * names
 */
export function defaultChartData(): ChartData {
    return {
        seriesNames: new Set<string>()
    }
}

/**
 * Creates and returns a deep copy of the {@link ChartData}
 * @param data The chart data to copy
 * @return A deep copy of the chart data
 */
export function copyChartData(data: ChartData) {
    return {
        seriesNames: new Set(data.seriesNames.values()),
    }
}