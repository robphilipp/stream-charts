import React from 'react';
import './App.css';
// import DygraphChart from "./DygraphChart";
import PlotlyChart from "./PlotlyChart";

const App: React.FC = () => {
  return (
    <div className="App">
      {/*<DygraphChart/>*/}
      <PlotlyChart/>
    </div>
  );
};

export default App;
