import {scaleBand, scaleLinear} from "d3";
import {
    addContinuousNumericXAxis,
    addContinuousNumericYAxis,
    addEmptyXAxis,
    addEmptyYAxis,
    addOrdinalStringAxis,
    axesForSeriesGen,
    axesZoomHandler,
    AxisLocation,
    AxisType,
    calculateConstrainedZoomFor,
    calculateOrdinalConstrainedZoomFor,
    calculateOrdinalPanFor,
    calculatePanFor,
    type ContinuousNumericAxis,
    continuousAxisIntervals,
    continuousAxisRanges,
    continuousAxisZoomHandler,
    continuousRange,
    defaultAxesFont,
    defaultAxisTickStyle,
    defaultLineStyle,
    ordinalAxisIntervals,
    ordinalAxisRanges,
    ordinalAxisZoomHandler,
    ordinalPanHandler,
    ordinalRange,
    type OrdinalStringAxis,
    panHandler,
    panHandler2D,
    removeContinuousXAxis,
    removeContinuousYAxis,
    removeOrdinalXAxis,
    removeOrdinalYAxis,
} from "./axes";
import {AxesState} from "./AxesState";
import {ContinuousAxisRange} from "./ContinuousAxisRange";
import {OrdinalAxisRange} from "./OrdinalAxisRange";
import {AxisInterval} from "./AxisInterval";
import type {Dimensions, Margin} from "../styling/margins";
import type {CanvasContext} from "../d3types";
import {seriesFrom} from "../series/baseSeries";
import type {AxesAssignment} from "../plots/plot";

/**
 * These tests guard against a regression of a bug where the ordinal (categorical) axis pan/zoom
 * math hard-coded `plotDimensions.width` regardless of the axis's location, silently using the
 * wrong pixel extent for a left/right-located (y) axis, which should use `plotDimensions.height`.
 */
describe('ordinal axis pan/zoom pixel-extent selection by location', () => {
    const plotDimensions: Dimensions = {width: 500, height: 200}
    const margin: Margin = {top: 0, right: 0, bottom: 0, left: 0}

    function fakeOrdinalAxis(location: AxisLocation): OrdinalStringAxis {
        return {
            axisId: 'axis-1',
            location,
            axisType: AxisType.OrdinalString,
            scale: scaleBand<string>(),
            categorySize: 10,
            update: () => 10,
            updateFont: () => {
            },
            setHighlighted: () => {
            },
        }
    }

    describe('calculateOrdinalPanFor', () => {
        // this range has already reached the plot's height (200) but not yet its width (500) --
        // so whether the pan below is allowed depends entirely on which extent is used
        const range = OrdinalAxisRange.from(-100, 220, -100, 220)

        it('blocks the pan for a bottom-located (x) axis because the range has not yet reached the plot width', () => {
            const panned = calculateOrdinalPanFor(10, range, plotDimensions, AxisLocation.Bottom)
            expect(panned.current.start).toBe(range.current.start)
            expect(panned.current.end).toBe(range.current.end)
        })

        it('allows the same pan for a left-located (y) axis because the range already covers the plot height', () => {
            const panned = calculateOrdinalPanFor(10, range, plotDimensions, AxisLocation.Left)
            expect(panned.current.start).toBe(range.current.start + 10)
            expect(panned.current.end).toBe(range.current.end + 10)
        })
    })

    describe('ordinalAxisZoomHandler', () => {
        function zoomAndCaptureOriginalRange(location: AxisLocation): { start: number, end: number } {
            const axis = fakeOrdinalAxis(location)
            const axesState = AxesState.from<OrdinalStringAxis>(new Map([['axis-1', axis]]))
            const ranges = new Map<string, OrdinalAxisRange>([
                ['axis-1', OrdinalAxisRange.from(0, 100, 0, 100)],
            ])
            let capturedOriginalRange: { start: number, end: number } | undefined
            const setOriginalRangeFor = (_axisId: string, range: { start: number, end: number }) => {
                capturedOriginalRange = range
            }
            const handler = ordinalAxisZoomHandler(['axis-1'], margin, () => {
            }, setOriginalRangeFor, axesState, [0, Infinity])
            handler(1.5, 50, plotDimensions, ranges)
            expect(capturedOriginalRange).toBeDefined()
            return capturedOriginalRange as { start: number, end: number }
        }

        it("uses the plot's width for a bottom-located (x) axis original range", () => {
            const originalRange = zoomAndCaptureOriginalRange(AxisLocation.Bottom)
            expect(originalRange.end).toBe(plotDimensions.width)
        })

        it("uses the plot's height, not the width, for a left-located (y) axis original range", () => {
            const originalRange = zoomAndCaptureOriginalRange(AxisLocation.Left)
            expect(originalRange.end).toBe(plotDimensions.height)
        })
    })
})

