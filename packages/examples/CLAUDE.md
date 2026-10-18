# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Vite dev server with HMR
npm run build      # Production build
npm run lint       # Run ESLint
npm run test       # Run all Jest tests
npm run test -- path/to/test.test.ts  # Run a single test file
npm run preview    # Preview production build
```

## Architecture Overview

This is a React + D3 demonstration app for the `stream-charts` library, showcasing real-time streaming data visualization. Charts receive RxJS Observables and render continuously updated SVG via D3.

### Data Flow

```
randomXxxData.ts  →  RxJS Observable<TimeSeriesChartData>
                   →  Chart.tsx (manages subscriptions, creates SVG)
                   →  Context Providers (axes, dimensions, mouse, tooltip, data)
                   →  Plot components (ScatterPlot, RasterPlot, BarPlot, PoincarePlot)
                   →  D3 directly mutates SVG elements
```

### Provider/Hook Pattern

`Chart.tsx` wraps all children in stacked context providers: `PlotDimensionsProvider → CanvasSurfaceProvider → AxesProvider → InteractionProvider` (mouse handlers, tooltip, hovered series) `→ ChartDataContext` (data source, initial data, streaming settings) `→ ChartProvider`. Plot components and axes consume these via `useChart()`, `usePlotDimensions()`, `useDataSource()`/`useInitialData()`/`useStreamingSettings()`, `useHoveredSeries()`, etc. — never via prop drilling. The public API is `src/app/charts/index.ts`.

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

- `src/app/charts/` — All chart internals (axes, plots, hooks, providers, series, observables, legends, trackers, tooltips, subscriptions, styling)
- `src/app/examples/` — Full working chart examples (`StreamingScatterChart`, `StreamingRasterChart`, `StreamingBarChart`, `StreamingPoincareChart`) plus random data generators
- `src/app/ui/` — Generic UI components (Toggle, Button, Checkbox, Tabs) and theme definitions

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
- D3 ESM packages require Babel transpilation in Jest — configured in `jest.config.cjs`
