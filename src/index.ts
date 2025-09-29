export {Chart} from './app/charts/Chart'

export {
    AxisElementSelection,
    SvgSelection,
    GSelection,
    LineSelection,
    TextSelection,
    RadialMagnifierSelection,
    BarMagnifierSelection,
    MagnifierTextSelection,
    TrackerSelection
} from './app/charts/d3types'

export {
    noop,
    mouseInPlotAreaFor,
    textWidthOf, textHeightOf,
    textWidthFor,
    textDimensions,
    Zoom,
    handleZoom,
    formatNumber, formatTime, formatValue, formatChange, formatTimeChange, formatValueChange,
    minMaxOf, minMaxYFor
} from './app/charts/utils'

//
// axes
//

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
    iterateSeriesFromTuples,
} from './app/charts/series/iterateSeries'

export {
    OrdinalDatum, emptyOrdinalDatum, copyOrdinalDatum, ordinalDatumOf, nonEmptyOrdinalDatum,
    type OrdinalSeries,
    ordinateSeriesFromTuples,
    initialOrdinalChartData,
} from './app/charts/series/ordinalSeries'

export {
    Datum,
    datumOf,
    emptyDatum,
    type TimeSeries,
    timeSeriesFromTuples,
    PixelDatum
} from './app/charts/series/timeSeries'

export {
    TimeSeriesChartData,
    emptyTimeSeriesChartData,
    initialTimeSeriesChartData,
} from './app/charts/series/timeSeriesChartData'

//
// styling
//

export {
    BarSeriesStyle, BarStyle, LineStyle,
    defaultBarSeriesStyle,
    defaultMinMaxBarStyle, defaultWindowedMinMaxBarStyle, defaultWindowedMeanValueLineStyle,
    defaultValueLineStyle, defaultMeanValueLineStyle
} from './app/charts/styling/barPlotStyle'

export {
    Margin,
    noMargins,
    Dimensions,
    plotDimensionsFrom, containerDimensionsFrom
} from './app/charts/styling/margins'

export {
    SvgStyle, initialSvgStyle,
    grabWidth, grabHeight,
    SvgStrokeStyle,
    STROKE_COLOR, STROKE_WIDTH, STROKE_OPACITY,
    updateSvgStrokeColor, updateSvgStrokeWidth, updateSvgStrokeOpacity, applyStrokeStylesTo,
    SvgFillStyle,
    updateSvgFillColor, updateSvgFillOpacity, applyFillStylesTo

} from './app/charts/styling/svgStyle'

//
// subscriptions
//

export {
    TimeWindowBehavior,
    subscriptionTimeSeriesFor, subscriptionTimeSeriesWithCadenceFor,
    subscriptionIteratesFor,
    WindowedOrdinalStats, defaultWindowedOrdinalStats,
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
    TooltipStyle, defaultTooltipStyle,
    TooltipDimensions,
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
    TrackerAxisInfo,
    TrackerAxisUpdate,
    TrackerLabelLocation,
    Tracker,
} from './app/charts/trackers/Tracker'

export {
    TrackerLabelFont, defaultTrackerLabelFont,
    TrackerStyle, defaultTrackerStyle,
    trackerControlInstance,
    removeTrackerControl,
} from './app/charts/trackers/trackerUtils'