describe('default style factories', () => {
    it('defaultAxesFont returns the expected default font', () => {
        expect(defaultAxesFont()).toEqual({size: 12, color: '#d2933f', weight: 300, family: 'sans-serif'})
    })

    it('defaultAxisTickStyle returns no rotation/auto-rotation, using the default font', () => {
        const style = defaultAxisTickStyle()
        expect(style.rotation).toBe(0)
        expect(style.useAutoRotation).toBe(false)
        expect(style.font).toEqual(defaultAxesFont())
    })

    it('defaultLineStyle returns the expected default line style', () => {
        expect(defaultLineStyle()).toEqual({
            color: '#008aad', lineWidth: 1, highlightColor: '#008aad', highlightWidth: 3,
        })
    })
})

/**
 * A minimal structural fake `CanvasContext` -- just enough surface for the axis-creation
 * functions to touch (`register`/`unregister`/`requestRedraw`, as spies). None of them ever
 * invoke the registered `draw` function directly (only `register` it), so `canvas`/`context2D`
 * are never actually touched and can stay empty stubs.
 */
function fakeCanvasContext(chartId: number = 1): CanvasContext {
    return {
        chartId,
        canvas: {} as HTMLCanvasElement,
        context2D: {} as CanvasRenderingContext2D,
        dpr: 1,
        register: jest.fn(),
        unregister: jest.fn(),
        requestRedraw: jest.fn(),
    } as unknown as CanvasContext
}

