# change history

## version 0.0.16 (control timing of subscription)
Previously, the charts subscribed to the rxjs observable upon mounting, and started consuming data. The default behaviour after this update is the same. However, now, using the `shouldSubscribe` property, you can control when the chart subscribes to the data.

## version 0.0.15 (replaced indexes with maps)
Switched the `ChartData` interface to use a map of series names to new series data, rather than relying on indexes. Now a map with the series name and an array of `Datum` is all that's needed to update the chart. This removes the tedious bookkeeping required when using indexes. 

## version 0.0.14 (reduced size)
Failed attempts

## version 0.0.13 (reduced size)
Moved typescript to devDeps, moved react stuff to peerDeps.

## version 0.0.12 (reduced size)
Apparently github actions ignores the .npmignore file.

## version 0.0.11 (reduced size)
Added .npmignore to exclude images in docs and move deps to devDeps.

## version 0.0.10 (removed unused deps)
1. Removed unused dependencies

## version 0.0.9 (user docs, cleaning, refactoring)
1. Added user docs (more to come)
2. Refactored a few things to clean up the code
3. Cleaned up a few unused props

## version 0.0.8 (suppressed warning)
Suppressed react-hook warning about exhaustive deps and added comment describe why this is needed and ok.

## version 0.0.7 (updates for npm)
1. Added repo information to the package.json for publishing to npm
2. Removed the `private` field from package.json

## version 0.0.6 (fixed tests, cleaned up radial magnifier)
1. Fixed all the test conditions to use `expect` properly :)
2. Cleaned up the limiting condition for the radial magnifier.

## version 0.0.5 (raster magnifier ticks and labels; test)
1. Added ticks and labels for the time-axis of the bar-magnifier available in the raster chart.
2. Added a number of tests.

## version 0.0.4 (bug fixes)
1. Fixed raster chart controls so that when the magnifier is selected, and then the tooltip, the tooltip actually shows.
2. Cleaned up the raster-chart example

## version 0.0.3 (bug fixes)
1. Cleaned up a bunch of small bugs related to the selection of enhancements (tooltip, tracker, magnifier).
2. Updated the test application style.

## version 0.0.2 (basic functionality)
1. Added radial magnifier to the scatter chart; has axes in the lens
2. Added time to the tracker for the scatter and raster charts
3. Added regex filtering of series in the plot to reduce clutter
4. Exposed the rxjs observable and update callbacks
5. Updated the examples

## version 0.0.1 (initial release)