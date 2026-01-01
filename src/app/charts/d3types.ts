// the axis-element type return when calling the ".call(axis)" function
import {Selection} from "d3";
import {Datum} from "./series/timeSeries";

export type AxisElementSelection = Selection<SVGGElement, unknown, null, undefined>
export type SvgSelection = Selection<SVGSVGElement, any, null, undefined>
export type GSelection = Selection<SVGGElement, any, null, undefined>
export type LineSelection = Selection<SVGLineElement, any, SVGGElement, undefined>
export type TextSelection = Selection<SVGTextElement, any, null, undefined>

export type RadialMagnifierSelection = Selection<SVGCircleElement, Datum, null, undefined>
export type BarMagnifierSelection = Selection<SVGRectElement, Datum, null, undefined>;
export type MagnifierTextSelection = Selection<SVGTextElement, any, SVGGElement, undefined>

export type TrackerSelection = Selection<SVGLineElement, Datum, null, undefined>

