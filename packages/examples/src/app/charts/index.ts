/*
    The public API of the stream-charts library. Everything an application needs is exported from
    here; anything not exported here is internal, and may change without notice.
 */

/*
 | THE CHART
 */
export {Chart, type Props as ChartProps} from "./Chart"
export {useChart, type UseChartValues, type NoTooltipMetadata} from "./hooks/useChart"
export {usePlotDimensions, type UsePlotDimensionsValues} from "./hooks/usePlotDimensions"
export {useDataSource, useDataSourceRunning} from "./hooks/useDataSource"
export {useHoveredSeries, type HoveredSeriesValues} from "./hooks/useHoveredSeries"
export {defaultMargin} from "./hooks/defaultPlotDimensions"
export type {Margin, Dimensions} from "./styling/margins"
export type {SvgStyle} from "./styling/svgStyle"
export type {CanvasContext, DrawFn, DrawHandle} from "./d3types"

/*
 | AXES
 */
export {ContinuousAxis, type Props as ContinuousAxisProps} from "./axes/ContinuousAxis"
export {OrdinalAxis, type Props as OrdinalAxisProps} from "./axes/OrdinalAxis"
export {EmptyAxis, type Props as EmptyAxisProps} from "./axes/EmptyAxis"
export {
    AxisLocation,
    AxisType,
    defaultAxesFont,
    defaultAxisTickStyle,
    defaultLineStyle,
    type AxesFont,
    type AxisTickStyle,
    type BaseAxis,
    type ContinuousNumericAxis,
    type OrdinalStringAxis,
    type SeriesLineStyle,
    type SeriesStyle,
} from "./axes/axes"
export {AxisInterval} from "./axes/AxisInterval"
export {BaseAxisRange} from "./axes/BaseAxisRange"
export {ContinuousAxisRange} from "./axes/ContinuousAxisRange"
export {OrdinalAxisRange} from "./axes/OrdinalAxisRange"
export type {AutoScale} from "./axes/autoScale"

/*
 | PLOTS
 */
export {ScatterPlot, type Props as ScatterPlotProps} from "./plots/ScatterPlot"
export {RasterPlot, type Props as RasterPlotProps} from "./plots/RasterPlot"
export {PoincarePlot, type Props as PoincarePlotProps, type PoincarePlotZoomState} from "./plots/PoincarePlot"
export {BarPlot, type Props as BarPlotProps, type BarPlotZoomState} from "./plots/BarPlot"
export {OutlierPlot, type Props as OutlierPlotProps, type OutlierBandTooltipMetadata} from "./plots/OutlierPlot"
export {assignAxes, type AxesAssignment, type Series} from "./plots/plot"
export {NoCurveFactory, BAR_CHART_TOOLTIP_PROVIDER_IDS} from "./plots/constants"
export {
    DEFAULT_LINE_COLOR_STEPS,
    DEFAULT_LINE_END_COLOR,
    DEFAULT_LINE_START_COLOR,
    lineColorScale,
} from "./plots/colorizedLine"
export {TimeWindowBehavior} from "./subscriptions/viewDrivers"

/*
 | STYLING
 */
export {
    defaultBarSeriesStyle,
    defaultMeanValueLineStyle,
    defaultMinMaxBarStyle,
    defaultValueLineStyle,
    defaultWindowedMeanValueLineStyle,
    defaultWindowedMinMaxBarStyle,
    type BarSeriesStyle,
    type BarStyle,
    type LineStyle,
} from "./styling/barPlotStyle"
export {withAlpha} from "./styling/canvasStyle"

/*
 | TOOLTIPS
 */
