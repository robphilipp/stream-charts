import * as React from 'react'
import {useEffect, useMemo, useRef} from 'react'
import {Dimensions, Margin, plotDimensionsFrom} from "./margins";
import {initialSvgStyle, SvgStyle} from "./svgStyle";
import {Datum, Series} from "./datumSeries";
import {Observable, Subscription} from "rxjs";
import {ChartData} from "./chartData";
import {GSelection} from "./d3types";
import ChartProvider, {defaultMargin} from "./hooks/useChart";
import * as d3 from "d3";
import {SeriesLineStyle} from "./axes";
import {createPlotContainer} from "./plot";
import {noop} from "./utils";

const defaultBackground = '#202020';

interface Props {
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
     * The base/default color of the chart lines. This can be overriden by the {@link Props.svgStyle} property.
     */
    color?: string
    /**
     * The base/default background color. This can be overriden by the {@link Props.svgStyle} property.
     */
    backgroundColor?: string
    /**
     * Overrides for the SVG style
     */
    svgStyle?: Partial<SvgStyle>
    /**
     * Map holding the series name to the {@link SeriesLineStyle} associated with that series.
     */
    seriesStyles?: Map<string, SeriesLineStyle>

    /*
     | INITIAL DATA
     */
    /**
     * Initial (static) data to plot before subscribing to the {@link ChartData} observable.
     */
    initialData: Array<Series>
    /**
     * Regular expression that filters which series to display on the plot. Can be update while streaming
     */
    seriesFilter?: RegExp

    /*
     | DATA STREAM
     */
    /**
     * {@link ChartData} RxJS `Observable` that feeds the chart data to display (i.e. the data stream).
     */
    seriesObservable?: Observable<ChartData>
    /**
     * The time-window (in milliseconds) to buffer the incoming data before updating the chart. This is
     * a lever to reduce the lag between real-time and chart-time when a large amount of data is being
     * sourced by the observable. Smaller time-window result in smoother scrolling, but more updates, and
     * possibly a larger lag.
     */
    windowingTime?: number
    /**
     * When switching to `true` from `false`, subscribes to the {@link Props.seriesObservable}. When switching
     * to `false` from `true`, unsubscribes from the {@link Props.seriesObservable}.
     */
    shouldSubscribe?: boolean
    /**
     * Callback when the chart subscribes to the {@link ChartData} observable
     * @param subscription The RxJS subscription
     */
    onSubscribe?: (subscription: Subscription) => void
    /**
     * Callback when the time range changes.
     * @param times The times (start, end) times for each axis in the plot
     * @return void
     */
    onUpdateTime?: (times: Map<string, [start: number, end: number]>) => void
    /**
     * Callback function that is called when new data arrives to the chart.
     * @param seriesName The name of the series for which new data arrived
     * @param data The new data that arrived in the windowing tine
     * @see UseChartValues.windowingTime
     */
    onUpdateData?: (seriesName: string, data: Array<Datum>) => void

    /**
     * The child components of the chart (i.e. the axis, plot, tracker, tooltip)
     */
    children: JSX.Element | Array<JSX.Element>;
}

/**
 * The chart container that holds the axes, plot, tracker, and tooltip. The chart manages the
 * subscription, sets up the {@link useChart} hook via the {@link ChartProvider}.
 * @param props The properties of the chart
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
export function Chart(props: Props): JSX.Element {
    const {
        width,
        height,
        color = '#d2933f',
        backgroundColor = defaultBackground,
        seriesStyles = new Map(),
        initialData,
        seriesFilter = /./,
        seriesObservable,
        windowingTime = 100,
        shouldSubscribe = true,

        // onUpdateTime = noop,
        onSubscribe = noop,
        onUpdateTime = noop,
        onUpdateData = noop,

        children,
    } = props

    // override the defaults with the parent's properties, leaving any unset values as the default value
    const margin = {...defaultMargin, ...props.margin}
    const svgStyle = useMemo<SvgStyle>(
        () => ({...initialSvgStyle, ...props.svgStyle, width: props.width, height: props.height}),
        [props.height, props.svgStyle, props.width]
    )

    // id of the chart to avoid dom conflicts when multiple charts are used in the same app
    const chartId = useRef<number>(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER))

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
                    mainGRef.current = createPlotContainer(chartId.current, containerRef.current, plotDimRef.current, color)
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
        [color, backgroundColor, height, svgStyle, width]
    )

    return (
        <>
            <svg ref={containerRef}/>
            <ChartProvider
                chartId={chartId.current}
                container={containerRef.current}
                mainG={mainGRef.current}
                containerDimensions={{width, height}}
                margin={margin}
                color={color}
                seriesStyles={seriesStyles}
                initialData={initialData}
                seriesFilter={seriesFilter}

                seriesObservable={seriesObservable}
                windowingTime={windowingTime}
                shouldSubscribe={shouldSubscribe}

                onSubscribe={onSubscribe}
                onUpdateTime={onUpdateTime}
                onUpdateData={onUpdateData}
            >
                {
                    // the chart elements are the children
                    children
                }
            </ChartProvider>
        </>
    );
}