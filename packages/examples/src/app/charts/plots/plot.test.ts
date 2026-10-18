import {assignAxes, clipToArea, createCanvasContext, currentIntervalsFrom, resizeCanvasTo} from "./plot";
import type {CanvasContext} from "../d3types";
import {ContinuousAxisRange} from "../axes/ContinuousAxisRange";

/**
 * `createCanvasContext` reads `window.devicePixelRatio` and calls `window.requestAnimationFrame`.
 * In this project's plain-Node Jest environment (no jsdom) `window` is simply undefined, so it
 * must be stubbed. Returns a way to manually fire whatever `requestAnimationFrame` callback is
 * currently pending, so `redrawNow` can be driven deterministically without real animation frames.
 */
function installWindowStub(): {runPendingAnimationFrame: () => void} {
    let pending: (() => void) | undefined
    const g = globalThis as unknown as {window: unknown}
    g.window = {
        devicePixelRatio: 1,
        requestAnimationFrame: (cb: (time: number) => void): number => {
            pending = () => cb(0)
            return 1
        },
    }
    return {
        runPendingAnimationFrame: () => {
            const fn = pending
            pending = undefined
            fn?.()
        },
    }
}

function uninstallWindowStub(): void {
    const g = globalThis as unknown as {window?: unknown}
    delete g.window
}

/**
 * A minimal fake `<canvas>` -- just enough surface for `createCanvasContext`/`redrawNow` to touch:
 * a 2D context stub (`save`/`setTransform`/`clearRect`/`restore`, plus the style fields it sets)
 * and the numeric `width`/`height` used to clear the full backing store each frame.
 */
function fakeCanvas(): HTMLCanvasElement {
    const context2D = {
        textBaseline: '',
        strokeStyle: '',
        fillStyle: '',
        save: jest.fn(),
        setTransform: jest.fn(),
        clearRect: jest.fn(),
        restore: jest.fn(),
    }
    return {
        width: 100,
        height: 100,
        getContext: () => context2D,
    } as unknown as HTMLCanvasElement
}

describe('createCanvasContext redraw', () => {
    let errorSpy: jest.SpyInstance
    let runPendingAnimationFrame: () => void

    beforeEach(() => {
        ({runPendingAnimationFrame} = installWindowStub())
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        errorSpy.mockRestore()
        uninstallWindowStub()
    })

    it('runs every registered draw function on a redraw', () => {
        const canvasContext = createCanvasContext(1, fakeCanvas(), 'black')

        const drawA = jest.fn()
        const drawB = jest.fn()
        canvasContext.register('a', drawA)
        canvasContext.register('b', drawB)
        runPendingAnimationFrame()

        expect(drawA).toHaveBeenCalledWith(canvasContext)
        expect(drawB).toHaveBeenCalledWith(canvasContext)
    })

    it("one registrant's throw does not prevent the others from drawing on the same frame", () => {
        const canvasContext = createCanvasContext(1, fakeCanvas(), 'black')

        const failing = jest.fn(() => {
            throw new Error('boom')
        })
        const before = jest.fn()
        const after = jest.fn()
        canvasContext.register('before', before, 0)
        canvasContext.register('failing', failing, 1)
        canvasContext.register('after', after, 2)
        runPendingAnimationFrame()

        expect(before).toHaveBeenCalled()
        expect(failing).toHaveBeenCalled()
        expect(after).toHaveBeenCalled()
        expect(errorSpy).toHaveBeenCalledTimes(1)
        expect(errorSpy.mock.calls[0][0]).toContain('"failing"')
        expect(errorSpy.mock.calls[0][0]).toContain('chart_id: 1')
    })

    it('a subsequent redraw still runs normally after a previous frame threw', () => {
        const canvasContext = createCanvasContext(1, fakeCanvas(), 'black')

        let shouldThrow = true
        canvasContext.register('flaky', () => {
            if (shouldThrow) throw new Error('boom')
        })
        runPendingAnimationFrame()
        expect(errorSpy).toHaveBeenCalledTimes(1)

        shouldThrow = false
        canvasContext.requestRedraw()
        runPendingAnimationFrame()
        expect(errorSpy).toHaveBeenCalledTimes(1)
    })
})

