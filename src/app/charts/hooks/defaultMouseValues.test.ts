import {defaultMouseValues} from "./defaultMouseValues";

describe('defaultMouseValues', () => {
    const values = defaultMouseValues<unknown, unknown>();

    it('should register handlers as no-ops returning an empty handler id', () => {
        expect(values.registerMouseOverHandler('id', () => {})).toBe('');
        expect(values.registerMouseLeaveHandler('id', () => {})).toBe('');
    });

    it('should return no-op handlers for any handler lookup', () => {
        expect(() => values.mouseOverHandlerFor('id')('series', 0, {series: [], metadata: undefined}, [0, 0])).not.toThrow();
        expect(() => values.mouseLeaveHandlerFor('id')('series')).not.toThrow();
    });

    it('should not throw when unregistering', () => {
        expect(() => values.unregisterMouseOverHandler('id')).not.toThrow();
        expect(() => values.unregisterMouseLeaveHandler('id')).not.toThrow();
    });
});
