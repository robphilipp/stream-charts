// this file exports only components (TabNav, RootLayout, and the per-chart route components),
// so react-refresh's "only export components" rule is satisfied without needing a disable
import {type CSSProperties, type JSX, type Ref, useLayoutEffect, useRef, useState} from "react";
import {Link, Outlet} from "@tanstack/react-router";
import {
    Grid,
    gridArea,
    GridItem,
    gridTemplateAreasBuilder,
    gridTrackTemplateBuilder,
    useGridCell,
    useWindowDimensions,
    withFraction,
    withPixels,
} from "react-resizable-grid-layout";
import {Toggle, ToggleStatus} from "./ui/Toggle";
import {defaultActiveTabStyle, defaultTabStyle} from "./ui/tabStyles";
import {darkTheme, lightTheme} from "./ui/Themes.ts";
import {StreamingRasterChart} from "./examples/StreamingRasterChart";
import {StreamingScatterChart} from "./examples/StreamingScatterChart";
import {StreamingPoincareChart} from "./examples/StreamingPoincareChart";
import {StreamingBarChart} from "./examples/StreamingBarChart";
import {StreamingOutlierChart} from "./examples/StreamingOutlierChart";
import {useThemeStore} from "./examples/appstate/themeStore.ts";
import {TABS, initialBarData, initialIterateData, initialScatterData, initialSpikeData} from "./routeData";

/**
 * Routed replacement for the old <Tabs> header: renders one <Link> per tab, reusing the tab
 * styling exported from Tabs.tsx (composed the same way as TabHeader), with the active tab
 * shown bold and underlined. The theme overrides mirror what App.tsx passed to <Tabs>.
 * @return The tab navigation bar
 */
export function TabNav(): JSX.Element {
    const {theme} = useThemeStore()
    const styleOverride: CSSProperties = {
        backgroundColor: theme.backgroundColor,
        color: theme.color,
        width: "auto",
        paddingLeft: 20,
        paddingRight: 20,
        display: "inline-block",
        textDecoration: "none",
    }
    const [isHovered, setIsHovered] = useState<string>("")
    const [isFocused, setIsFocused] = useState<string>("")

    const inactiveTabStyle: CSSProperties = {
        ...defaultTabStyle,
        ...styleOverride,
    }
    const activeTabStyle: CSSProperties = {
        ...defaultTabStyle,
        ...styleOverride,
        ...defaultActiveTabStyle,
        borderBottom: `1px solid ${theme.color}`,
    }
    return (
        <div style={{display: "flex"}}>
            {TABS.map(tab => (
                <Link
                    key={`tab-${tab.name}`}
                    to={tab.path}
                    // keep the tab active across all of its substates (e.g., /intro?page=2)
                    activeOptions={{includeSearch: false}}
                    style={isHovered === tab.name || isFocused === tab.name ?
                        {...inactiveTabStyle, borderBottom: `1px dotted ${theme.disabledColor}`} :
                        inactiveTabStyle
                    }
                    activeProps={{style: activeTabStyle}}
                    onMouseEnter={() => setIsHovered(tab.name)}
                    onMouseLeave={() => setIsHovered("")}
                    onFocus={() => setIsFocused(tab.name)}
                    onBlur={() => setIsFocused("")}
                >
                    {tab.name}
                </Link>
            ))}
        </div>
    )
}

/**
 * The application shell (header, theme toggle, tab navigation) rendered by the root route.
 * The active tab's content is rendered into the <Outlet/>. This component stays mounted across
 * navigation, so the theme toggle and theme context persist.
 * @return The application shell
 */
