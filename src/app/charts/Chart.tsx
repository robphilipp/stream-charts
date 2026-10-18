import {type JSX, useMemo} from 'react'
import {type Margin} from "./styling/margins";
import type {SvgStyle} from "./styling/svgStyle";
import type {BaseAxis, SeriesStyle} from "./axes/axes";
import {noop} from "./utils";
import type {BaseSeries} from "./series/baseSeries";
import type {ChartData} from "./observables/ChartData";
import {AxisInterval} from "./axes/AxisInterval";
import type {BaseAxisRange} from "./axes/BaseAxisRange";
import {defaultMargin} from "./hooks/defaultPlotDimensions";
import PlotDimensionsProvider from "./hooks/PlotDimensionsProvider";
import CanvasSurfaceProvider from "./hooks/CanvasSurfaceProvider";
import InteractionProvider from "./hooks/InteractionProvider";
import ChartProvider from "./hooks/ChartProvider";
import AxesProvider from "./hooks/AxesProvider";
import {isSafeRegex} from "./filters/regexFilter";
import type {StreamingDataSource} from "./datasources/StreamingDataSource";
import {ChartDataContext, type ChartDataValues} from "./hooks/useDataSource";

const defaultBackground = '#202020';

/**
 * @param chartId A unique identifier for the chart. This is used to namespace draw-handles registered
 * with the chart's canvas context.
 * @param width The width of the chart container
 * @param height The height of the chart container
 * @param margin The margin between the edges of the chart container and the axes
 * @param color The base/default color of the chart lines. This can be overridden by the {@link ChartProps.svgStyle} property.
 * @param backgroundColor The base/default background color. This can be overridden by the {@link ChartProps.svgStyle} property.
 * @param svgStyle Overrides for the chart container's CSS style
 * @param seriesStyles Map holding the series name to the series style associated with that series.
 * @param seriesFilter Regular expression that filters which series to display on the plot. Can be update while streaming
 * @param dataSource The application-owned {@link StreamingDataSource} that holds (and ingests) the chart's data
 * @param windowingTime The time-window (in milliseconds) to buffer the incoming data before updating the chart. This is
 * a lever to reduce the lag between real-time and chart-time when a large amount of data is being
 * ingested by the data source. Smaller time-windows result in smoother scrolling, but more updates, and
 * possibly a larger lag.
 * @param dataUpdatePeriod The period (ms) at which the data source's generator emits new data, when known
 * @param onUpdateAxesBounds Callback when the time range changes. This is generally used by plots where the
 * x-axis starts to scroll as the data streams in past the end of the current time
 * @param onUpdateChartTime Callback for updating the current chart time. This is generally used by plots
 * whose axes don't represent time (e.g. the Poincaré plot)
 * @template CD refers to the chart-data that is used by the Observable that has the stream of data.
 * @template D refers to the datum in the data-series
 * @template S refers to the type for the series style
 */
export interface Props<CD extends ChartData, D, S extends SeriesStyle> {
    chartId: number
    /**
     * The width of the chart container
     */
    width: number
    /**
     * The height of the chart container
     */
    height: number
    /**
     * The margin between the edges of the chart container and the axes
     */
    margin?: Partial<Margin>
    /**
     * The base/default color of the chart lines. This can be overridden by the {@link ChartProps.svgStyle} property.
     */
    color?: string
    /**
     * The base/default background color. This can be overridden by the {@link ChartProps.svgStyle} property.
     */
    backgroundColor?: string
    /**
     * Overrides for the chart container's CSS style
     */
    svgStyle?: Partial<SvgStyle>
    /**
     * Map holding the series name to the series style associated with that series.
     */
    seriesStyles?: Map<string, S>

    /**
     * Regular expression that filters which series to display on the plot. Can be update while streaming
     */
    seriesFilter?: RegExp

