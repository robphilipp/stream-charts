module.exports = {
  reporters: ['default'],
  transformIgnorePatterns: [
    '/node_modules/(?!d3|d3-array|internmap|delaunator|robust-predicates)',
  ],
  globals: {
    'ts-jest': {
      isolatedModules: true,
    },
  },
};