module.exports = {
  reporters: ['default'],
  // the library's source (rather than its build), as in development (see vite.config.ts)
  moduleNameMapper: {
    '^stream-charts$': '<rootDir>/../stream-charts/src/index.ts',
  },
  // the Babel configuration is at the repo's root, so that it also applies to the library's source
  transform: {
    '^.+\\.[jt]sx?$': ['babel-jest', {rootMode: 'upward'}],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!d3|d3-array|internmap|delaunator|robust-predicates)',
  ],
};
