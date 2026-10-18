import {
    applyFillStyle,
    applyStrokeStyle,
    withAlpha,
} from "./canvasStyle";

/**
 * A minimal structural fake of `CanvasRenderingContext2D` -- just enough surface for
 * `applyStrokeStyle`/`applyFillStyle` to touch (the style properties they assign). No jsdom in
 * this project, so a plain object fake stands in, the same technique used elsewhere in this suite.
 */
function fakeContext(): CanvasRenderingContext2D {
    return {} as unknown as CanvasRenderingContext2D;
}

describe('applyStrokeStyle', () => {
    it('should apply color, width, and opacity to the context', () => {
        const context = fakeContext();
        applyStrokeStyle(context, {color: 'red', width: 2, opacity: 0.5});
        expect(context.strokeStyle).toBe('red');
        expect(context.lineWidth).toBe(2);
        expect(context.globalAlpha).toBe(0.5);
    });

    it('should leave unset fields untouched on the context', () => {
        const context = fakeContext();
        context.lineWidth = 9;
        applyStrokeStyle(context, {color: 'red'});
        expect(context.strokeStyle).toBe('red');
        expect(context.lineWidth).toBe(9);
        expect(context.globalAlpha).toBeUndefined();
    });

    it('should return the context for chaining', () => {
        const context = fakeContext();
        expect(applyStrokeStyle(context, {})).toBe(context);
    });
});

describe('applyFillStyle', () => {
    it('should apply color and opacity to the context', () => {
        const context = fakeContext();
        applyFillStyle(context, {color: 'blue', opacity: 0.8});
        expect(context.fillStyle).toBe('blue');
        expect(context.globalAlpha).toBe(0.8);
    });

    it('should leave unset fields untouched on the context', () => {
        const context = fakeContext();
        context.fillStyle = 'green';
        applyFillStyle(context, {opacity: 0.3});
        expect(context.fillStyle).toBe('green');
        expect(context.globalAlpha).toBe(0.3);
    });

    it('should return the context for chaining', () => {
        const context = fakeContext();
        expect(applyFillStyle(context, {})).toBe(context);
    });
});

describe('withAlpha', () => {
    it('should bake the opacity into an rgba(...) string for a named color', () => {
        expect(withAlpha('red', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
    });

    it('should bake the opacity into an rgba(...) string for a hex color', () => {
        expect(withAlpha('#0000ff', 0.25)).toBe('rgba(0, 0, 255, 0.25)');
    });

    it('should fall through to the original string for an unparseable color', () => {
        expect(withAlpha('not-a-real-color', 0.5)).toBe('not-a-real-color');
    });
});
