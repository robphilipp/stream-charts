import * as d3 from "d3";
import {NoCurveFactory} from "stream-charts";

export const INTERPOLATIONS = new Map<string, [string, d3.CurveFactory]>([
    ['curveLinear', ['Linear', d3.curveLinear]],
    ['curveNatural', ['Natural', d3.curveNatural]],
    ['curveMonotoneX', ['Monotone', d3.curveMonotoneX]],
    ['curveStep', ['Step', d3.curveStep]],
    ['curveStepAfter', ['Step After', d3.curveStepAfter]],
    ['curveStepBefore', ['Step Before', d3.curveStepBefore]],
    ['curveBumpX', ['Bump', d3.curveBumpX]],
    ['curveNoLine', ['No Line', NoCurveFactory]],
])

/**
 * Returns a d3 curve-factory for generating the interpolations
 * @param name The name of the interpolation
 * @param [defaultFactory=d3.curveLinear] The default curve factory
 * @return A d3 curve-factory for generating the interpolations
 */
export function interpolationFactoryFor(name: string, defaultFactory: d3.CurveFactory = d3.curveLinear): d3.CurveFactory {
    return (INTERPOLATIONS.get(name) || [undefined, defaultFactory])[1]
}
