module.exports = {
  mode: 'production',
  devtool: false,
  entry: './src/index.ts',
  output: {
    filename: 'bundle.js',
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
  },
  module: {
    rules: [{ test: /\.tsx?$/, loader: 'ts-loader' }],
  },
  externals: {
    tslib: 'tslib',
    rxjs: 'rxjs',
    'rxjs/operators': 'rxjsOperators',
  },
};
