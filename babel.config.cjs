// the Babel configuration for Jest (the example app's tests, which also load the library's source)
module.exports = {
  presets: [
    ['@babel/preset-env', {targets: {node: 'current'}}],
    ['@babel/preset-typescript'],
    ['@babel/preset-react', {runtime: 'automatic'}],
  ],
};
