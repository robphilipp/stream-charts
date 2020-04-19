import React from 'react';
import '../styles/App.css';
import StreamingRasterChart from "./examples/StreamingRasterChart";
import {Series, seriesFrom} from "./charts/datumSeries";
import { StreamingScatterChart } from './examples/StreamingScatterChart';
import LineChart from "./charts/LineChart";

// function genData(length: number, timeDelta: number): Array<Datum> {
//     const data: Array<Datum> = Array.from({length: length}, () => ({time: 0, value: Math.random()}));
//     for(let i = 1; i < length; ++i) {
//         data[i] = {time: data[i - 1].time + Math.ceil(Math.random() * timeDelta), value: data[i - 1].value}
//     }
//     return data;
// }

// const data: Array<Series> = Array.from({length: 50}, (_, i) => seriesFrom(`neuron-${i}`, []));
const data: Array<Series> = Array.from({length: 50}, (_, i) => seriesFrom(`neuron-${i}`));

const App: React.FC = () => {
  return (
    <div className="App">
      <p>Raster Chart</p>
        <StreamingScatterChart
          timeWindow={1000}
          seriesList={Array.from({length: 50}, (_, i) => seriesFrom(`neuron-${i}`))}
          plotHeight={500}
          plotWidth={900}
        />
        <StreamingRasterChart
            timeWindow={1000}
            seriesList={data}
            seriesHeight={12}
            plotWidth={900}
        />
    </div>
  );
};

export default App;
