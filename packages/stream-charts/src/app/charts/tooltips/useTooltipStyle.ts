import {createContext, useContext} from "react";
import {defaultTooltipStyle, type TooltipStyle} from "./tooltipUtils";

/**
 * The style of the enclosing {@link Tooltip} (its `style`, over the default tooltip style)
 */
export const TooltipStyleContext = createContext<TooltipStyle>(defaultTooltipStyle)

/**
 * @return The style of the enclosing {@link Tooltip}: its `style` property over the default tooltip
 * style (or just the default style, outside a tooltip)
 */
export function useTooltipStyle(): TooltipStyle {
    return useContext(TooltipStyleContext)
}
