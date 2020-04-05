import React from 'react';
import './App.css';
import StreamingRasterChart, {seriesFrom} from "./StreamingRasterChart";
import {Series} from "./Series";

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
      <StreamingRasterChart
          timeWindow={1000}
          seriesList={data}
          seriesHeight={15}
          plotWidth={900}
      />
    </div>
  );
};

export default App;