    /*
     | DATA STREAM
     */
    /**
     * The application-owned source of the chart's data (see {@link StreamingDataSource}). The chart
     * and its plots read their series from the data source, and redraw as it ingests new data --
     * they never subscribe to the data stream themselves. The application starts and stops the
     * data source (e.g. Run/Pause), and the data source keeps ingesting while the chart is
     * unmounted (e.g. the user navigated to another page), so the chart picks up where it left
     * off when it remounts.
     */
    dataSource: StreamingDataSource<CD, D>
    /**
     * The time-window (in milliseconds) to buffer the incoming data before updating the chart. This is
     * a lever to reduce the lag between real-time and chart-time when a large amount of data is being
     * ingested by the data source. Smaller time-windows result in smoother scrolling, but more updates, and
     * possibly a larger lag.
     */
    windowingTime?: number
    /**
     * The period (ms) at which the data source's generator emits new data, when known. When
     * provided, buffering switches from wall-clock-based to a fixed tick count derived from
     * `windowingTime / dataUpdatePeriod`, avoiding a jittery scroll that can otherwise result once
     * the axis auto-scrolls (see the view drivers in `subscriptions/viewDrivers.ts`).
     */
    dataUpdatePeriod?: number
    /**
     * Callback when the time range changes. This is generally used by plots where the
     * x-axis starts to scroll as the data streams in past the end of the current time
     * window.
     * @param ranges A function that accepts the ranges, (start, end) associated with
     * each axis in the plot. The ranges argument is a map(axis_id -> (start, end)).
     * Where start and end refer to the range for the axis.
     */
    onUpdateAxesBounds?: (ranges: Map<string, AxisInterval>) => void
    /**
     * Callback for updating the current chart time. This is generally used by plots
     * where the axes do not represent time, but rather some fix values, and the data
     * hold time information
     * @param time The current chart time
     */
    onUpdateChartTime?: (time: number) => void

    /**
     * The child components of the chart (i.e. the axis, plot, tracker, tooltip)
     */
    children: JSX.Element | Array<JSX.Element>;
}

/**
 * The chart container that holds the axes, plot, tracker, and tooltip. The chart reads its data
 * from the application-owned data source (its `dataSource` prop), and sets up the
 * {@link useChart} hook via the {@link ChartProvider}.
 *
 * Internally, the chart is backed by a single `<canvas>` element rather than an SVG element tree.
 * The canvas itself is created and sized by {@link CanvasSurfaceProvider}, which derives its size
 * from {@link usePlotDimensions} (the single source of truth for the chart's dimensions) rather
 * than from this component's `width`/`height` props directly -- this keeps the canvas correctly
 * sized even if dimensions are ever updated via `usePlotDimensions().updateDimensions(...)`
 * independent of a prop change. Axes, plots, and the tracker don't create/mutate their own DOM
 * nodes -- they register a draw function with the {@link CanvasContext} (exposed via
 * `useChart().canvasContext`, itself sourced from {@link CanvasSurfaceProvider} via
 * `useCanvasSurface()`), and the canvas context clears and repaints all registered draw functions
 * whenever a redraw is requested.
 * @param props The properties of the chart
 * @return The chart, with its children inside the chart's context providers
 * @template CD Chart data
 * @template D The type of the datum type held in a series
 * @template S The type of the series style
 * @template TM The type of the tooltip metadata (the data about the series). If not specified,
 * defaults to an empty object
 * @example
 *

<Chart
    width={useGridCellWidth()}
    height={useGridCellHeight()}
    margin={{...defaultMargin, top: 60, right: 75, left: 70}}
    color={theme.color}
    backgroundColor={theme.backgroundColor}
    seriesStyles={new Map([
        ['neuron1', {
            ...defaultLineStyle(),
            color: 'orange',
            lineWidth: 2,
            highlightColor: 'orange'
        }],
        ['neuron6', {
            ...defaultLineStyle(),
            color: theme.name === 'light' ? 'blue' : 'gray',
            lineWidth: 3,
            highlightColor: theme.name === 'light' ? 'blue' : 'gray',
            highlightWidth: 5
        }],
    ])}
    dataSource={dataSource}
    seriesFilter={filter}
    onUpdateAxesBounds={handleChartTimeUpdate}
    windowingTime={150}
>
    <ContinuousAxis
        axisId="x-axis-1"
        location={AxisLocation.Bottom}
        domain={[0, 5000]}
        label="t (ms)"
    />
    <OrdinalAxis
        axisId="y-axis-1"
        location={AxisLocation.Left}
        categories={dataSource.seriesList().map(series => series.name)}
        label="neuron"
    />
    <OrdinalAxis
        axisId="y-axis-2"
        location={AxisLocation.Right}
        categories={dataSource.seriesList().map(series => series.name)}
        label="neuron"
    />
    <Tracker
        visible={visibility.tracker}
        labelLocation={TrackerLabelLocation.WithMouse}
        style={{color: theme.color}}
        font={{color: theme.color}}
    />
    <Tooltip
        visible={visibility.tooltip}
        style={{
            fontColor: theme.color,
            backgroundColor: theme.backgroundColor,
            borderColor: theme.color,
            backgroundOpacity: 0.9,
        }}
    >
        <RasterPlotTooltipContent
            xFormatter={value => formatNumber(value, " ,.0f") + ' ms'}
            yFormatter={value => formatNumber(value, " ,.1f") + ' mV'}
        />
    </Tooltip>
    <RasterPlot
        spikeMargin={1}
        panEnabled={true}
        zoomEnabled={true}
        zoomKeyModifiersRequired={true}
    />
</Chart>
*/
// the defaults (constants, so that their identity doesn't change from one render to the next)
const NO_SERIES_STYLES = new Map<string, SeriesStyle>()
const MATCH_EVERYTHING = /./