describe('axis creation', () => {
    const plotDimensions: Dimensions = {width: 500, height: 300}
    const margin: Margin = {top: 10, right: 10, bottom: 10, left: 10}
    const font = defaultAxesFont()
    const tickStyle = defaultAxisTickStyle()

    describe('addOrdinalStringAxis', () => {
        it('dispatches to the x-axis variant for a Bottom/Top location', () => {
            const cc = fakeCanvasContext()
            const axis = addOrdinalStringAxis(
                cc, 'x-1', AxisLocation.Bottom, ['a', 'b', 'c'], 'label', font, tickStyle,
                plotDimensions, margin, jest.fn(), jest.fn()
            )
            expect(axis.axisId).toBe('x-1')
            expect(axis.location).toBe(AxisLocation.Bottom)
            expect(axis.axisType).toBe(AxisType.OrdinalString)
            expect(axis.scale.domain()).toEqual(['a', 'b', 'c'])
            expect(cc.register).toHaveBeenCalledTimes(1)
        })

        it('dispatches to the y-axis variant for a Left/Right location', () => {
            const cc = fakeCanvasContext()
            const axis = addOrdinalStringAxis(
                cc, 'y-1', AxisLocation.Left, ['a', 'b'], 'label', font, tickStyle,
                plotDimensions, margin, jest.fn(), jest.fn()
            )
            expect(axis.location).toBe(AxisLocation.Left)
        })

        it('update() reports the new range/original range and requests a redraw', () => {
            const cc = fakeCanvasContext()
            const setRangeFor = jest.fn()
            const setOriginalRangeFor = jest.fn()
            const axis = addOrdinalStringAxis(
                cc, 'x-1', AxisLocation.Bottom, ['a', 'b'], 'label', font, tickStyle,
                plotDimensions, margin, setRangeFor, setOriginalRangeFor
            )
            const categorySize = axis.update(
                ['a', 'b'], AxisInterval.from(0, 500), AxisInterval.from(0, 500), plotDimensions, margin
            )
            expect(typeof categorySize).toBe('number')
            expect(setRangeFor).toHaveBeenCalledWith('x-1', expect.anything())
            expect(setOriginalRangeFor).toHaveBeenCalledWith('x-1', expect.anything())
            expect(cc.requestRedraw).toHaveBeenCalled()
        })

        // guards against a regression: OrdinalAxis.tsx used to be unable to change the category
        // count after the axis was first created, because `update()` had no way to pass a new
        // category list through to the scale -- it always re-applied whatever categories the axis
        // was originally created with, via a closure, no matter how many times the caller's own
        // `categories` prop changed. `update()` now takes categories as its first argument.
        it('update() replaces the scale\'s domain with the given categories, changing the category count', () => {
            const cc = fakeCanvasContext()
            const axis = addOrdinalStringAxis(
                cc, 'x-1', AxisLocation.Bottom, ['a', 'b', 'c'], 'label', font, tickStyle,
                plotDimensions, margin, jest.fn(), jest.fn()
            )
            expect(axis.scale.domain()).toEqual(['a', 'b', 'c'])

            axis.update(
                ['a', 'b', 'c', 'd', 'e'], AxisInterval.from(0, 500), AxisInterval.from(0, 500), plotDimensions, margin
            )

            expect(axis.scale.domain()).toEqual(['a', 'b', 'c', 'd', 'e'])
        })

        it('setHighlighted and updateFont each request a redraw', () => {
            const cc = fakeCanvasContext()
            const axis = addOrdinalStringAxis(
                cc, 'x-1', AxisLocation.Bottom, ['a'], 'label', font, tickStyle,
                plotDimensions, margin, jest.fn(), jest.fn()
            )
            axis.setHighlighted(true)
            axis.updateFont(font)
            expect(cc.requestRedraw).toHaveBeenCalledTimes(2)
        })
    })

    describe('addEmptyXAxis/addEmptyYAxis', () => {
        it('creates an empty, continuous-numeric x-axis', () => {
            const cc = fakeCanvasContext()
            const axis = addEmptyXAxis(cc, 'x-1', plotDimensions, AxisLocation.Bottom, scaleLinear(), margin, jest.fn(), 'red')
            expect(axis.axisId).toBe('x-1')
            expect(axis.axisType).toBe(AxisType.ContinuousNumeric)
            expect(axis.isEmpty).toBe(true)
            expect(cc.register).toHaveBeenCalledTimes(1)
        })

        it('creates an empty, continuous-numeric y-axis', () => {
            const cc = fakeCanvasContext()
            const axis = addEmptyYAxis(cc, 'y-1', plotDimensions, AxisLocation.Left, scaleLinear(), margin, jest.fn(), 'red')
            expect(axis.isEmpty).toBe(true)
            expect(axis.location).toBe(AxisLocation.Left)
        })

        it('update() reports the new range and requests a redraw', () => {
            const cc = fakeCanvasContext()
            const setRangeFor = jest.fn()
            const axis = addEmptyXAxis(cc, 'x-1', plotDimensions, AxisLocation.Bottom, scaleLinear(), margin, setRangeFor, 'red')
            axis.update(AxisInterval.from(0, 10), plotDimensions, margin)
            expect(setRangeFor).toHaveBeenCalledWith('x-1', expect.anything())
            expect(cc.requestRedraw).toHaveBeenCalled()
        })
    })

    describe('addContinuousNumericXAxis/addContinuousNumericYAxis', () => {
        it('creates a continuous-numeric x-axis with the given domain', () => {
            const cc = fakeCanvasContext()
            const axis = addContinuousNumericXAxis(
                cc, 'x-1', plotDimensions, AxisLocation.Bottom, scaleLinear(), [0, 100], font, margin, 'label', jest.fn()
            )
            expect(axis.axisType).toBe(AxisType.ContinuousNumeric)
            expect(axis.scale.domain()).toEqual([0, 100])
            expect(axis.isEmpty).toBeUndefined()
        })

        it('creates a continuous-numeric y-axis with the given domain', () => {
            const cc = fakeCanvasContext()
            const axis = addContinuousNumericYAxis(
                cc, 'y-1', plotDimensions, AxisLocation.Left, scaleLinear(), [0, 100], font, margin, 'label', jest.fn()
            )
            expect(axis.location).toBe(AxisLocation.Left)
            expect(axis.scale.domain()).toEqual([0, 100])
        })

        it('update() reports the new range and requests a redraw', () => {
            const cc = fakeCanvasContext()
            const setRangeFor = jest.fn()
            const axis = addContinuousNumericXAxis(
                cc, 'x-1', plotDimensions, AxisLocation.Bottom, scaleLinear(), [0, 100], font, margin, 'label', setRangeFor
            )
            axis.update(AxisInterval.from(0, 50), plotDimensions, margin)
            expect(setRangeFor).toHaveBeenCalledWith('x-1', expect.anything())
            expect(cc.requestRedraw).toHaveBeenCalled()
        })
    })
})

