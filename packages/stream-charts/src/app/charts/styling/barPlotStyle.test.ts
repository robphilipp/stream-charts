import {
    defaultBarSeriesStyle,
    defaultMeanValueLineStyle,
    defaultMinMaxBarStyle,
    defaultValueLineStyle,
    defaultWindowedMeanValueLineStyle,
    defaultWindowedMinMaxBarStyle,
} from "./barPlotStyle";

describe('defaultMinMaxBarStyle', () => {
    it('should use the given color as-is for fill and stroke', () => {
        const style = defaultMinMaxBarStyle('#123456');
        expect(style.fill.color).toBe('#123456');
        expect(style.stroke.color).toBe('#123456');
    });

    it('should default the color when none is given', () => {
        expect(defaultMinMaxBarStyle().fill.color).toBe('#008aad');
    });
});

describe('defaultWindowedMinMaxBarStyle', () => {
    it('should darken the given color for fill and stroke', () => {
        const style = defaultWindowedMinMaxBarStyle('#008aad');
        expect(style.fill.color).not.toBe('#008aad');
        expect(style.stroke.color).toBe(style.fill.color);
    });

    it('should fall back to the original color when it is unparseable', () => {
        const style = defaultWindowedMinMaxBarStyle('not-a-real-color');
        expect(style.fill.color).toBe('not-a-real-color');
        expect(style.stroke.color).toBe('not-a-real-color');
    });

    it('should be narrower than the lifetime min/max bar', () => {
        expect(defaultWindowedMinMaxBarStyle().widthFraction).toBeLessThan(defaultMinMaxBarStyle().widthFraction);
    });
});

describe('defaultValueLineStyle', () => {
    it('should use the given color for both regular and highlight', () => {
        const style = defaultValueLineStyle('#123456');
        expect(style.regular.color).toBe('#123456');
        expect(style.highlight.color).toBe('#123456');
    });

    it('should make the highlight wider and more opaque than the regular line', () => {
        const style = defaultValueLineStyle();
        expect(style.highlight.width).toBeGreaterThan(style.regular.width);
        expect(style.highlight.opacity).toBeGreaterThan(style.regular.opacity);
    });
});

describe('defaultMeanValueLineStyle', () => {
    it('should use the given color for both regular and highlight', () => {
        const style = defaultMeanValueLineStyle('#123456');
        expect(style.regular.color).toBe('#123456');
        expect(style.highlight.color).toBe('#123456');
    });
});

describe('defaultWindowedMeanValueLineStyle', () => {
    it('should default to a color distinct from the other line styles\' default', () => {
        expect(defaultWindowedMeanValueLineStyle().regular.color).toBe('#ad0000');
    });

    it('should use the given color for both regular and highlight', () => {
        const style = defaultWindowedMeanValueLineStyle('#123456');
        expect(style.regular.color).toBe('#123456');
        expect(style.highlight.color).toBe('#123456');
    });
});

describe('defaultBarSeriesStyle', () => {
    it('should compose all the sub-styles using the given color', () => {
        const style = defaultBarSeriesStyle('#123456');
        expect(style.color).toBe('#123456');
        expect(style.highlightColor).toBe('#123456');
        expect(style.minMaxBar.fill.color).toBe('#123456');
        expect(style.valueLine.regular.color).toBe('#123456');
        expect(style.meanValueLine.regular.color).toBe('#123456');
    });

    it('should default the color when none is given', () => {
        expect(defaultBarSeriesStyle().color).toBe('#008aad');
    });
});
