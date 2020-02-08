import React from 'react';
import './App.css';
// import DygraphChart from "./DygraphChart";
// import PlotlyChart from "./PlotlyChart";
import NumberSpinner from "./NumberSpinner";

const App: React.FC = () => {
  return (
    <div className="App">
      {/*<DygraphChart/>*/}
      {/*<PlotlyChart/>*/}
      <NumberSpinner data={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]}/>
    </div>
  );
};

export default App;