describe('axis removal', () => {
    const plotDimensions: Dimensions = {width: 500, height: 300}
    const margin: Margin = {top: 10, right: 10, bottom: 10, left: 10}
    const font = defaultAxesFont()
    const tickStyle = defaultAxisTickStyle()

    it('removeOrdinalXAxis unregisters the same handle addOrdinalStringAxis (x) registered', () => {
        const cc = fakeCanvasContext()
        addOrdinalStringAxis(cc, 'x-1', AxisLocation.Bottom, ['a'], 'l', font, tickStyle, plotDimensions, margin, jest.fn(), jest.fn())
        const registeredHandle = (cc.register as jest.Mock).mock.calls[0][0]
        removeOrdinalXAxis(cc, 'x-1')
        expect(cc.unregister).toHaveBeenCalledWith(registeredHandle)
    })

    it('removeOrdinalYAxis unregisters the same handle addOrdinalStringAxis (y) registered', () => {
        const cc = fakeCanvasContext()
        addOrdinalStringAxis(cc, 'y-1', AxisLocation.Left, ['a'], 'l', font, tickStyle, plotDimensions, margin, jest.fn(), jest.fn())
        const registeredHandle = (cc.register as jest.Mock).mock.calls[0][0]
        removeOrdinalYAxis(cc, 'y-1')
        expect(cc.unregister).toHaveBeenCalledWith(registeredHandle)
    })

    it('removeContinuousXAxis unregisters the same handle addContinuousNumericXAxis registered', () => {
        const cc = fakeCanvasContext()
        addContinuousNumericXAxis(cc, 'x-1', plotDimensions, AxisLocation.Bottom, scaleLinear(), [0, 100], font, margin, 'l', jest.fn())
        const registeredHandle = (cc.register as jest.Mock).mock.calls[0][0]
        removeContinuousXAxis(cc, 'x-1')
        expect(cc.unregister).toHaveBeenCalledWith(registeredHandle)
    })

    it('removeContinuousYAxis unregisters the same handle addContinuousNumericYAxis registered', () => {
        const cc = fakeCanvasContext()
        addContinuousNumericYAxis(cc, 'y-1', plotDimensions, AxisLocation.Left, scaleLinear(), [0, 100], font, margin, 'l', jest.fn())
        const registeredHandle = (cc.register as jest.Mock).mock.calls[0][0]
        removeContinuousYAxis(cc, 'y-1')
        expect(cc.unregister).toHaveBeenCalledWith(registeredHandle)
    })

    // NOT a regression guard -- this documents a real, currently-existing bug found while writing
    // this suite, flagged separately rather than fixed here: addEmptyXAxis/addEmptyYAxis register
    // their draw function under a "*-empty-*" handle (`x-axis-empty-${chartId}-${axisId}`), but
    // `EmptyAxis.tsx` cleans up by calling removeContinuousXAxis/removeContinuousYAxis, which
    // unregisters the *different* `x-axis-${chartId}-${axisId}` handle -- so an empty axis's draw
    // function is never actually removed from the canvas context on unmount. This test pins down
    // the mismatch rather than papering over it; it should start failing (in a good way) once fixed.
    it('[KNOWN BUG] removeContinuousXAxis does NOT match the handle addEmptyXAxis registered', () => {
        const cc = fakeCanvasContext()
        addEmptyXAxis(cc, 'x-1', plotDimensions, AxisLocation.Bottom, scaleLinear(), margin, jest.fn(), 'red')
        const registeredHandle = (cc.register as jest.Mock).mock.calls[0][0]
        removeContinuousXAxis(cc, 'x-1')
        expect(cc.unregister).not.toHaveBeenCalledWith(registeredHandle)
    })
})

