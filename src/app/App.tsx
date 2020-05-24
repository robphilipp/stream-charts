import React from 'react';
import '../styles/App.css';
import StreamingRasterChart from "./examples/StreamingRasterChart";
import {Series, seriesFrom} from "./charts/datumSeries";
import { StreamingScatterChart } from './examples/StreamingScatterChart';

const inputNeurons: Array<string> = Array.from({length: 5}, (_, i) => `in${i}`);
const outputNeurons: Array<string> = Array.from({length: 25}, (_, i) => `out${i}`);
const spikes: Array<Series> = inputNeurons.concat(outputNeurons).map(neuron => seriesFrom(neuron));
const weights: Array<Series> = inputNeurons.flatMap(input => outputNeurons.map(output => seriesFrom(`${input}-${output}`)));

const App: React.FC = () => {
  return (
    <div className="App" style={{backgroundColor: '#202020'}}>
      <p>Raster Chart</p>
        <StreamingScatterChart
          timeWindow={1000}
          seriesList={weights}
          plotHeight={500}
          plotWidth={900}
        />
        <StreamingRasterChart
            timeWindow={1000}
            seriesList={spikes}
            seriesHeight={20}
            plotWidth={900}
        />
    </div>
  );
};

export default App;
