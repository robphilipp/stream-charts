import React from 'react';
import './App.css';
// import DygraphChart from "./DygraphChart";
// import PlotlyChart from "./PlotlyChart";
// import NumberSpinner from "./NumberSpinner";
// import NumberSpinnerDriver from "./NumberSpinner2";
import NumberSpinnerDriver3, {Datum, Series, seriesFrom} from "./NumberSpinner3";

// const data = Array.from({length: 5000}, () => Math.floor(Math.random() * 10));

function genData(length: number, timeDelta: number): Array<Datum> {
    const data: Array<Datum> = Array.from({length: length}, () => ({time: 0, value: Math.random()}));
    for(let i = 1; i < length; ++i) {
        data[i] = {time: data[i - 1].time + Math.ceil(Math.random() * timeDelta), value: data[i - 1].value}
    }
    return data;
}

// const data: Array<Series> = [
//     seriesFrom('neuron-1', genData(2, 10)),
//     seriesFrom('neuron-2', genData(2, 10)),
//     seriesFrom('neuron-3', genData(2, 10)),
//     seriesFrom('neuron-4', genData(2, 10)),
// ];
const data: Array<Series> = Array.from({length: 100}, (_, i) => seriesFrom(`neuron-${i}`, genData(2, 10)));

const App: React.FC = () => {
  return (
    <div className="App">
      {/*<DygraphChart/>*/}
      {/*<PlotlyChart/>*/}
      {/*<NumberSpinner data={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]}/>*/}
      {/*<NumberSpinnerDriver data={data}/>*/}
      {/*<NumberSpinnerDriver3 timeWindow={1000} data={genData(2, 10)}/>*/}
      <NumberSpinnerDriver3 timeWindow={500} seriesList={data} seriesHeight={10} plotWidth={900}/>
    </div>
  );
};

export default App;