describe('calculateConstrainedZoomFor', () => {
    it('delegates to the range\'s own constrainedScale', () => {
        const range = ContinuousAxisRange.from(0, 100)
        const result = calculateConstrainedZoomFor(2, 50, range, [-1000, 1000])
        expect(result.range).toEqual(range.constrainedScale(2, 50, [-1000, 1000]))
    })
})

describe('calculateOrdinalConstrainedZoomFor', () => {
    it('delegates to the range\'s own constrainedScale', () => {
        const range = OrdinalAxisRange.from(0, 100)
        const result = calculateOrdinalConstrainedZoomFor(2, 50, range, [-1000, 1000])
        expect(result.range).toEqual(range.constrainedScale(2, 50, [-1000, 1000]))
    })
})

describe('calculatePanFor', () => {
    const fakeAxis = {scale: scaleLinear().domain([0, 100]).range([0, 200])} as unknown as ContinuousNumericAxis

    it('translates the range by the pixel delta converted through the axis scale', () => {
        const range = ContinuousAxisRange.from(0, 100)
        const panned = calculatePanFor(20, fakeAxis, range)
        // 20 pixels, at this scale (200px covers a domain of 100), is 10 domain units
        expect(panned.current.start).toBeCloseTo(-10)
        expect(panned.current.end).toBeCloseTo(90)
    })

    it('constrains the pan to stay within the original range when requested', () => {
        const range = ContinuousAxisRange.from(0, 100, 0, 100)
        const panned = calculatePanFor(-2000, fakeAxis, range, true)
        expect(panned.current.start).toBeGreaterThanOrEqual(0)
    })
})

describe('axesForSeriesGen', () => {
    it('returns the distinct axis ids assigned to the given series', () => {
        const series = [seriesFrom('s1'), seriesFrom('s2'), seriesFrom('s3')]
        const assignments = new Map<string, AxesAssignment>([
            ['s1', {xAxis: 'x-1', yAxis: 'y-1'}],
            ['s2', {xAxis: 'x-2', yAxis: 'y-1'}],
            ['s3', {xAxis: 'x-1', yAxis: 'y-1'}],
        ])
        expect(axesForSeriesGen(series, assignments, AxesState.empty())).toEqual(['x-1', 'x-2'])
    })

    it('falls back to the default axis id for a series with no explicit assignment', () => {
        const series = [seriesFrom('s1')]
        const axesState = AxesState.from<ContinuousNumericAxis>(new Map([
            ['default-x', {scale: scaleLinear()} as unknown as ContinuousNumericAxis],
        ]))
        expect(axesForSeriesGen(series, new Map(), axesState)).toEqual(['default-x'])
    })
})

