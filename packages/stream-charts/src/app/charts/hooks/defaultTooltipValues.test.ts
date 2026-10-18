import {defaultTooltipValues} from "./defaultTooltipValues";

describe('defaultTooltipValues', () => {
    const values = defaultTooltipValues<unknown, unknown>();

    it('should default visibilityState to false', () => {
        expect(values.visibilityState).toBe(false);
    });

    it('should return undefined for the tooltip content provider', () => {
        expect(values.tooltipContentProvider()).toBeUndefined();
    });

    it('should not throw when registering a content provider or setting visibility', () => {
        const provider = () => ({x: 0, y: 0, contentWidth: 0, contentHeight: 0});
        expect(() => values.registerTooltipContentProvider(provider)).not.toThrow();
        expect(() => values.setVisibilityState(true)).not.toThrow();
    });
});
