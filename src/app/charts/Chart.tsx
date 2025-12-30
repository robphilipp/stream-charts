import {JSX, useEffect, useMemo, useRef} from 'react'
import {Dimensions, Margin, plotDimensionsFrom} from "./styling/margins";
import {initialSvgStyle, SvgStyle} from "./styling/svgStyle";
import {GSelection} from "./d3types";
import ChartProvider from "./hooks/useChart";
import PlotDimensionsProvider, {defaultMargin} from "./hooks/usePlotDimensions";
import * as d3 from "d3";
import {SeriesStyle} from "./axes/axes";
import {createPlotContainer} from "./plots/plot";
import {noop} from "./utils";
import AxesProvider from "./hooks/useAxes";
import MouseProvider from "./hooks/useMouse";
import TooltipProvider from "./hooks/useTooltip";
import {Observable, Subscription} from "rxjs";
import DataObservableProvider from './hooks/useDataObservable';
import {BaseSeries} from "./series/baseSeries";
import InitialDataProvider from "./hooks/useInitialData";
import {ChartData} from "./observables/ChartData";
import {AxisInterval} from "./axes/AxisInterval";

const defaultBackground = '#202020';

/**
 * @template CD refers to the chart-data that is used by the Observable that has the stream of data.
 * @template D refers to the datum in the data-series
 * @template S refers to the type for the series style
 */
interface Props<CD, D, S extends SeriesStyle> {
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
     * The base/default color of the chart lines. This can be overridden by the {@link Props.svgStyle} property.
     */
    color?: string
    /**
     * The base/default background color. This can be overridden by the {@link Props.svgStyle} property.
     */
    backgroundColor?: string
    /**
     * Overrides for the SVG style
     */
    svgStyle?: Partial<SvgStyle>
    /**
     * Map holding the series name to the series style associated with that series.
     */
    seriesStyles?: Map<string, S>

    /*
     | INITIAL DATA
     */
    /**
     * Initial (static) data to plot before subscribing to the {@link TimeSeriesChartData} observable.
     */
    initialData: Array<BaseSeries<D>>
    /**
     * Optional conversion function that converts an array of base-series with datum type D to a
     * descendent of a {@link ChartData} object
     * @param initialData The initial array of series
     */
    asChartData?: (initialData: Array<BaseSeries<D>>) => CD
    /**
     * Regular expression that filters which series to display on the plot. Can be update while streaming
     */
    seriesFilter?: RegExp

    /*
     | DATA STREAM
     */
    /**
     * {@link TimeSeriesChartData} RxJS `Observable` that feeds the chart data to display (i.e. the data stream).
     */
    seriesObservable?: Observable<CD>
    /**
     * The time-window (in milliseconds) to buffer the incoming data before updating the chart. This is
     * a lever to reduce the lag between real-time and chart-time when a large amount of data is being
     * sourced by the observable. Smaller time-windows result in smoother scrolling, but more updates, and
     * possibly a larger lag.
     */
    windowingTime?: number
    /**
     * When switching to `true` from `false`, subscribes to the {@link seriesObservable}. When switching
     * to `false` from `true`, unsubscribes from the {@link seriesObservable}.
     */
    shouldSubscribe?: boolean
    /**
     * Callback when the chart subscribes to the {@link TimeSeriesChartData} observable
     * @param subscription The RxJS subscription
     */
    onSubscribe?: (subscription: Subscription) => void
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
     * Callback function that is called when new data arrives to the chart.
     * @param seriesName The name of the series for which new data arrived
     * @param data The new data that arrived in the windowing tine
     * @see UseChartValues.windowingTime
     */
    onUpdateData?: (seriesName: string, data: Array<D>) => void

    /**
     * The child components of the chart (i.e. the axis, plot, tracker, tooltip)
     */
    children: JSX.Element | Array<JSX.Element>;
}

