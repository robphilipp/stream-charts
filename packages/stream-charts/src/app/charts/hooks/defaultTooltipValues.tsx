import type {UseTooltipValues} from "./useTooltip";

/**
 * No operation function for use when a default function is needed
 */
const noop = () => {
    /* empty on purpose */
}

/**
 * The default values for the {@link UseTooltipValues}
 * @return The default values for the {@link UseTooltipValues}
 * @template D The type of the data object for the series
 * @template M The type of the metadata object for the series
 */
export function defaultTooltipValues<D, M>(): UseTooltipValues<D, M> {
    return {
        registerTooltipContentProvider: noop,
        tooltipContentProvider: () => undefined,
        setVisibilityState: noop,
        visibilityState: false,
    }
}
