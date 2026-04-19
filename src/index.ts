export {Chart} from './app/charts/Chart'

export {
    type AxisElementSelection,
    type SvgSelection,
    type GSelection,
    type LineSelection,
    type TextSelection,
    type RadialMagnifierSelection,
    type BarMagnifierSelection,
    type MagnifierTextSelection,
    type TrackerSelection
} from './app/charts/d3types'

export {
    noop,
    mouseInPlotAreaFor,
    textWidthOf,
    textDimensions,
    formatNumber, formatTime, formatValue, formatChange, formatTimeChange, formatValueChange,
    minMaxOf
} from './app/charts/utils'

//
// axes
//

export {
    type AxisTickStyle, defaultAxisTickStyle,
    type AxesFont, defaultAxesFont,
    type SeriesStyle,
    type SeriesLineStyle, defaultLineStyle,
    type BaseAxis, type ContinuousNumericAxis, type OrdinalStringAxis,
    AxisLocation,
    addOrdinalStringAxis,
    labelIdFor,
    type ZoomResult,
    calculateOrdinalConstrainedZoomFor, calculateConstrainedZoomFor,
    ordinalAxisZoomHandler, axesZoomHandler,
    calculatePanFor, panHandler, panHandler2D,
    axesForSeriesGen,
    continuousAxisRanges, continuousAxisIntervals, continuousRange
} from './app/charts/axes/axes'

export {AxisInterval} from './app/charts/axes/AxisInterval'

export {
    ContinuousAxis,
} from './app/charts/axes/ContinuousAxis'

export {
    type ContinuousAxisRange,
} from './app/charts/axes/ContinuousAxisRange'

export {
    OrdinalAxis
} from './app/charts/axes/OrdinalAxis'

export {
    EmptyAxis,
} from './app/charts/axes/EmptyAxis'

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
    type AxesState,
} from './app/charts/axes/AxesState'

export * from './app/charts/hooks/useAxes'
export {
    useAxes,
    type UseAxesValues, defaultAxesValues
} from './app/charts/hooks/useAxes'

export * from './app/charts/hooks/useChart'
export {
    useChart,
    type NoTooltipMetadata,
} from './app/charts/hooks/useChart'

export * from './app/charts/hooks/useDataObservable'
export {
    useDataObservable,
} from './app/charts/hooks/useDataObservable'

export * from './app/charts/hooks/useInitialData'
export {
    useInitialData,
} from './app/charts/hooks/useInitialData'

export * from './app/charts/hooks/useMouse'
export {
    useMouse,
    type UseMouseValues, defaultMouseValues,
} from './app/charts/hooks/useMouse'

export {} from './app/charts/hooks/usePlotDimensions'
export {
    usePlotDimensions,
    type UsePlotDimensionsValues, defaultPlotDimensions,
    defaultMargin
} from './app/charts/hooks/usePlotDimensions'

export {} from './app/charts/hooks/useTooltip'
export {
    useTooltip,
    type UseTooltipValues, defaultTooltipValues,
    type TooltipData
} from './app/charts/hooks/useTooltip'

//
// observables
//
//

export {
    type ChartData, defaultChartData,
    copyChartData
} from './app/charts/observables/ChartData'

export {
    type IterateChartData,
    copyIterateDataFrom,
    iteratesObservable
} from './app/charts/observables/iterates'

export {
    ordinalsObservable,
    type OrdinalChartData,
    type OrdinalStats, defaultOrdinalStats,
    type OrdinalValueStats, defaultOrdinalValueStats,
    type OrdinalDatumExtremum,
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
    type Series,
    createPlotContainer,
    type AxesAssignment,
    setClipPathG,
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
    type BaseSeries,
    seriesFrom,
    emptySeries,
    emptySeriesFor
} from './app/charts/series/baseSeries'

export {
    type IterateDatum, emptyIterateDatum, iterateDatumOf, nonEmptyIterateDatum,
    type IterateSeries,
    iterateSeriesFromTuples,
} from './app/charts/series/iterateSeries'

export {
    type OrdinalDatum, emptyOrdinalDatum, copyOrdinalDatum, ordinalDatumOf, nonEmptyOrdinalDatum,
    type OrdinalSeries,
    ordinateSeriesFromTuples,
    initialOrdinalChartData,
} from './app/charts/series/ordinalSeries'

export {
    type Datum,
    datumOf,
    emptyDatum,
    type TimeSeries,
    timeSeriesFromTuples,
    type PixelDatum
} from './app/charts/series/timeSeries'

export {
    type TimeSeriesChartData,
    emptyTimeSeriesChartData,
    initialTimeSeriesChartData,
} from './app/charts/series/timeSeriesChartData'

//
// styling
//

export {
    type BarSeriesStyle, type BarStyle, type LineStyle,
    defaultBarSeriesStyle,
    defaultMinMaxBarStyle, defaultWindowedMinMaxBarStyle, defaultWindowedMeanValueLineStyle,
    defaultValueLineStyle, defaultMeanValueLineStyle
} from './app/charts/styling/barPlotStyle'

export {
    type Margin,
    noMargins,
    type Dimensions,
    plotDimensionsFrom, containerDimensionsFrom
} from './app/charts/styling/margins'

export {
    type SvgStyle, initialSvgStyle,
    grabWidth, grabHeight,
    type SvgStrokeStyle,
    STROKE_COLOR, STROKE_WIDTH, STROKE_OPACITY,
    updateSvgStrokeColor, updateSvgStrokeWidth, updateSvgStrokeOpacity, applyStrokeStylesTo,
    type SvgFillStyle,
    updateSvgFillColor, updateSvgFillOpacity, applyFillStylesTo

} from './app/charts/styling/svgStyle'

//
// subscriptions
//

export {
    TimeWindowBehavior,
    subscriptionTimeSeriesFor, subscriptionTimeSeriesWithCadenceFor,
    subscriptionIteratesFor,
    type WindowedOrdinalStats,
    subscriptionOrdinalXFor
} from './app/charts/subscriptions/subscriptions'

//
// tooltips
//

export {
    BarPlotTooltipContent
} from './app/charts/tooltips/BarPlotTooltipContent'

export {
    PoincarePlotTooltipContent
} from './app/charts/tooltips/PoincarePlotTooltipContent'

export {
    RasterPlotTooltipContent
} from './app/charts/tooltips/RasterPlotTooltipContent'

export {
    ScatterPlotTooltipContent
} from './app/charts/tooltips/ScatterPlotTooltipContent'

export {
    Tooltip
} from './app/charts/tooltips/Tooltip'

export {
    type TooltipStyle, defaultTooltipStyle,
    type TooltipDimensions,
    removeTooltip,
    tooltipX, tooltipY,
    categoryTooltipY,
    boundingPoints,
    findPointAndNeighbors
} from './app/charts/tooltips/tooltipUtils'

//
// trackers
//

export {
    type TrackerAxisInfo,
    type TrackerAxisUpdate,
    TrackerLabelLocation,
    Tracker,
} from './app/charts/trackers/Tracker'

export {
    type TrackerLabelFont, defaultTrackerLabelFont,
    type TrackerStyle, defaultTrackerStyle,
    trackerControlInstance,
    removeTrackerControl,
} from './app/charts/trackers/trackerUtils'


//
// legend
//

export {
    Legend,
    defaultLegendStyle,
    LegendLocation,
    type LegendStyle
} from './app/charts/legends/Legend'
