import React from 'react';
import './App.css';
// import DygraphChart from "./DygraphChart";
// import PlotlyChart from "./PlotlyChart";
// import NumberSpinner from "./NumberSpinner";
// import NumberSpinnerDriver from "./NumberSpinner2";
// import NumberSpinnerDriver3, {Datum, Series, seriesFrom} from "./NumberSpinner3";
import RasterChartDriver, {Datum, Series, seriesFrom} from "./RasterChartDriver";
// import NumberSpinner4, {Datum, Series, seriesFrom} from "./NumberSpinner4";
// import NumberSpinner5, {Datum, Series, seriesFrom} from "./NumberSpinner5";
// import NumberSpinner5 from "./NumberSpinner5";

// const data = Array.from({length: 5000}, () => Math.floor(Math.random() * 10));

function genData(length: number, timeDelta: number): Array<Datum> {
    const data: Array<Datum> = Array.from({length: length}, () => ({time: 0, value: Math.random()}));
    for(let i = 1; i < length; ++i) {
        data[i] = {time: data[i - 1].time + Math.ceil(Math.random() * timeDelta), value: data[i - 1].value}
    }
    return data;
}

const data: Array<Series> = Array.from({length: 50}, (_, i) => seriesFrom(`neuron-${i}`, genData(2, 10)));

const App: React.FC = () => {
  return (
    <div className="App">
      {/*<DygraphChart/>*/}
      {/*<PlotlyChart/>*/}
      <p>Raster Chart</p>
      <RasterChartDriver timeWindow={1000} seriesList={data} seriesHeight={15} plotWidth={900}/>
    </div>
  );
};

export default App;
