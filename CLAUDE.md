# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

An npm-workspaces monorepo with two packages:

- `packages/stream-charts` — the `stream-charts` library, published to npm. Its public API is `src/index.ts` (which re-exports `src/app/charts/index.ts`).
- `packages/examples` — the example app (`stream-charts-examples`, private, never published). It imports everything from `"stream-charts"`.

The root `README.md` and `changes.md` are the library's (also the GitHub Pages homepage); `prepack` copies them into the library package. `docs/` at the root is the library's typedoc output, served by GitHub Pages at `/docs/`.

In development the app uses the library's **TypeScript source**, not its build: the library's `exports` map has a `source` condition (pointing to `src/index.ts`) that the app's Vite config (`resolve.conditions`), `tsconfig.app.json` (`customConditions`), and `jest.config.cjs` (`moduleNameMapper`) follow. So library edits hot-reload in the app with no build step. Published consumers don't set `source`, so they get `dist/`.

## Commands

Run from the repo root:

```bash
npm install        # One install for both packages (one root node_modules and package-lock.json)
npm run dev        # Start the example app's Vite dev server with HMR (library source included)
npm run build      # Build the library (tsc → packages/stream-charts/dist), then the example app
npm run test       # Run both packages' Jest tests
npm run lint       # Lint both packages
npm run docs       # Regenerate the library's typedoc into ./docs
npm test -w stream-charts -- src/app/charts/utils.test.ts   # A single library test file
npm test -w stream-charts-examples                          # Just the example app's tests
npm pack -w stream-charts --dry-run                         # See what would be published
```

Library tests use ts-jest (`packages/stream-charts/jest.config.js`, `tsconfig.test.json`). The app's tests use babel-jest with the root `babel.config.cjs` (`rootMode: 'upward'`, so it also applies to the library source the app's tests load).

## Architecture Overview

The library is React + D3, demonstrated by the example app, showcasing real-time streaming data visualization. Charts receive RxJS Observables and render continuously updated SVG via D3.

### Data Flow

```
randomXxxData.ts  →  RxJS Observable<TimeSeriesChartData>
                   →  Chart.tsx (manages subscriptions, creates SVG)
                   →  Context Providers (axes, dimensions, mouse, tooltip, data)
                   →  Plot components (ScatterPlot, RasterPlot, BarPlot, PoincarePlot)
                   →  D3 directly mutates SVG elements
```

### Provider/Hook Pattern

`Chart.tsx` wraps all children in stacked context providers: `PlotDimensionsProvider → CanvasSurfaceProvider → AxesProvider → InteractionProvider` (mouse handlers, tooltip, hovered series) `→ ChartDataContext` (data source, initial data, streaming settings) `→ ChartProvider`. Plot components and axes consume these via `useChart()`, `usePlotDimensions()`, `useDataSource()`/`useInitialData()`/`useStreamingSettings()`, `useHoveredSeries()`, etc. — never via prop drilling. The public API is `packages/stream-charts/src/app/charts/index.ts`.

### Chart Composition Model

Charts are built declaratively by nesting components as children of `<Chart>`:

```tsx
<Chart observable={obs} axes={axes}>
  <ContinuousAxis axisId="x" />
  <ContinuousAxis axisId="y" />
  <ScatterPlot xAxisId="x" yAxisId="y" seriesStyles={styles} />
  <Legend />
  <Tracker />
  <Tooltip />
</Chart>
```

Each child reads what it needs from context; `Chart.tsx` owns the SVG and subscription lifecycle.

### Key Directories

- `packages/stream-charts/src/app/charts/` — All chart internals (axes, plots, hooks, providers, series, observables, legends, trackers, tooltips, subscriptions, styling)
- `packages/examples/src/app/examples/` — Full working chart examples (`StreamingScatterChart`, `StreamingRasterChart`, `StreamingBarChart`, `StreamingPoincareChart`) plus random data generators
- `packages/examples/src/app/ui/` — Generic UI components (Toggle, Button, Checkbox, Tabs) and theme definitions

### D3 Integration

D3 renders directly into SVG — no D3-React bindings. `GSelection` (`d3.Selection<SVGGElement, any, any, any>`) is the primary type passed through context. Scale objects (`scaleLinear`, `scaleLog`, `scaleBand`) are stored in context and accessed by plots and axes. Clip paths and plot containers are set up in `plots/plot.ts` utilities.

### Axes System

Axes are defined as typed objects (`ContinuousNumericAxis`, `OrdinalAxis`) passed to `<Chart>`. `AxesState.ts` manages active ranges and zoom transforms. Range types (`ContinuousAxisRange`, `OrdinalAxisRange`) handle domain min/max calculations. Zoom and pan handlers live in `axes/axes.ts`.

### Streaming / RxJS Conventions

- Data generators (`randomWeightData.ts`, etc.) return `Observable<ChartData>` using `scan` to accumulate time-series state
- `Chart.tsx` subscribes/unsubscribes based on a `shouldSubscribe` flag (controlled by the run/clear UI)
- `windowingTime` buffers updates; `dropDataAfter` trims old data
- Series data uses `{x: number, y: number}` points (renamed from `{time, value}` — be aware of this in older code)

### TypeScript Notes

- Strict mode: `noUnusedLocals`, `noUnusedParameters` enforced
- Charts are generic over datum type `D`, style type `S`, and tooltip metadata `TM`
- `result-fn` `Result<T, E>` is used for error handling (prefer `onSuccess`/`onFailure` over direct unwrapping)
- D3 ESM packages require Babel transpilation in the app's Jest — configured in `packages/examples/jest.config.cjs`; the library's Jest maps d3 to its UMD build in the root `node_modules`