/**
 * A minimal structural fake `CanvasContext` -- just enough surface for `resizeCanvasTo`/
 * `clipToArea` to touch: a fake `<canvas>` with a settable `style`/`width`/`height`, and a fake
 * 2D context with the drawing methods they call as spies.
 */
function fakeCanvasContext(dpr: number = 1): CanvasContext {
    const canvas = {
        style: {},
        width: 0,
        height: 0,
    }
    const context2D = {
        setTransform: jest.fn(),
        beginPath: jest.fn(),
        rect: jest.fn(),
        clip: jest.fn(),
    }
    return {
        chartId: 1,
        canvas,
        context2D,
        dpr,
        register: jest.fn(),
        unregister: jest.fn(),
        requestRedraw: jest.fn(),
    } as unknown as CanvasContext
}

describe('resizeCanvasTo', () => {
    it('sets the canvas CSS size to the given dimensions', () => {
        const context = fakeCanvasContext()
        resizeCanvasTo(context, {width: 200, height: 100})
        expect(context.canvas.style.width).toBe('200px')
        expect(context.canvas.style.height).toBe('100px')
    })

    it('scales the backing store by the device pixel ratio', () => {
        const context = fakeCanvasContext(2)
        resizeCanvasTo(context, {width: 200, height: 100})
        expect(context.canvas.width).toBe(400)
        expect(context.canvas.height).toBe(200)
    })

    it('applies the dpr scale transform to the 2D context', () => {
        const context = fakeCanvasContext(2)
        resizeCanvasTo(context, {width: 200, height: 100})
        expect(context.context2D.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0)
    })

    it('floors negative dimensions at zero', () => {
        const context = fakeCanvasContext()
        resizeCanvasTo(context, {width: -50, height: -20})
        expect(context.canvas.style.width).toBe('0px')
        expect(context.canvas.style.height).toBe('0px')
        expect(context.canvas.width).toBe(0)
        expect(context.canvas.height).toBe(0)
    })
})

describe('clipToArea', () => {
    it('clips to the given dimensions at the default (0, 0) origin', () => {
        const context = fakeCanvasContext()
        clipToArea(context, {width: 50, height: 30})
        expect(context.context2D.beginPath).toHaveBeenCalled()
        expect(context.context2D.rect).toHaveBeenCalledWith(0, 0, 50, 30)
        expect(context.context2D.clip).toHaveBeenCalled()
    })

    it('clips at the given origin when specified', () => {
        const context = fakeCanvasContext()
        clipToArea(context, {width: 50, height: 30}, {x: 10, y: 20})
        expect(context.context2D.rect).toHaveBeenCalledWith(10, 20, 50, 30)
    })

    it('floors negative dimensions at zero', () => {
        const context = fakeCanvasContext()
        clipToArea(context, {width: -50, height: -30})
        expect(context.context2D.rect).toHaveBeenCalledWith(0, 0, 0, 0)
    })
})

describe('assignAxes', () => {
    it('builds an AxesAssignment from the given axis ids', () => {
        expect(assignAxes('x-1', 'y-1')).toEqual({xAxis: 'x-1', yAxis: 'y-1'})
    })
})

describe('currentIntervalsFrom', () => {
    it('maps each axis id to its range\'s current interval', () => {
        const ranges = new Map([
            ['x-1', ContinuousAxisRange.from(0, 100)],
            ['y-1', ContinuousAxisRange.from(10, 20)],
        ])
        const intervals = currentIntervalsFrom(ranges)
        expect(intervals.get('x-1')?.equalsInterval(0, 100)).toBe(true)
        expect(intervals.get('y-1')?.equalsInterval(10, 20)).toBe(true)
    })

    it('returns an empty map for an empty ranges map', () => {
        expect(currentIntervalsFrom(new Map()).size).toBe(0)
    })
})
