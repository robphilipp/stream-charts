module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // appease jest when using d3 (otherwise import * as d3 from 'd3')
  moduleNameMapper: {
    "d3": "<rootDir>/node_modules/d3/dist/d3.min.js",
    "^d3-(.*)$": "<rootDir>/node_modules/d3-$1/dist/d3-$1.min.js"
  }
};