describe('panHandler/ordinalPanHandler/panHandler2D', () => {
    const plotDimensions: Dimensions = {width: 500, height: 300}
    const margin: Margin = {top: 0, right: 0, bottom: 0, left: 0}

    function fakeContinuousAxis(): ContinuousNumericAxis {
        return {
            axisId: 'x-1',
            location: AxisLocation.Bottom,
            axisType: AxisType.ContinuousNumeric,
            scale: scaleLinear().domain([0, 100]).range([0, 500]),
            update: jest.fn(),
            updateFont: jest.fn(),
            setHighlighted: jest.fn(),
        }
    }

    it('panHandler updates the range and calls the axis\' update() for each assigned axis', () => {
        const axis = fakeContinuousAxis()
        const axesState = AxesState.from<ContinuousNumericAxis>(new Map([['x-1', axis]]))
        const setAxisRangeFor = jest.fn()
        const ranges = new Map([['x-1', ContinuousAxisRange.from(0, 100)]])

        const handler = panHandler(['x-1'], margin, setAxisRangeFor, axesState, false)
        handler(10, plotDimensions, ranges)

        expect(setAxisRangeFor).toHaveBeenCalledWith('x-1', expect.anything())
        expect(axis.update).toHaveBeenCalled()
    })

    it('ordinalPanHandler updates the range and calls the axis\' update() for each assigned axis', () => {
        const axis: OrdinalStringAxis = {
            axisId: 'x-1',
            location: AxisLocation.Bottom,
            axisType: AxisType.OrdinalString,
            scale: scaleBand<string>(),
            categorySize: 10,
            update: jest.fn(() => 10),
            updateFont: jest.fn(),
            setHighlighted: jest.fn(),
        }
        const axesState = AxesState.from<OrdinalStringAxis>(new Map([['x-1', axis]]))
        const setAxisRangeFor = jest.fn()
        const ranges = new Map([['x-1', OrdinalAxisRange.from(0, 100, 0, 500)]])

        const handler = ordinalPanHandler(['x-1'], margin, setAxisRangeFor, axesState, false)
        handler(10, plotDimensions, [], ranges)

        expect(setAxisRangeFor).toHaveBeenCalledWith('x-1', expect.anything())
        expect(axis.update).toHaveBeenCalled()
    })

    it('panHandler2D pans both the x- and y-axes', () => {
        const xAxis = fakeContinuousAxis()
        const yAxis = fakeContinuousAxis()
        const xAxesState = AxesState.from<ContinuousNumericAxis>(new Map([['x-1', xAxis]]))
        const yAxesState = AxesState.from<ContinuousNumericAxis>(new Map([['y-1', yAxis]]))
        const setAxisRange = jest.fn()
        const xRanges = new Map([['x-1', ContinuousAxisRange.from(0, 100)]])
        const yRanges = new Map([['y-1', ContinuousAxisRange.from(0, 100)]])

        const handler = panHandler2D(['x-1'], ['y-1'], margin, setAxisRange, xAxesState, yAxesState, false)
        handler(10, 20, plotDimensions, [], xRanges, yRanges)

        expect(xAxis.update).toHaveBeenCalled()
        expect(yAxis.update).toHaveBeenCalled()
    })
})

