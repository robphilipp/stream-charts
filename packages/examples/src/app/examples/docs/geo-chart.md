### the geo chart

The geo chart plots events from sensors at places on the earth – on a globe, or on a flat map in one of eleven projections. Each event says which sensor reported it, where (a latitude and longitude), when, and what it reported (its *payload*). The chart shows either each event as it arrives, or *aggregates*: the events rolled up by place, by sensor, or by the cells of a grid, with counts and measures of what they reported.

#### what you're looking at

<figure>
    <img src="./images/geo-chart.png" alt="The geo chart example: a globe with the land, the borders, and the graticule; purple seismic events, blue weather readings, and green trails of vessel reports, the older ones fading">
    <figcaption>
        <b>Figure 14</b> The geo chart after running for half a minute. The purple markers are seismic events, sized by their magnitude; the blue ones, wind speeds from weather stations; and the green trails, position reports from vessels at sea. The older the event, the fainter its marker.
    </figcaption>
</figure>

The example simulates a network of three groups of sensors:

- **seismic stations** around the Pacific "Ring of Fire" and a few other active zones, with two or three sensors at each site – so one quake is often reported by several sensors at the same place,
- **weather stations**, one in each of 26 cities, reporting wind speeds, and
- **vessels**, sensors that move: they sail back and forth along shipping routes, reporting their position and speed as they go.

Each group is a series, with its own color and legend entry. Every event's payload holds its kind, a reading (a quake's magnitude, a wind speed, or a vessel's speed), and a status – ok, a warning, or an alarm.

Drag the globe to turn it, and hold shift while scrolling to zoom – about the mouse, so the place under it stays put. On a flat map, dragging pans the map instead (north and south, too, once you've zoomed in). The view stays where you left it when you switch to another tab and back.

Hover over a marker, with the tooltip on, and the tooltip shows the event's series and sensor, where and when it happened, and its reading and status. Unlike the other charts, the geo chart's tooltip also works *while the chart is running* – the places don't move, so there's nothing to chase.

The markers are circles on the earth, drawn through the projection, so the projection shapes them just like the land: they flatten toward the edge of the globe, and stretch toward the poles of a Mercator map.

#### aggregates

<figure>
    <img src="./images/geo-aggregates.png" alt="The geo chart showing aggregates: circles at the sensor sites, sized by their number of events and colored by their peak reading, with a key for the sizes and the colors in the bottom-right corner">
    <figcaption>
        <b>Figure 15</b> The same data, rolled up "by location": one circle per place, its area showing how many events happened there, and its color the peak reading. The key, in the corner, says what the sizes and colors mean.
    </figcaption>
</figure>

Switch **Show** to *Aggregates* and, instead of the events, the chart shows one of the data source's *roll-ups*. A roll-up puts every event into a cell, and keeps a count, and some measures, for each cell. The example has four:

- **Events by location** – all the events at a place, whichever sensor reported them, broken down by sensor. At a seismic site, that's the site's total, and how many each of its sensors reported.
- **Events by sensor** – each sensor's events, wherever the sensor was. A vessel's circle follows the vessel.
- **Alarms and warnings by location** – only the events whose status isn't ok, by place, broken down by status.
- **10° grid** – all the events in each 10° by 10° cell of a grid, drawn as the cells themselves, broken down by series.

Each roll-up measures the *peak reading* and the *mean reading* of its events. A circle's area shows its number of events, and its color the measure picked in **Color by**. The tooltip lists the counts of events and sensors, the time span, the measures, and the breakdown.

The data source keeps its roll-ups up to date as events arrive *and as they're dropped*, so a roll-up always covers exactly the events the chart holds. And because it's the data source that keeps them, they keep up while you're on another tab, and switching roll-ups is instant.

#### controls just for this chart

<figure>
    <img src="./images/geo-controls.png" alt="The geo chart's expanded control panel, with the controls just for the geo chart outlined: size by magnitude and color by status; the show, roll-up, and color-by drop-downs; and the projection, graticule, borders, fade older, and auto-rotate controls" width="460px">
    <figcaption>
        <b>Figure 16</b> The geo chart's control panel, opened with the expand button. The outlined controls are just for the geo chart, and the rest are the common controls (see the common controls page).
    </figcaption>
</figure>

- **size by magnitude** – Sizes each event's marker by its reading: a quake's magnitude, a wind speed, or a vessel's speed, each scaled to a similar range of sizes. *Wired to:* the plot's `radiusOf` property.
- **color by status** – Colors warnings orange and alarms red; ok events keep their series' color. *Wired to:* the plot's `colorOf` property.
- **Show** – *Events* or *Aggregates*. *Wired to:* the plot's `mode` property.
- **Roll-up** – Which roll-up to show, in the aggregates mode. *Wired to:* the plot's `rollup` property (the names come from the data source's `rollups` option).
- **Color by** – What colors the aggregates: nothing, their count, or one of their measures. *Wired to:* the plot's `colorBy` property.
- **Projection** – The map projection: the orthographic projection (the globe), the other azimuthal projections, or one of the flat ones, from Mercator to Equal Earth. *Wired to:* the plot's `projection` property.
- **graticule** and **borders** – The lines of latitude and longitude, and the borders between countries. *Wired to:* the plot's `showGraticule` and `borders` properties.
- **fade older** – Fades the events (and the aggregates) as they age, over 30 seconds. *Wired to:* the plot's `fadeDuration` property.
- **auto-rotate** – Turns the globe by itself, at 6° a second, pausing while you drag it or hover over an event. *Wired to:* the plot's `autoRotate` property.

There's no **Cadence**, **Update Lag**, or tracker here – the geo chart has no time axis. The **RegEx filter** filters the events' series; a roll-up decides for itself which events it takes (the "alarms and warnings" roll-up, for example). And the legend only shows with the events – the aggregates have their keys instead.

#### where the code lives

The example (yours to copy, change, or ignore):
- `src/app/examples/StreamingGeoChart.tsx` – the control bar, and the chart itself
- `src/app/examples/appstate/geoChartStore.ts` – the example's state, its data source, and the data source's roll-ups
- `src/app/examples/dataproviders/randomGeoData.ts` – the random network of sensors
- `src/app/examples/dataproviders/worldMap.ts` – the map: the land and the borders, from the [world-atlas](https://github.com/topojson/world-atlas) package (converted from TopoJSON with [topojson-client](https://github.com/topojson/topojson-client))
- `src/app/examples/controls/ProjectionControl.tsx` and `src/app/examples/controls/GeoAggregateControls.tsx` – the controls just for this chart

The library (what you'd use in your own application):
- `<Chart>`, `<GeoPlot>`, `<Legend>`, `<Tooltip>` with `<GeoPlotTooltipContent>`
- `GeoDataSource` – holds the events, and keeps the roll-ups (made with `byLocation`, `bySensor`, `byGridCell`, and measures like `maxOf` and `meanOf`)

The library doesn't come with a map: you hand the plot the land and borders you want, at the level of detail you want, as GeoJSON.
