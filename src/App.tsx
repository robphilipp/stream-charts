import React from 'react';
import './App.css';
// import DygraphChart from "./DygraphChart";
// import PlotlyChart from "./PlotlyChart";
// import NumberSpinner from "./NumberSpinner";
import NumberSpinnerDriver from "./NumberSpinner2";

const data = Array.from({length: 3000}, () => Math.floor(Math.random() * 10));

const App: React.FC = () => {
  return (
    <div className="App">
      {/*<DygraphChart/>*/}
      {/*<PlotlyChart/>*/}
      {/*<NumberSpinner data={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]}/>*/}
      <NumberSpinnerDriver data={data}/>
    </div>
  );
};

export default App;
