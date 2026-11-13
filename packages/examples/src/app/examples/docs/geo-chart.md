### the geo chart

The geo chart plots events from sensors at places on the earth – on a globe, or on a flat map in one of eleven projections. Each event says which sensor reported it, where (a latitude and longitude), when, and what it reported (its *payload*). The chart shows either each event as it arrives, or *aggregates*: the events rolled up by place, by sensor, or by the cells of a grid, with counts and measures of what they reported.

#### what you're looking at

<figure>
    <img src="./images/geo-chart.png" alt="The geo chart example, zoomed into London: the towers of six carriers, as dots in the carriers' colors, and the magenta blips of the phones' estimated locations, trailing between them, the older ones fading, with rings flashing out from the newest, and a legend of the carriers">
    <figcaption>
        <b>Figure 14</b> The geo chart after running for a minute and a half, zoomed into London. The colored dots are the six carriers' towers, each the pings it received, sized by their signal's strength. The magenta blips are the phones' locations, estimated from the towers – each phone leaves a trail, the older blips fainter – and the rings are the newest locations flashing (magenta), and the phones' actual places (small, orange).
    </figcaption>
</figure>

The example simulates a cell network, and the phones on it:

- **six carriers** (made up: Aurora Mobile, Meridian Wireless, Polaris Telecom, Zenith Cellular, Harbor Networks, and Summit Connect), each with nine **towers** around each of 20 major cities – and 100 more towers in five more European cities (Rome, Amsterdam, Vienna, Warsaw, and Stockholm), where four of the carriers have five towers each, as regional networks aren't everywhere,
- **phones**, two for each carrier in each city, moving around the city – and ten times a tick (200 times a second), a phone **pings** the tower serving it (its carrier's nearest), and reports how far it is from its carrier's four nearest towers.

Each carrier is a series, with its own color and legend entry – hover over a carrier in the legend, and the map highlights its towers, drawn over the others, which are muted, as are the other carriers' wedges in the pies (and over *Phones (located)*, the phones). *Wired to:* the plot's `hoveredSeries` property, set to `highlight` (by default, `isolate`, it shows the hovered series alone). A ping is an event at its tower: its **sensor is the tower** (e.g. `AUR-LON-2`, Aurora's second tower in London), and its payload holds what the network knows about it – the carrier, the phone (an anonymized device ID, and its type, from an iPhone to an IoT module), the event (data, a call, a text, a handover, or a dropped call), the network (5G, LTE, or 3G, its band, and the tower's sector: which of its three antennas, each covering a third of the circle, faces the phone), the signal's strength (in dBm) and quality (SINR, in dB), the phone's distance from the tower (from the timing advance), and – since it's simulated – where the phone actually is.

From each report, the example **locates the phone by trilateration**: the one place whose distances from the four towers best match the ones the phone reported. How precisely depends on where the towers are, as well as on how precise the distances are: towers all to one side of the phone pin it down poorly. So each location says how far off it's expected to be (typically 50 m or so), and one expected to be off by more than 300 m is dropped, as a network would. So is one that isn't in the sector the phone pinged through: when the towers are nearly in a line, their distances also fit a place on the wrong side of them, a mirror image of the right one, and the sector tells the two apart. The locations are the last series, *Phones (located)*: an event at the estimated location, whose sensor is the phone. So each phone leaves a trail of blips, its newest the brightest – where it is now – and each new one **flashes**: a ring that grows from it and fades. And because the phones are simulated, the example knows where each one *actually* is (a real network wouldn't): it's in every event's payload, a second, smaller and shorter flash marks it in orange as the phone is located, and the location's tooltip says how far off the estimate is. Zoom in further to see the two flashes apart.

The view starts on the whole globe, where each city's towers and phones are a single dot: a city's towers are a few kilometers apart, so you have to zoom right in (hold shift while scrolling, up to 2,000 times) to see them, and the phones moving among them. Drag the globe to turn it, and zoom about the mouse, so the place under it stays put. On a flat map, dragging pans the map instead (north and south, too, once you've zoomed in). The view stays where you left it when you switch to another tab and back (a page refresh starts over, on the whole globe); **Reset** returns it to the whole globe, too.

Hover over a marker, with the tooltip on, and the tooltip shows a ping's carrier and tower, when it happened, its phone, event, network, signal, and distance – or a phone's location, and how well it fits – and a sparkline over time, with this one marked, and axes: the tower's signal strengths, or the phone's location's accuracy. Unlike the other charts, the geo chart's tooltip also works *while the chart is running*: hovering pauses the auto-rotation, and an event's marker stays where it is – even a moving phone's, since each blip is its own event at its own place.

The markers are circles on the earth, shaped by the projection just like the land: they flatten toward the edge of the globe, and stretch toward the poles of a Mercator map.

#### clusters, by zoom

With 200 pings a second, the globe, seen whole, would be a blur of overlapping markers: a city's towers and phones are a few kilometers apart, and a few kilometers is a fraction of a pixel. So **Show** starts on *Auto (by zoom)*: from afar, the chart shows *clusters* – the pings rolled up into the cells of a grid, drawn as pies, a wedge per carrier, sized by their number of pings – and as you zoom in, the clusters come apart, into smaller clusters, and then into the towers and the phones themselves.

The data source keeps four roll-ups of the pings, with cells of 10°, 1°, 0.1°, and 0.01° (about a kilometer), and at each zoom the chart shows the coarsest whose cells span at most 20 pixels on the screen – what's merged couldn't be told apart anyway. Once even the 0.01° cells would span more, it shows the events. (Near the boundaries, it keeps showing what it shows a little past them, so it doesn't flicker as you zoom.) The phones' locations aren't clustered – they'd be half of every cluster, since each ping comes with one – but they flash, from afar too, and show once you're zoomed in to the events. *Wired to:* the plot's `auto` mode, its `autoRollups` and `clusterDistance` properties, and the roll-ups' cells' sizes (`byGridCell`'s).

The flashes calm down from afar, too: flashes of the same color and length that start within one flash's length of each other, close together on the screen, are drawn as one ring, wider the more it stands for – so each city pulses steadily, rather than flashing ring over ring. *Wired to:* the `mergeDistance` of the plot's `flash` property.

#### aggregates

<figure>
    <img src="./images/geo-aggregates.png" alt="The geo chart showing aggregates: a circle at each tower, sized by its number of pings, and colored by their mean signal strength, from red (weak) to yellow (strong), with a key for the sizes and the colors in the bottom-right corner">
    <figcaption>
        <b>Figure 15</b> The same data, rolled up "by tower": one circle per tower, its area showing how many pings it received, and its color their mean signal strength – red for weak, yellow for strong. The key, in the corner, says what the sizes and colors mean.
    </figcaption>
</figure>

Switch **Show** to *Aggregates* and, instead of the events, the chart shows one of the data source's *roll-ups*. A roll-up puts every event into a cell, and keeps a count, and some measures, for each cell. The example has five:

- **Pings by tower** – each tower's pings, broken down by the kind of phone.
- **Pings by city** – all of a city's pings, from all its towers, at the city's center, broken down by carrier. (A roll-up's cells can be anything you like: here, a function looks up each tower's city.)
- **Weak signals by tower** – only the pings whose signal is weaker than −110 dBm, by tower, broken down by technology (5G, LTE, or 3G).
- **Phones, where they are** – each phone's locations, drawn where it was last located, so its circle follows the phone, broken down by carrier.
- **10° grid** – all the pings in each 10° by 10° cell of a grid, drawn as the cells themselves, broken down by carrier.

Switch **Show** to *Aggregates, by group*, and each circle is divided into a wedge per group – per kind of phone, per carrier, or per technology, depending on the roll-up. A wedge's angle is its group's share of the cell's events, and its color is the group's own measure (picked in **Color by**) – so in "Pings by city", each city's circle shows which carrier has the most traffic there, and how good each one's signal is. With **Color by** set to *Nothing*, the wedges get their group's color instead: the carriers' colors, a color for each technology, and, for the kinds of phone, the plot's categorical colors. Hover over a wedge, and the tooltip highlights its group, with the group's own measures. A cell that's one sensor's events – a tower's, or a phone's – gets a sparkline of them over time. *Wired to:* the tooltip content's `sparklineValueOf` property.

The pings' roll-ups have four measures, each made a different way:

- **mean signal** and **weakest signal** (in dBm) – the library's `meanOf` and `minOf`;
- **drop rate** – the share of the calls that dropped: a measure of the example's own, with `reduceOf`, which keeps a count of the calls and of the drops as pings arrive and leave;
- **median distance** (in km) – how far the phones are from the towers: a measure of the example's own, with `measureOf`, since a median has to be found from all of a cell's pings.

The phones' roll-up has its own: **mean accuracy** (in m), how well its locations fit the towers' distances – so **Color by** lists the roll-up's own measures. The colors go from yellow to red toward the bad end: red is a weak signal, or a high drop rate. A circle's area shows its number of events. The tooltip lists the counts of events and sensors, the time span, the measures (in their units), and the breakdown.

The data source keeps its roll-ups up to date as events arrive *and as they're dropped*, so a roll-up always covers exactly the events the chart holds. And because it's the data source that keeps them, they keep up while you're on another tab, and switching roll-ups is instant.

#### controls just for this chart

<figure>
    <img src="./images/geo-controls.png" alt="The geo chart's expanded control panel, with the controls just for the geo chart outlined: size by signal and color by signal; the show, roll-up, and color-by drop-downs; and the projection, graticule, borders, fade older, flash located, flash actual, and auto-rotate controls" width="460px">
    <figcaption>
        <b>Figure 16</b> The geo chart's control panel, opened with the expand button. The outlined controls are just for the geo chart, and the rest are the common controls (see the common controls page).
    </figcaption>
</figure>

The second control bar, **View Controls**, holds what the map shows, how it sizes and colors it, and what it frames, and how the events age and flash. Its header shows them as icons: what's shown (dots for the events, circles for the aggregates, a pie for the aggregates by group, and a pie coming apart into dots for *Auto*), size and color by signal, the focus, and fade older, flash located, and flash actual, grayed out when off. Hover over an icon for its name.

- **Show** – *Auto (by zoom)*, the default, *Events*, *Aggregates*, or *Aggregates, by group*. *Wired to:* the plot's `mode` property (`auto`, with its `autoRollups`), and, for the aggregates by group, its `aggregates`' `shape` (`pies`) and `groupColors`.
- **Roll-up** – Which roll-up to show, in the aggregates mode. *Wired to:* the plot's `rollup` property (the names come from the data source's `rollups` option).
- **Color by** – What colors the aggregates: nothing, their count, or one of the roll-up's measures. *Wired to:* the `colorBy` of the plot's `aggregates` property, and its `colorScheme` (red toward the bad end).
- **size by signal** – Sizes each ping's marker by its signal's strength: the stronger, the larger. (A phone's location is always a small blip.) Only the events are sized and colored by their signal, so it's disabled when **Show** is *Aggregates* or *Aggregates, by group* – and in *Auto*, its icon is grayed out while the clusters show, until you zoom in to the events (the plot's `onAutoRollupChange` says which). *Wired to:* the plot's `radiusOf` property.
- **color by signal** – Colors a weak signal (below −110 dBm) red, and a fair one (below −100 dBm) orange; the rest keep their carrier's color. Only the events are sized and colored by their signal, so it's disabled when **Show** is *Aggregates* or *Aggregates, by group* – and in *Auto*, its icon is grayed out while the clusters show, until you zoom in to the events (the plot's `onAutoRollupChange` says which). *Wired to:* the plot's `colorOf` property.
- **Focus** – What the view frames, when it first shows and when it's reset: the whole earth, Europe, the United Kingdom, London, or the United States. *Wired to:* the plot's `fitTo` property (a country's outline, or a box of longitudes and latitudes).
- **fade older** – Fades the events (and the aggregates) as they age, over 30 seconds. *Wired to:* the plot's `fade` property.
- **flash located** – Flashes each phone's new (estimated) location as it arrives: a ring that grows from it and fades, over a second and a half. *Wired to:* the plot's `flash` property: its `duration`, and its `which` (only the phones' locations flash).
- **flash actual** – Flashes, briefly, the place where each phone actually is, as it's located: a small orange ring. *Wired to:* the `which` of the plot's `flash` property, which gives each location a second flash, with its own place (the payload's `phoneLatitude` and `phoneLongitude`), radius, duration, and color.

The rest are in the main control bar. Its header shows the projection's kind as an icon (a globe for the azimuthal projections, a grid for the cylindrical ones, an oval for Natural Earth and Equal Earth, a fan for the conic ones, and frames for Albers USA), and then the options – the graticule, the map's layers (the countries and borders, or, with Albers USA, the United States' states, rivers, cities, and roads), and auto-rotate – grayed out when off. Hover over an icon for its name:

- **Projection** – The map projection: the orthographic projection (the globe), the other azimuthal projections, one of the flat ones, from Mercator to Equal Earth, or Albers USA – a *composite* of three projections, the lower 48 states with Alaska and Hawaii moved in. A composite can't be turned, so its view shifts (dragging slides the map, like a picture) and zooms, framing the United States (and only its outline is drawn: each of a composite's parts shows a rectangle around it, which would show its neighbors, too). *Wired to:* the plot's `projection` property (and its `viewMode`, which a composite projection sets to `shift`).
- **states & counties** – Shown only with the Albers USA projection: draws the borders between the states, and, from 3 times in, between the counties, with their names where they fit (the counties' from 5 times in). From the Census Bureau's cartographic boundaries (the `us-atlas` package), loaded only when first shown. *Wired to:* the plot's `layers` property: lines for the borders, and layers of labels alone (no fill or outline) for the names, the counties' with a `minZoom`.
- **rivers** – Shown only with the Albers USA projection: draws the United States' smaller rivers (Natural Earth's 1:10m North American rivers), more of them as the view zooms in. *Wired to:* the plot's `layers` property: lines, a layer for each of Natural Earth's ranks, each with its `minZoom`.
- **cities** – Shown only with the Albers USA projection: draws the United States' cities (Natural Earth's populated places) as dots, named where the names don't overlap: the largest at first, and more as the view zooms in. *Wired to:* the plot's `layers` property: a layer of points (with a `pointRadius`), its data by zoom, the most important cities first.
- **roads** – Shown only with the Albers USA projection: draws the United States' highways (from Natural Earth's 1:10m roads): the interstates over the other federal and state highways, and the least important of those only from 3 times in. They're loaded (as a chunk of their own, about 440 kB compressed) only when first shown. *Wired to:* the plot's `layers` property: three layers of lines, the minor roads' with a `minZoom`.
- **countries** – Tints the countries by their number of towers (a choropleth), and names those with towers, where their names fit. *Wired to:* the plot's `layers` property: a layer whose `fill` and `label` are functions of the country.
- **graticule** and **borders** – The lines of latitude and longitude, and the borders between countries. *Wired to:* the plot's `showGraticule` and `borders` properties.

With Albers USA, the lakes are drawn over the land in the ocean's color (Natural Earth's outlines count them as land: Lake Michigan, for one), and the United States' coast sharpens as the view zooms in: Natural Earth's 1:50m outline, and from 2 times in its 1:10m outline (loaded only when Albers USA is first shown). Shifting the view stays quick however much is drawn, since the plot projects the map once and each view only scales and slides it.

The map itself changes with the zoom: zoomed out, it's Natural Earth's 1:110m map, and from 6 times in, its 1:50m map – about seven times as detailed, and loaded only when the chart first shows. *Wired to:* the plot's `basemap`, `borders`, and `layers`, each given both versions, with the zoom from which each is drawn.
- **auto-rotate** – Turns the globe by itself, at 6° a second, pausing while you drag it or hover over an event. *Wired to:* the plot's `autoRotate` property.

There's no **Cadence**, **Update Lag**, or tracker here – the geo chart has no time axis. The **RegEx filter** filters the events' series – and, in *Auto*, the clusters too, so that zooming in or out shows the same carriers; a roll-up shown on its own (in *Aggregates*) decides for itself which events it takes (the "weak signals" roll-up, for example, and the phones', which takes only the locations). *Wired to:* the chart's `seriesFilter`, which the plot hands the data source's `aggregates` in the auto mode. And the legend only shows with the events – the aggregates have their keys instead.

With 200 pings a second, the chart holds about 40,000 events after its first 100 seconds, so its **Buffering** starts at 200 ms: the new events are drawn in batches, five times a second, and the flashes animate smoothly in between (the plot keeps what it drew, and draws only the rings over it). Shorter buffering redraws more often, and leaves less time for everything else.

#### where the code lives

The example (yours to copy, change, or ignore):
- `src/app/examples/StreamingGeoChart.tsx` – the control bars, and the chart itself
- `src/app/examples/appstate/geoChartStore.ts` – the example's state, its data source, and the data source's roll-ups
- `src/app/examples/dataproviders/cellTowerData.ts` – the random cell network: its towers, its phones, their pings, and the trilateration that locates the phones
- `src/app/examples/dataproviders/worldMap.ts` – the map: the land and the borders, from the [world-atlas](https://github.com/topojson/world-atlas) package (converted from TopoJSON with [topojson-client](https://github.com/topojson/topojson-client))
- `src/app/examples/controls/ProjectionControl.tsx`, `src/app/examples/controls/FocusControl.tsx`, and `src/app/examples/controls/GeoAggregateControls.tsx` – the controls just for this chart

The library (what you'd use in your own application):
- `<Chart>`, `<GeoPlot>`, `<Legend>`, `<Tooltip>` with `<GeoPlotTooltipContent>`
- `GeoDataSource` – holds the events, and keeps the roll-ups (made with `bySensor`, `byGridCell`, or a function of your own, and measures like `meanOf` and `minOf`, or your own with `reduceOf` and `measureOf`)

The library doesn't come with a map: you hand the plot the land, the borders, and any other layers you want, at the levels of detail you want, as GeoJSON.
