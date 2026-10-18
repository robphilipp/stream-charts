import type {CSSProperties} from "react";

/**
 * Base styling for a tab control, shared by the stateful {@link Tabs} header and the routed
 * Link-based tab navigation (see router.tsx), so the tab look is defined in one place.
 */
export const defaultTabStyle: CSSProperties = {
    backgroundColor: '#fff',
    borderLeft: 'unset',
    borderRight: 'unset',
    borderTop: 'unset',
    borderBottom: 'unset',
    borderRadius: 0,
    fontSize: 'inherit',
    fontFamily: 'inherit',
    width: 50,
    padding: 4,
    cursor: 'pointer',
    outline: 'none',
}

/**
 * Additional styling applied to the active tab (merged on top of {@link defaultTabStyle}).
 */
export const defaultActiveTabStyle: CSSProperties = {
    borderLeft: 'unset',
    borderRight: 'unset',
    borderTop: 'unset',
    borderBottom: 'unset',
    fontWeight: 700,
    outline: 'none',
}