export function Chart<CD extends ChartData, D, S extends SeriesStyle, TM, AR extends BaseAxisRange, A extends BaseAxis>(props: Props<CD, D, S>): JSX.Element {
    const {
        chartId,

        width,
        height,
        color = '#d2933f',
        backgroundColor = defaultBackground,
        seriesStyles = NO_SERIES_STYLES as Map<string, S>,
        seriesFilter = MATCH_EVERYTHING,
        dataSource,
        windowingTime = 100,
        dataUpdatePeriod,

        onUpdateAxesBounds = noop,
        onUpdateChartTime = noop,

        children,
    } = props

    // the series the data source held when it was handed to the chart. Memoized on the data source
    // ALONE: a new data source means new initial data, and the plots reset themselves when the
    // initial data changes -- so it must not change when anything else does (e.g. a new
    // `onUpdateChartTime` callback on every render of the chart's parent, which would otherwise
    // reset the plots on every render)
    const initialData = useMemo<Array<BaseSeries<D>>>(() => dataSource.seriesList(), [dataSource])

    // the chart's data: the data source, its initial data, and the streaming settings
    const chartData = useMemo<ChartDataValues<CD, D, BaseSeries<D>>>(
        () => ({
            dataSource: dataSource as StreamingDataSource<CD, D, BaseSeries<D>>,
            initialData,
            windowingTime,
            dataUpdatePeriod,
            onUpdateChartTime
        }),
        [dataSource, initialData, windowingTime, dataUpdatePeriod, onUpdateChartTime]
    )

    // override the defaults with the parent's properties, leaving any unset values as the default
    // value (memoized on the margin's values, so that a new `margin` object with the same values
    // doesn't change the plot dimensions' context)
    const {top, bottom, left, right} = {...defaultMargin, ...props.margin}
    const margin = useMemo<Margin>(() => ({top, bottom, left, right}), [top, bottom, left, right])
    const containerDimensions = useMemo(() => ({width, height}), [width, height])

    // `seriesFilter` is tested against every series name on every redraw frame by each plot
    // component (not just once), so an unvetted pattern -- e.g. one built directly from
    // free-text user input without going through the `regexFilter` helper, which already screens
    // for this -- could freeze the whole render loop with catastrophic backtracking. This is the
    // one place every `seriesFilter`, however it was constructed, necessarily passes through
    // before reaching a plot, so it's checked here too, falling back to the safe match-everything
    // default rather than ever handing plots something that could hang them.
    const safeSeriesFilter = useMemo<RegExp>(
        () => {
            if (isSafeRegex(seriesFilter)) return seriesFilter
            console.warn(
                `seriesFilter regex risks catastrophic backtracking and was ignored; ` +
                `falling back to the default (match-everything) filter; pattern: ${seriesFilter}`
            )
            return MATCH_EVERYTHING
        },
        [seriesFilter]
    )

    return (
        <PlotDimensionsProvider containerDimensions={containerDimensions} margin={margin}>
            <CanvasSurfaceProvider chartId={chartId} color={color} backgroundColor={backgroundColor} svgStyle={props.svgStyle}>
                <AxesProvider onUpdateAxesInterval={onUpdateAxesBounds}>
                    <InteractionProvider<D, TM>>
                        <ChartDataContext.Provider value={chartData}>
                            <ChartProvider<S, AR, A>
                                chartId={chartId}
                                color={color}
                                backgroundColor={backgroundColor}
                                seriesStyles={seriesStyles}
                                seriesFilter={safeSeriesFilter}
                            >
                                {
                                    // the chart elements are the children
                                    children
                                }
                            </ChartProvider>
                        </ChartDataContext.Provider>
                    </InteractionProvider>
                </AxesProvider>
            </CanvasSurfaceProvider>
        </PlotDimensionsProvider>
    );
}
