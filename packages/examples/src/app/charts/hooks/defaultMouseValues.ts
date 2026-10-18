import type {UseMouseValues} from "./useMouse";

/**
 * No operation function for use when a default function is needed
 */
const noop = () => {
    /* empty on purpose */
}
/**
 * The default values for the {@link UseMouseValues}
 * @return The default values for the {@link UseMouseValues}
 * @template D The type of the data object for the series
 * @template TM The type of the metadata object for the series
 */
export function defaultMouseValues<D, TM>(): UseMouseValues<D, TM> {
    return {
        registerMouseOverHandler: () => '',
        unregisterMouseOverHandler: noop,
        mouseOverHandlerFor: () => noop,
        registerMouseLeaveHandler: () => '',
        unregisterMouseLeaveHandler: noop,
        mouseLeaveHandlerFor: () => noop,
    }
}