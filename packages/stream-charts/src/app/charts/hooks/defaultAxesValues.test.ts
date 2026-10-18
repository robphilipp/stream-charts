import {defaultAxesValues} from "./defaultAxesValues";
import type {BaseAxisRange} from "../axes/BaseAxisRange";
import type {BaseAxis} from "../axes/axes";

describe('defaultAxesValues', () => {
    const values = defaultAxesValues<BaseAxisRange, BaseAxis>();

    it('should start with empty x- and y-axes state', () => {
        expect(values.xAxesState.isEmpty()).toBe(true);
        expect(values.yAxesState.isEmpty()).toBe(true);
    });

    it('should return an empty axis assignment', () => {
        expect(values.axisAssignmentsFor('anything')).toEqual({xAxis: "", yAxis: ""});
    });

    it('should return an empty ranges map and an empty Optional for any axis id', () => {
        expect(values.axesRanges().size).toBe(0);
        expect(values.axisRangeFor('x').isEmpty()).toBe(true);
    });

    it('should return a no-op unregister function from addAxesRangesUpdateHandler', () => {
        // the interface declares this `void`-returning, but the default factory's actual
        // implementation returns a callable no-op; cast to exercise that runtime behavior
        const addHandler = values.addAxesRangesUpdateHandler as unknown as (id: string, handler: () => void) => () => void;
        const handler = addHandler('id', () => {});
        expect(() => handler()).not.toThrow();
    });

    it('should not throw when the setter/update no-op functions are called', () => {
        // these are deliberately untyped `noop`s -- cast to bypass the (irrelevant, for a no-op)
        // parameter types and just confirm calling them does nothing and doesn't throw
        const asAny = values as unknown as Record<string, (...args: Array<unknown>) => unknown>;
        for (const fn of [
            'addXAxis', 'addYAxis', 'setAxisAssignments', 'updateAxisRanges', 'setAxesRanges',
            'setAxisRangeFor', 'setAxisIntervalFor', 'setOriginalAxisIntervalFor',
            'resetAxisIntervalFor', 'resetAxesRanges',
        ]) {
            expect(() => asAny[fn]()).not.toThrow();
        }
        // like addAxesRangesUpdateHandler, the interface declares this `void`-returning, but the
        // default factory's actual implementation returns a callable no-op
        expect(typeof (values.removeAxesRangesUpdateHandler('id') as unknown)).toBe('function');
    });
});