describe('continuousAxisZoomHandler/axesZoomHandler', () => {
    const plotDimensions: Dimensions = {width: 500, height: 300}
    const margin: Margin = {top: 0, right: 0, bottom: 0, left: 0}

    function fakeContinuousAxis(): ContinuousNumericAxis {
        return {
            axisId: 'x-1',
            location: AxisLocation.Bottom,
            axisType: AxisType.ContinuousNumeric,
            scale: scaleLinear().domain([0, 100]).range([0, 500]),
            update: jest.fn(),
            updateFont: jest.fn(),
            setHighlighted: jest.fn(),
        }
    }

    it('continuousAxisZoomHandler zooms the assigned axis around the given pivot', () => {
        const axis = fakeContinuousAxis()
        const axesState = AxesState.from<ContinuousNumericAxis>(new Map([['x-1', axis]]))
        const setRangeFor = jest.fn()
        const ranges = new Map([['x-1', ContinuousAxisRange.from(0, 100, 0, 100)]])

        const handler = continuousAxisZoomHandler(['x-1'], margin, setRangeFor, axesState, [0, Infinity])
        handler(1.5, () => 50, plotDimensions, ranges)

        expect(setRangeFor).toHaveBeenCalledWith('x-1', expect.anything())
        expect(axis.update).toHaveBeenCalled()
    })

    it('axesZoomHandler zooms both the x- and y-axes around the mouse position', () => {
        const xAxis = fakeContinuousAxis()
        const yAxis = fakeContinuousAxis()
        const xAxesState = AxesState.from<ContinuousNumericAxis>(new Map([['x-1', xAxis]]))
        const yAxesState = AxesState.from<ContinuousNumericAxis>(new Map([['y-1', yAxis]]))
        const setRangeFor = jest.fn()
        const xRanges = new Map([['x-1', ContinuousAxisRange.from(0, 100, 0, 100)]])
        const yRanges = new Map([['y-1', ContinuousAxisRange.from(0, 100, 0, 100)]])

        const handler = axesZoomHandler(['x-1'], ['y-1'], margin, setRangeFor, xAxesState, yAxesState, [0, Infinity])
        handler(1.5, [50, 50], plotDimensions, xRanges, yRanges)

        expect(xAxis.update).toHaveBeenCalled()
        expect(yAxis.update).toHaveBeenCalled()
    })
})

describe('continuousRange/ordinalRange and their *AxisRanges aliases', () => {
    it('continuousRange reads each axis\' domain into a ContinuousAxisRange', () => {
        const axes = new Map<string, ContinuousNumericAxis>([
            ['x-1', {scale: scaleLinear().domain([0, 100])} as unknown as ContinuousNumericAxis],
        ])
        const ranges = continuousRange(axes)
        expect(ranges.get('x-1')?.current.equalsInterval(0, 100)).toBe(true)
    })

    it('continuousAxisRanges is the same as continuousRange', () => {
        const axes = new Map<string, ContinuousNumericAxis>([
            ['x-1', {scale: scaleLinear().domain([0, 100])} as unknown as ContinuousNumericAxis],
        ])
        expect(continuousAxisRanges(axes)).toEqual(continuousRange(axes))
    })

    it('ordinalRange reads each axis\' scale range into an OrdinalAxisRange', () => {
        const axes = new Map<string, OrdinalStringAxis>([
            ['x-1', {scale: scaleBand<string>().range([0, 500])} as OrdinalStringAxis],
        ])
        const ranges = ordinalRange(axes)
        expect(ranges.get('x-1')?.current.equalsInterval(0, 500)).toBe(true)
    })

    it('ordinalAxisRanges is the same as ordinalRange', () => {
        const axes = new Map<string, OrdinalStringAxis>([
            ['x-1', {scale: scaleBand<string>().range([0, 500])} as OrdinalStringAxis],
        ])
        expect(ordinalAxisRanges(axes)).toEqual(ordinalRange(axes))
    })
})

describe('continuousAxisIntervals/ordinalAxisIntervals', () => {
    it('continuousAxisIntervals reads each axis\' domain into an AxisInterval', () => {
        const axes = new Map<string, ContinuousNumericAxis>([
            ['x-1', {scale: scaleLinear().domain([0, 100])} as unknown as ContinuousNumericAxis],
        ])
        expect(continuousAxisIntervals(axes).get('x-1')?.equalsInterval(0, 100)).toBe(true)
    })

    it('ordinalAxisIntervals reads each axis\' scale range and categories', () => {
        const axes = new Map<string, OrdinalStringAxis>([
            ['x-1', {scale: scaleBand<string>().domain(['a', 'b']).range([0, 500])} as OrdinalStringAxis],
        ])
        const result = ordinalAxisIntervals(axes).get('x-1')
        expect(result?.interval.equalsInterval(0, 500)).toBe(true)
        expect(result?.categories).toEqual(['a', 'b'])
    })
})
