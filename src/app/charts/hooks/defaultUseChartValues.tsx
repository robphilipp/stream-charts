import type {BaseAxis, SeriesStyle} from "../axes/axes";
import {BaseAxisRange} from "../axes/BaseAxisRange";
import {defaultAxesValues} from "./defaultAxesValues";
import {defaultMouseValues} from "./defaultMouseValues";
import {defaultTooltipValues} from "./defaultTooltipValues";
import type {UseChartValues} from "./useChart";

/**
 * The default values for the {@link UseChartValues}
 * @return The default values for the {@link UseChartValues}
 * @template D The type of the series' datum
 * @template S The type of the series style
 * @template TM The type of the tooltip's metadata (data about the series data)
 * @template AR The type of the axis range
 * @template A The type of the axis
 */
export function defaultUseChartValues<D, S extends SeriesStyle, TM, AR extends BaseAxisRange, A extends BaseAxis>(): UseChartValues<D, S, TM, AR, A> {
    return {
        chartId: NaN,
        canvas: null,
        canvasContext: null,
        color: '#d2933f',
        backgroundColor: '#EEE',
        seriesStyles: new Map<string, S>(),

        // axes
        axes: defaultAxesValues(),

        // data
        seriesFilter: /./,

        // internal chart-interaction event handlers
        mouse: defaultMouseValues(),
        tooltip: defaultTooltipValues(),
        hoveredSeriesName: null,
        setHoveredSeriesName: () => {}
    }
}