export {Tooltip, type Props as TooltipProps} from "./tooltips/Tooltip"
export {TooltipContent, type TooltipCapture, type TooltipContentProps} from "./tooltips/TooltipContent"
export {useTooltipStyle} from "./tooltips/useTooltipStyle"
export {ScatterPlotTooltipContent, type Props as ScatterPlotTooltipContentProps} from "./tooltips/ScatterPlotTooltipContent"
export {RasterPlotTooltipContent, type Props as RasterPlotTooltipContentProps} from "./tooltips/RasterPlotTooltipContent"
export {PoincarePlotTooltipContent, type Props as PoincarePlotTooltipContentProps} from "./tooltips/PoincarePlotTooltipContent"
export {BarPlotTooltipContent, type Props as BarPlotTooltipContentProps} from "./tooltips/BarPlotTooltipContent"
export {OutlierPlotTooltipContent, type Props as OutlierPlotTooltipContentProps} from "./tooltips/OutlierPlotTooltipContent"
export {DefaultOutlierTooltipContent} from "./tooltips/DefaultOutlierTooltipContent"
export {
    useOutlierTooltip,
    type OutlierTooltipContentFormatters,
    type OutlierTooltipContextValue,
    type OutlierTooltipData,
} from "./tooltips/useOutlierTooltip"
export type {TooltipData, TooltipContentProvider} from "./hooks/useTooltip"
export {tooltipAnchorFor, useTooltipPlacement, type TooltipAnchor} from "./tooltips/useTooltipPlacement"
export {
    defaultTooltipStyle,
    sparklineFor,
    type RasterTooltipMetadata,
    type ScatterTooltipMetadata,
    type ScatterTooltipPoints,
    type Sparkline,
    type TooltipStyle,
} from "./tooltips/tooltipUtils"

/*
 | TRACKERS AND LEGENDS
 */
export {Tracker, type Props as TrackerProps} from "./trackers/Tracker"
export {
    defaultTrackerLabelFont,
    defaultTrackerStyle,
    TrackerLabelLocation,
    type TrackerLabelFont,
    type TrackerStyle,
} from "./trackers/trackerUtils"
export {Legend, type Props as LegendProps, type LegendStyle} from "./legends/Legend"
export {defaultLegendStyle, LegendLocation} from "./legends/constants"

/*
 | DATA SOURCES
 */
export {
    BaseStreamingDataSource,
    type DataGenerator,
    type StreamingDataSource,
} from "./datasources/StreamingDataSource"
export {
    TimeSeriesDataSource,
    type TimeGroupFor,
    type TimeSeriesDataSourceOptions,
} from "./datasources/timeSeriesDataSource"
export {IteratesDataSource, type IteratesDataSourceOptions} from "./datasources/iteratesDataSource"
export {
    OrdinalDataSource,
    type OrdinalDataSourceOptions,
    type WindowedOrdinalStats,
} from "./datasources/ordinalDataSource"
export {OutlierDataSource, type OutlierDataSourceOptions} from "./datasources/outlierDataSource"

/*
 | SERIES AND CHART DATA
 */
export {type ChartData} from "./observables/ChartData"
export {
    DEFAULT_COMPACTING_SIZE,
    emptySeries,
    emptySeriesFor,
    seriesFrom,
    type BaseSeries,
} from "./series/baseSeries"

// time series (scatter and raster)
export {datumOf, timeSeriesFromTuples, type Datum, type TimeSeries} from "./series/timeSeries"
export {
    emptyTimeSeriesChartData,
    initialTimeSeriesChartData,
    type TimeSeriesChartData,
} from "./series/timeSeriesChartData"

// iterates (Poincaré)
export {
    iterateDatumOf,
    iterateSeriesFromTuples,
    type IterateDatum,
    type IterateSeries,
} from "./series/iterateSeries"
export {iteratesObservable, type IterateChartData} from "./observables/iterates"

// ordinals (bar)
export {
    calculateOrdinalStats,
    initialOrdinalChartData,
    ordinalDatumOf,
    ordinateSeriesFromTuples,
    type OrdinalDatum,
    type OrdinalSeries,
} from "./series/ordinalSeries"
export {
    defaultOrdinalValueStats,
    ordinalsObservable,
    type OrdinalChartData,
    type OrdinalStats,
    type OrdinalValueStats,
} from "./observables/ordinals"

// outliers
export {
    outlierBoundsFor,
    outlierDatumFor,
    outlierSeriesFor,
    outlierSeriesFrom,
    type OutlierBounds,
    type OutlierDatum,
    type OutlierSeries,
} from "./series/outlierSeries"
export type {OutlierChartData} from "./observables/outliers"

/*
 | FILTERS AND FORMATTING
 */
export {isSafeRegex, literalFilter, regexFilter} from "./filters/regexFilter"
export {
    formatChange,
    formatNumber,
    formatTime,
    formatTimeChange,
    formatValue,
    formatValueChange,
    noop,
} from "./utils"