export function RootLayout(): JSX.Element {
    const {theme, updateTheme} = useThemeStore()
    const pageRef = useRef<HTMLDivElement>(null)

    function handleThemeChange(status: ToggleStatus): void {
        // Turns off the page's transitions (see `THEME_CHANGING_ATTRIBUTE`) *before* React applies
        // the new theme, rather than in an effect: the page's components may read their layout in
        // their own layout effects (which run before this component's), and that applies the new
        // theme's styles -- starting any transitions that are still on.
        pageRef.current?.setAttribute(THEME_CHANGING_ATTRIBUTE, '')
        updateTheme(status === ToggleStatus.OFF ? lightTheme : darkTheme)
    }

    // once the new theme has been rendered, applies its styles (while the transitions are still
    // off), and then turns the transitions back on
    useLayoutEffect(
        () => {
            const page = pageRef.current
            if (page === null || !page.hasAttribute(THEME_CHANGING_ATTRIBUTE)) return
            // (reading the layout makes the browser apply the new styles now)
            page.getBoundingClientRect()
            page.removeAttribute(THEME_CHANGING_ATTRIBUTE)
        },
        [theme]
    )

    return (
        <Grid
            dimensionsSupplier={useWindowDimensions}
            gridTemplateColumns={gridTrackTemplateBuilder()
                .addTrack(withPixels(40))
                .addTrack(withFraction(1))
                .addTrack(withPixels(40))
                .build()}
            gridTemplateRows={gridTrackTemplateBuilder()
                .addTrack(withPixels(25))
                .addTrack(withPixels(50))
                .addTrack(withFraction(1))
                .build()}
            gridTemplateAreas={gridTemplateAreasBuilder()
                .addArea("app-header", gridArea(1, 1, 1, 3))
                .addArea("left-side", gridArea(2, 1, 5))
                .addArea("scatter-header", gridArea(2, 2))
                .addArea("scatter-chart", gridArea(3, 2))
                .addArea("left-side", gridArea(1, 3, 5))
                .build()}
            styles={{backgroundColor: theme.backgroundColor}}
        >
            <GridItem gridAreaName="app-header">
                <Grid
                    dimensionsSupplier={useGridCell}
                    gridTemplateColumns={gridTrackTemplateBuilder()
                        .addTrack(withFraction(1))
                        .addTrack(withPixels(125))
                        .build()}
                    gridTemplateRows={gridTrackTemplateBuilder()
                        .addTrack(withFraction(1))
                        .build()}
                >
                    <GridItem row={1} column={2}>
                        <div style={{marginTop: 3}}>
                            <Toggle
                                leftLabel="light"
                                rightLabel="dark"
                                onToggle={handleThemeChange}
                                toggleOffColor={lightTheme.color}
                                toggleOffBackgroundColor={lightTheme.backgroundColor}
                                toggleOnColor={darkTheme.color}
                                toggleOnBackgroundColor={darkTheme.backgroundColor}
                                toggleBorderColor={theme.color}
                                labelFontColor={theme.color}
                            />
                        </div>
                    </GridItem>
                </Grid>
            </GridItem>
            <GridItem gridAreaName="scatter-header">
                <h3 style={{color: theme.color}}>Streaming Charts</h3>
            </GridItem>
            <GridItem gridAreaName="scatter-chart">
                <Grid
                    dimensionsSupplier={useGridCell}
                    gridTemplateColumns={gridTrackTemplateBuilder()
                        .addTrack(withFraction(1))
                        .build()}
                    gridTemplateRows={gridTrackTemplateBuilder()
                        .addTrack(withPixels(55))
                        .addTrack(withFraction(1))
                        .addTrack(withPixels(10))
                        .build()}
                    gridTemplateAreas={gridTemplateAreasBuilder()
                        .addArea("tab-header", gridArea(1, 1))
                        .addArea("tab", gridArea(2, 1))
                        .addArea("tab-bottom", gridArea(3, 1))
                        .build()}
                    styles={{color: theme.color}}
                >
                    <GridItem gridAreaName="tab-header">
                        <TabNav/>
                    </GridItem>
                    <GridItem gridAreaName="tab">
                        <ThemeChangeScope ref={pageRef}>
                            <Outlet/>
                        </ThemeChangeScope>
                    </GridItem>
                </Grid>
            </GridItem>
        </Grid>
    )
}

/**
 * While a theme change is being applied, this attribute is set on the page (the routed content),
 * which turns off its transitions (see `index.css`). Without that, the components' own transitions
 * (e.g. the expandable control bar's background and shadow, which animate expanding and
 * collapsing) would also animate the change of theme colors, fading from the old theme to the new
 * one while everything else switches at once -- which shows as a flash.
 */
const THEME_CHANGING_ATTRIBUTE = 'data-theme-changing'

/**
 * The element whose descendants' transitions are turned off while a theme change is applied. It
 * has no box of its own (`display: contents`), so it doesn't affect the page's layout. (It's a
 * component, rather than a plain `<div>`, because the enclosing `GridItem` hands its child `width`
 * and `height` props, which a `<div>` would render as attributes.)
 * @param props The ref to the scope's element, and the page
 * @return The scope
 */
function ThemeChangeScope({ref, children}: { ref: Ref<HTMLDivElement>, children: JSX.Element }): JSX.Element {
    return <div ref={ref} style={{display: 'contents'}}>{children}</div>
}

/*
    Route components for the charts. Each reads the theme from context and passes the same
    props the charts received previously in App.tsx.
 */
/**
 * The route for the scatter example: the example, in the current theme, with `initialScatterData`
 * @return The scatter example
 */
export function ScatterRoute(): JSX.Element {
    const {theme} = useThemeStore()
    return <StreamingScatterChart theme={theme} timeWindow={1000} initialData={initialScatterData}/>
}

/**
 * The route for the raster example: the example, in the current theme, with `initialSpikeData`
 * @return The raster example
 */
export function RasterRoute(): JSX.Element {
    const {theme} = useThemeStore()
    return <StreamingRasterChart theme={theme} timeWindow={1000} initialData={initialSpikeData} seriesHeight={20} plotWidth={900}/>
}

/**
 * The route for the Poincaré example: the example, in the current theme, with `initialIterateData` (the seeds)
 * @return The Poincaré example
 */
export function PoincareRoute(): JSX.Element {
    const {theme} = useThemeStore()
    return <StreamingPoincareChart theme={theme} timeWindow={1000} initialData={initialIterateData}/>
}

/**
 * The route for the bar example: the example, in the current theme, with `initialBarData`
 * @return The bar example
 */
export function BarRoute(): JSX.Element {
    const {theme} = useThemeStore()
    return <StreamingBarChart theme={theme} timeWindow={100} initialData={initialBarData} seriesHeight={20} plotWidth={900}/>
}

/**
 * The route for the outlier example: the example, in the current theme, with its own default initial data
 * @return The outlier example
 */
export function OutlierRoute(): JSX.Element {
    const {theme} = useThemeStore()
    return <StreamingOutlierChart theme={theme} timeWindow={2500}/>
}
