// pure data/config for the routes -- no components here, so react-refresh's
// "only export components" rule (see routeComponents.tsx) doesn't apply to this file
import {initialRandomWeightData} from "./examples/dataproviders/randomWeightData.ts";
import {initialRandomSpikeData} from "./examples/dataproviders/randomSpikeData.ts";
import {SPIKE_MEAN_VALUE, SPIKE_VALUE_SPREAD} from "./examples/appstate/rasterChartStore.ts";
import {initialTentMapData} from "./examples/dataproviders/randomIterateData.ts";
import {initialBarDanceData} from "./examples/dataproviders/randomOrdinalData.ts";

/*
    Example data is generated once at module load so navigating between routes doesn't
    regenerate the random data (previously done at module scope in App.tsx).
 */
const seriesNames: Array<string> = []
for (let i = 0; i < 10; ++i) {
    seriesNames.push(`Series ${i}`)
}
export const initialScatterData = initialRandomWeightData(seriesNames, 10, 500, 50, 20, 100)
const iterateSeriesNames = seriesNames.slice(1, 2)
export const initialIterateData = initialTentMapData(25, new Map<string, number>(iterateSeriesNames.map(name => [name, Math.random() * 2])))

const spikeSeriesNames: Array<string> = []
for (let i = 0; i < 50; ++i) {
    spikeSeriesNames.push(`HC ${i + 1}`)
}
export const initialSpikeData = initialRandomSpikeData(spikeSeriesNames, 10, 200, 10, SPIKE_MEAN_VALUE, SPIKE_VALUE_SPREAD)
export const initialBarData = initialBarDanceData(spikeSeriesNames.slice(), 1000, 4)

/*
    The tabs, now driven by routes rather than the <Tabs> component's internal state.
 */
export type TabDef = {name: string, path: string}
export const TABS: Array<TabDef> = [
    {name: "Intro", path: "/intro"},
    {name: "Scatter", path: "/scatter"},
    {name: "Raster", path: "/raster"},
    {name: "Poincare", path: "/poincare"},
    {name: "Bar", path: "/bar"},
    {name: "Outlier", path: "/outlier"},
]
