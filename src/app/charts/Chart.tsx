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

// const defaultAxesStyle = {color: '#d2933f'}
const defaultBackground = '#202020';

interface Props {
    width: number
    height: number
    margin?: Partial<Margin>
    // axisLabelFont?: Partial<AxesLabelFont>
    // axisStyle?: Partial<CSSProperties>
    color?: string
    backgroundColor?: string
    svgStyle?: Partial<SvgStyle>
    seriesStyles?: Map<string, SeriesLineStyle>

    // initial data
    // initialData: Map<string, Series>
    initialData: Array<Series>
    seriesFilter?: RegExp

    // data stream
    seriesObservable?: Observable<ChartData>
    windowingTime?: number
    shouldSubscribe?: boolean
    onSubscribe?: (subscription: Subscription) => void
    onUpdateData?: (seriesName: string, data: Array<Datum>) => void
    onUpdateTime?: (time: number) => void

    // regex filter used to select which series are displayed
    filter?: RegExp

    children: JSX.Element | Array<JSX.Element>;
}

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
            >
                {
                    // the chart elements are the children
                    children
                }
            </ChartProvider>
        </>
    );
}