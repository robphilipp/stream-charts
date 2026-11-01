// route tree and router assembly -- this file defines no components (they live in
// routeComponents.tsx), so react-refresh's "only export components" rule doesn't apply here
import {
    createRootRoute,
    createRoute,
    createRouter,
    redirect,
} from "@tanstack/react-router";
import Intro from "./examples/docs/Intro";
import {BarRoute, OutlierRoute, PoincareRoute, RasterRoute, RootLayout, ScatterRoute} from "./routeComponents";

/*
    Route tree
 */
const rootRoute = createRootRoute({
    component: RootLayout,
})

const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    beforeLoad: () => {
        throw redirect({to: "/intro", search: {page: 0}})
    },
})

const introRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/intro",
    validateSearch: (search: Record<string, unknown>): {page: number} => ({
        page: Number(search.page ?? 0),
    }),
    component: Intro,
})

const scatterRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/scatter",
    component: ScatterRoute,
})

const rasterRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/raster",
    component: RasterRoute,
})

const poincareRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/poincare",
    component: PoincareRoute,
})

const barRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/bar",
    component: BarRoute,
})

const outlierRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/outlier",
    component: OutlierRoute,
})

const routeTree = rootRoute.addChildren([
    indexRoute,
    introRoute,
    scatterRoute,
    rasterRoute,
    poincareRoute,
    barRoute,
    outlierRoute,
])

export const router = createRouter({
    routeTree,
    scrollRestoration: true,
    // key scroll cache by full path + search so each intro page (/intro?page=N) and each chart
    // remembers its own scroll position independently
    getScrollRestorationKey: location => location.pathname + location.searchStr,
})

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router
    }
}
