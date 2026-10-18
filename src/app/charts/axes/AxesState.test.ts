import {AxesState} from "./AxesState";
import {AxisLocation, AxisType, type BaseAxis} from "./axes";

describe('AxesState', () => {
    describe('creating axes-state', () => {
        it('should create an empty axes state', () => {
            expect(AxesState.empty<BaseAxis>().isEmpty()).toBe(true)
        });

        it('should create an axes state with one axis', () => {
            const axis: BaseAxis = {
                axisId: 'new-axis',
                location: AxisLocation.Bottom,
                axisType: AxisType.ContinuousNumeric,
            }
            const axesState = AxesState.from<BaseAxis>(new Map([['new-added-axis', axis]]));
            expect(axesState.isEmpty()).toBe(false);
        })

        it('should be able to start with an empty axes state and add to it', () => {
            const axesState = AxesState.empty<BaseAxis>();
            expect(axesState.isEmpty()).toBe(true);

            const axis: BaseAxis = {
                axisId: 'new-axis',
                location: AxisLocation.Bottom,
                axisType: AxisType.ContinuousNumeric,
            }
            const updatedAxesState = axesState.addAxis(axis, 'new-added-axis');
            expect(updatedAxesState.isEmpty()).toBe(false);
        })
    })

    describe('axisFor', () => {
        const axisOne: BaseAxis = {axisId: 'axis-one', location: AxisLocation.Bottom, axisType: AxisType.ContinuousNumeric}
        const axisTwo: BaseAxis = {axisId: 'axis-two', location: AxisLocation.Bottom, axisType: AxisType.ContinuousNumeric}
        const axesState = AxesState.from<BaseAxis>(new Map([
            ['axis-one', axisOne],
            ['axis-two', axisTwo],
        ]))

        it('should return the axis that matches the specified ID exactly', () => {
            expect(axesState.axisFor('axis-two').getOrUndefined()).toBe(axisTwo)
        })

        it('should return the default axis for the "" sentinel ID (no explicit assignment)', () => {
            // "" is the convention used throughout the plot layer for "no axis was explicitly
            // assigned to this series" -- see e.g. each plot component's own `axesFor` helper
            expect(axesState.axisFor('').getOrUndefined()).toBe(axesState.defaultAxis().getOrUndefined())
        })

        it('should return empty for an unknown, non-empty ID rather than substituting an unrelated axis', () => {
            // a real but stale/mistyped axis ID must surface as "not found", not silently
            // resolve to some other, unrelated axis
            expect(axesState.axisFor('no-such-axis').isEmpty()).toBe(true)
        })

        it('should return empty for any ID, including "", when there are no axes at all', () => {
            const empty = AxesState.empty<BaseAxis>()
            expect(empty.axisFor('').isEmpty()).toBe(true)
            expect(empty.axisFor('anything').isEmpty()).toBe(true)
        })
    })
})