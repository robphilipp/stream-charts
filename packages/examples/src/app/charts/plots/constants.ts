// A sentinel that represents that no curve factory is to be used, which means
// that no line will be drawn between the iterates (kinda gross)
import type {CurveFactory} from "d3";
import type {BarChartElementId} from "./BarPlot.tsx";

export const NoCurveFactory: CurveFactory = undefined as unknown as CurveFactory; // constants identifying the bar-chart elements for which mouse-over/mouse-leave events are defined

export const STREAM_CHARTS_BAR_CHART_ID = 'stream-charts-bar-chart'
export const TOOLTIP_PROVIDER_ID = STREAM_CHARTS_BAR_CHART_ID + '-tooltip-provider'
export const BAR_CHART_TOOLTIP_PROVIDER_IDS: BarChartElementId = {
    currentValue: TOOLTIP_PROVIDER_ID + '-current-value',
    meanValue: TOOLTIP_PROVIDER_ID + '-mean-value',
    minMax: TOOLTIP_PROVIDER_ID + '-min-max',
    windowedMeanValue: TOOLTIP_PROVIDER_ID + '-windowed-min-max',
    windowedMinMax: TOOLTIP_PROVIDER_ID + '-windowed-mean'
}