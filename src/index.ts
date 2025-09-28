//
// axes
//

import {from} from "rxjs";

export {
    AxisTickStyle, defaultAxisTickStyle,
    AxesFont, defaultAxesFont,
    SeriesStyle,
    SeriesLineStyle, defaultLineStyle,
    BaseAxis, ContinuousNumericAxis, CategoryAxis,
    AxisLocation,
    addCategoryAxis,
    labelIdFor,
    ZoomResult,
    calculateZoomFor, calculateConstrainedZoomFor,
    axisZoomHandler, axesZoomHandler,
    calculatePanFor, panHandler, panHandler2D,
    axesForSeriesGen,
    continuousAxisRanges, continuousAxisIntervals, continuousRange
} from './app/charts/axes/axes'

export {
    ContinuousAxis,
    addContinuousNumericXAxis, addContinuousNumericYAxis
} from './app/charts/axes/ContinuousAxis'

export {
    ContinuousAxisRange, continuousAxisRangeFor
} from './app/charts/axes/continuousAxisRangeFor'

export {
    OrdinalAxis
} from './app/charts/axes/OrdinalAxis'

//
// filters
//

export {
    regexFilter
} from './app/charts/filters/regexFilter'

//
// hooks
//

export {
    AxesState, createAxesState,
    addAxisTo,
    copyAxesState
} from './app/charts/hooks/AxesState'

export * from './app/charts/hooks/useAxes'
export {
    useAxes,
    UseAxesValues, defaultAxesValues
} from './app/charts/hooks/useAxes'

export * from './app/charts/hooks/useChart'
export {
    useChart,
    NoTooltipMetadata,
    UseChartValues, defaultUseChartValues
} from './app/charts/hooks/useChart'

export * from './app/charts/hooks/useDataObservable'
export {
    useDataObservable,
    UseObservableValues, defaultObservableValues
} from './app/charts/hooks/useDataObservable'

export * from './app/charts/hooks/useInitialData'
export {
    useInitialData,
    UseInitialDataValues, defaultInitialDataValues,
} from './app/charts/hooks/useInitialData'

export * from './app/charts/hooks/useMouse'
export {
    useMouse,
    UseMouseValues, defaultMouseValues,
} from './app/charts/hooks/useMouse'

export {} from './app/charts/hooks/usePlotDimensions'
export {
    usePlotDimensions,
    UsePlotDimensionsValues, defaultPlotDimensions,
    defaultMargin
} from './app/charts/hooks/usePlotDimensions'

export {} from './app/charts/hooks/useTooltip'
export {
    useTooltip,
    UseTooltipValues, defaultTooltipValues,
    TooltipData
} from './app/charts/hooks/useTooltip'

//
// observables
//
//

export {
    ChartData, defaultChartData,
    copyChartData
} from './app/charts/observables/ChartData'

export {
    IterateChartData,
    copyIterateDataFrom,
    iteratesObservable
} from './app/charts/observables/iterates'

export {
    ordinalsObservable,
    OrdinalChartData,
    OrdinalStats, defaultOrdinalStats,
    OrdinalValueStats, defaultOrdinalValueStats,
    OrdinalDatumExtremum,
    initialMinValueDatum, initialMaxValueDatum,
    initialMinTimeDatum, initialMaxTimeDatum,
    valueStatusDatumOfDefault,
    isDefaultValueStatsDatum,
    copyOrdinalDataFrom, copyOrdinalStats, copyOrdinalValueStats,
    copyValueStatsForSeries, copyOrdinalDatumExtremum,
} from './app/charts/observables/ordinals'

//
// plots
//

export {
    Series,
    createPlotContainer,
    setClipPath,
    AxesAssignment,
    assignAxes
} from './app/charts/plots/plot'

export {
    BarPlot
} from './app/charts/plots/BarPlot'

export {
    NoCurveFactory,
    PoincarePlot
} from './app/charts/plots/PoincarePlot'

export {
    RasterPlot
} from './app/charts/plots/RasterPlot'

export {
    ScatterPlot
} from './app/charts/plots/ScatterPlot'

//
// series
//
export {
    BaseSeries,
    seriesFrom,
    emptySeries,
    emptySeriesFor
} from './app/charts/series/baseSeries'

export {
    IterateDatum, emptyIterateDatum, iterateDatumOf, nonEmptyIterateDatum,
    type IterateSeries,
    seriesFromTuples as iterateSeriesFromTuples,
} from './app/charts/series/iterateSeries'

export {
    OrdinalDatum, emptyOrdinalDatum, copyOrdinalDatum, ordinalDatumOf, nonEmptyOrdinalDatum,
    type OrdinalSeries,
    seriesFromTuples,
    initialChartData as ordinalSeriesFromTuples,
} from './app/charts/series/ordinalSeries'

export {
    Datum,
    datumOf,
    emptyDatum,
    type TimeSeries,
    seriesFromTuples as timeSeriesFromTuples,
    PixelDatum
} from './app/charts/series/timeSeries'

export {
    TimeSeriesChartData,
    emptyTimeSeriesChartData,
    initialChartData,
} from './app/charts/series/timeSeriesChartData'

// export {
//     seriesFrom,
//     emptySeries,
//     BaseSeries,
//     emptySeriesFor,
// } from './app/charts/series/baseSeries'
// export {
//     TimeSeries,
//     datumOf, Datum, emptyDatum
// } from './app/charts/series/timeSeries'
// export {emptyChartData, ChartData, initialChartData} from './app/charts/chartData'
// export {regexFilter} from './app/charts/regexFilter'
//
// export {Chart} from './app/charts/Chart'
// export {RasterPlot} from "./app/charts/RasterPlot";
// export {ScatterPlot} from "./app/charts/ScatterPlot";
//
// export {defaultMargin, useChart} from "./app/charts/hooks/useChart";
//
// export {
//     AxisLocation,
//     defaultLineStyle,
//     Axes,
//     SeriesLineStyle,
//     ZoomResult,
//     AxesLabelFont
// } from "./app/charts/axes";
// export {ContinuousAxis, addContinuousNumericXAxis, addContinuousNumericYAxis} from "./app/charts/ContinuousAxis";
// export {CategoryAxis} from "./app/charts/CategoryAxis";
// export {assignAxes, createPlotContainer, setClipPath, AxesAssignment, Range, TimeSeries} from "./app/charts/plot";
//
// export {Tracker, TrackerLabelLocation, TrackerAxisUpdate, TrackerAxisInfo} from "./app/charts/Tracker";
//
// export {Tooltip} from "./app/charts/Tooltip";
// export {RasterPlotTooltipContent} from "./app/charts/RasterPlotTooltipContent";
// export {ScatterPlotTooltipContent} from "./app/charts/ScatterPlotTooltipContent";
//
// export {
//     formatNumber,
//     formatTime,
//     formatValue,
//     formatChange,
//     noop,
//     formatValueChange,
//     formatTimeChange,
//     minMaxOf,
//     minMaxYFor
// } from "./app/charts/utils";