/**
 * The chart container that holds the axes, plot, tracker, and tooltip. The chart manages the
 * subscription, sets up the {@link useChart} hook via the {@link ChartProvider}.
 * @param props The properties of the chart
 * @template CD Chart data
 * @template D The type of the datum type held in a series
 * @template S The type of the series style
 * @template TM The type of the tooltip metadata (the data about the series). If not specified,
 * defaults to an empty object
 * @constructor
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
            ...defaultLineStyle,
            color: 'orange',
            lineWidth: 2,
            highlightColor: 'orange'
        }],
        ['neuron6', {
            ...defaultLineStyle,
            color: theme.name === 'light' ? 'blue' : 'gray',
            lineWidth: 3,
            highlightColor: theme.name === 'light' ? 'blue' : 'gray',
            highlightWidth: 5
        }],
    ])}
    initialData={initialDataRef.current}
    seriesFilter={filter}
    seriesObservable={observableRef.current}
    shouldSubscribe={running}
    onUpdateTime={handleChartTimeUpdate}
    windowingTime={150}
>
    <ContinuousAxis
        axisId="x-axis-1"
        location={AxisLocation.Bottom}
        domain={[0, 5000]}
        label="t (ms)"
    />
    <CategoryAxis
        axisId="y-axis-1"
        location={AxisLocation.Left}
        categories={initialDataRef.current.map(series => series.name)}
        label="neuron"
    />
    <CategoryAxis
        axisId="y-axis-2"
        location={AxisLocation.Right}
        categories={initialDataRef.current.map(series => series.name)}
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
        dropDataAfter={5000}
        panEnabled={true}
        zoomEnabled={true}
        zoomKeyModifiersRequired={true}
    />
</Chart>
*/
export function Chart<CD extends ChartData, D, S extends SeriesStyle, TM>(props: Props<CD, D, S>): JSX.Element {
    const {
        chartId,

        width,
        height,
        color = '#d2933f',
        backgroundColor = defaultBackground,
        seriesStyles = new Map(),
        initialData,
        asChartData,
        seriesFilter = /./,
        seriesObservable,
        windowingTime = 100,
        shouldSubscribe = true,

        onSubscribe = noop,
        onUpdateAxesBounds = noop,
        onUpdateChartTime = noop,
        onUpdateData = noop,

        children,
    } = props

    // override the defaults with the parent's properties, leaving any unset values as the default value
    const margin = {...defaultMargin, ...props.margin}
    const svgStyle = useMemo<SvgStyle>(
        () => ({...initialSvgStyle, ...props.svgStyle, width: props.width, height: props.height}),
        [props.height, props.svgStyle, props.width]
    )

    // hold a reference to the current width and the plot dimensions
    const plotDimRef = useRef<Dimensions>(plotDimensionsFrom(width, height, margin))

    // the container that holds the d3 svg element
    const mainGRef = useRef<GSelection | null>(null)
    const containerRef = useRef<SVGSVGElement>(null)

    // creates the main <g> element for the chart if it doesn't already exist, otherwise
    // updates the svg element with the updated dimensions or style properties
    useEffect(
        () => {
            if (containerRef.current) {
                // create the main SVG element if it doesn't already exist
                if (!mainGRef.current) {
                    mainGRef.current = createPlotContainer(chartId, containerRef.current, plotDimRef.current, color)
                }

                // build up the svg style from the defaults and any svg style object
                // passed in as properties
                const style = Object.getOwnPropertyNames(svgStyle)
                    .map(name => `${name}: ${svgStyle[name]}; `)
                    .join("")

                // when the chart "backgroundColor" property is set (i.e. not the default value),
                // then we need add it to the styles, overwriting any color that may have been
                // set in the svg style object
                const background = backgroundColor !== defaultBackground ?
                    `background-color: ${backgroundColor}; ` :
                    ''

                // update the dimension and style
                d3.select<SVGSVGElement, any>(containerRef.current)
                    .attr('width', width)
                    .attr('height', height)
                    .attr('style', style + background + ` color: ${color}`)
            }
        },
        [color, backgroundColor, height, svgStyle, width, chartId]
    )

    return (
        <>
            <svg ref={containerRef}/>
            <PlotDimensionsProvider containerDimensions={{width, height}} margin={margin}>
                <AxesProvider onUpdateAxesInterval={onUpdateAxesBounds}>
                    <MouseProvider<D, TM>>
                        <TooltipProvider<D, TM>>
                            <InitialDataProvider<CD, D>
                                initialData={initialData}
                                asChartData={asChartData}
                            >
                                <DataObservableProvider<CD, D>
                                    seriesObservable={seriesObservable}
                                    windowingTime={windowingTime}
                                    shouldSubscribe={shouldSubscribe}

                                    onSubscribe={onSubscribe}
                                    onUpdateData={onUpdateData}
                                    onUpdateChartTime={onUpdateChartTime}
                                >
                                    <ChartProvider
                                        chartId={chartId}
                                        container={containerRef.current}
                                        mainG={mainGRef.current}

                                        color={color}
                                        backgroundColor={backgroundColor}
                                        svgStyle={svgStyle}
                                        seriesStyles={seriesStyles}
                                        seriesFilter={seriesFilter}
                                    >
                                        {
                                            // the chart elements are the children
                                            children
                                        }
                                    </ChartProvider>
                                </DataObservableProvider>
                            </InitialDataProvider>
                        </TooltipProvider>
                    </MouseProvider>
                </AxesProvider>
            </PlotDimensionsProvider>
        </>
    );
}