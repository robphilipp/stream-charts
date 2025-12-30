import {AxesState} from "./AxesState";
import {AxisLocation, BaseAxis} from "./axes";
import {AxisElementSelection} from "../d3types";

describe('AxesState', () => {
    describe('creating axes-state', () => {
        it('should create an empty axes state', () => {
            expect(AxesState.empty<BaseAxis>().isEmpty()).toBe(true)
        });

        it('should create an axes state with one axis', () => {
            const axis: BaseAxis = {
                axisId: 'new-axis',
                location: AxisLocation.Bottom,
                selection: undefined as unknown as AxisElementSelection
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
                selection: undefined as unknown as AxisElementSelection
            }
            const updatedAxesState = axesState.addAxis(axis, 'new-added-axis');
            expect(updatedAxesState.isEmpty()).toBe(false);
        })
    })
})