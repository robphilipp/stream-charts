### theming

Flip the **light**/**dark** switch in the top-right corner, and everything changes color: the page, the control bars, the charts' axes and backgrounds, the series, the tooltips, the legends, and even these pages. That works even while a chart is paused. The chart redraws itself in the new colors right away.

How that works is worth knowing before you build your own charts, because the theming is split between the example and the library. The *example* has themes. The *library* doesn't. It has colors.

#### the library: colors, not themes

There's no theme object in the [stream-charts](https://www.npmjs.com/package/stream-charts) library. Instead, every part of a chart takes its colors as properties:

| component                         | its colors come from                                                                 |
|-----------------------------------|--------------------------------------------------------------------------------------|
| `<Chart>`                         | `color` (the axes, their ticks and labels) and `backgroundColor`                      |
| the series                        | the chart's `seriesStyles` – one style per series, with its `color` and `highlightColor` |
| `<ContinuousAxis>`, `<OrdinalAxis>` | the chart's `color`, unless you give the axis its own `font`                        |
| `<Tooltip>`                       | its `style` – `fontColor`, `backgroundColor`, `borderColor`, and their opacities     |
| `<Tracker>`                       | its `style` (the line) and `font` (the label)                                        |
| `<Legend>`                        | its `style` – `fontColor`, `backgroundColor`, and `borderColor`                       |
| `<BarPlot>`                       | its series styles (see `defaultBarSeriesStyle(color)`) – the bars, and the lines for the mean and min/max |
| `<OutlierPlot>`                   | the series' color (the line, and its bands), and `outlierMarkerColors`              |
| `<PoincarePlot>`                  | the series' colors, and `lineStartColor`/`lineEndColor` when colorizing the lines   |

The tooltip contents (the tables, the autocorrelation sparkline, and so on) draw in the tooltip's `fontColor`, so they follow the tooltip.

So to "theme" a chart, you pass it a different set of colors. When the colors change, the chart redraws in the new colors. There's nothing else to tell it.

#### the example: a theme, and a store to hold it

The example keeps its colors together in a `Theme`, defined in `src/app/ui/Themes.ts`:

```ts
export interface Theme {
    name: 'dark' | 'light'
    color: string                    // the text, lines, and borders
    backgroundColor: string          // the background
    disabledColor: string            // disabled text (and switched-off icons)
    disabledBackgroundColor: string  // disabled backgrounds
}
```

There are two of them, `lightTheme` and `darkTheme`. The current one lives in a zustand store (`src/app/examples/appstate/themeStore.ts`), and the light/dark switch replaces it. Every example reads the theme from the store and hands its colors to the library – for example, the scatter chart:

```tsx
<Chart color={theme.color} backgroundColor={theme.backgroundColor} ...>
    ...
    <Tooltip style={{fontColor: theme.color, backgroundColor: theme.backgroundColor, borderColor: theme.color}}>
```

Notice that a theme has only four colors, and none of them is for the series. The series' colors are chosen by each example, *based on the theme's name*. The scatter and raster examples pick a spread of reds and blues from d3's `interpolateRdBu`, with a different part of the range for each theme (see `colorFor` in `StreamingScatterChart.tsx`), and the Poincaré, bar, and outlier examples pick a color for each theme by hand:

```ts
color: theme.name === 'light' ? 'blue' : 'gray'
```

#### adding a new theme

Say you want a third theme – a warm, solarized-looking one. Here's what it takes.

1. **Define it.** Add its name to the `Theme` interface's `name`, and add the theme to `Themes.ts`:

   ```ts
   export interface Theme {
       name: 'dark' | 'light' | 'solarized'
       ...
   }

   export const solarizedTheme: Theme = {
       name: 'solarized',
       color: '#586e75',
       backgroundColor: '#fdf6e3',
       disabledColor: '#93a1a1',
       disabledBackgroundColor: '#eee8d5',
   }
   ```

2. **Give people a way to choose it.** The switch in the top-right corner is a two-way toggle (in `RootLayout`, in `src/app/routeComponents.tsx`), so a third theme needs a different control – a drop-down, say – that calls the store's `updateTheme(solarizedTheme)`.

3. **Choose its series colors.** Search for `theme.name` and `themeName`, and decide what each one should do for your theme. Most of them are a `light ? this : that` choice, so a new theme gets the *dark* theme's series colors until you say otherwise – which, on a light background, is probably not what you want. You'll find them in each `Streaming*Chart.tsx`, and in the drop-down's shadow (`src/app/ui/DropDown.tsx`).

4. **Theme these pages, if you like.** The code's highlighting colors are in `src/app/examples/docs/codeHighlighting.css`, one palette per theme name, and an image like `./images/navigation-bar.png` shows `navigation-bar-<theme name>.png` when there is one (falling back to the plain one when there isn't).

That's it. The library doesn't need to know a thing about it.

#### the limitations

- **No theme in the library.** The flip side of "it's all properties" is that you pass the colors to every component yourself. If you leave one out, it gets the library's default instead – and the defaults are a dark theme of their own (orange `#d2933f` on a near-black `#202020`, with teal `#008aad` series), so a forgotten tooltip or legend style shows up as a dark box on your light chart. If that bothers you, collect your colors into one object, as the example does, and spread it in.
- **Colors only.** Themes change colors. Fonts, font sizes, line widths, and margins stay as they are (each has its own property, if you want to change it).
- **Four colors aren't many.** Everything else in the example is either derived from those four (the buttons' tints, for instance, mix the text color into the background) or picked by the theme's name. A richer theme – say, one that sets the series colors too – means adding fields to `Theme`, and using them where the examples now check `theme.name`.
- **Some colors don't follow the theme.** The outlier example's marker colors (yellow, orange, and red) and the Poincaré example's colorized lines (which you pick yourself in the control bar) look the same in both themes. So do the library's defaults, wherever an example relies on one.
- **The page itself.** `src/styles/index.css` gives the page a dark background and orange text, underneath the app (the library's default colors, again). The example covers it with the theme's background, but if you embed the charts in your own page, your page's colors are yours to manage.
