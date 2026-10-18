module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {tsconfig: '<rootDir>/tsconfig.test.json'}]
  },
  // appease jest when using d3 (otherwise import * as d3 from 'd3')
  // (d3 is installed in the monorepo's root node_modules)
  moduleNameMapper: {
    "^d3$": "<rootDir>/../../node_modules/d3/dist/d3.min.js",
    "^d3-(.*)$": "<rootDir>/../../node_modules/d3-$1/dist/d3-$1.min.js"
  }
};
