module.exports = (api) => {
  if (api.env('development')) {
    return {
      sourceMaps: 'inline',
      presets: [
        ['@babel/env', {
          targets: 'current node'
        }]
      ]
    };
  }

  return {
    presets: [
      ['@babel/env', {
        targets: 'last 2 versions, maintained node versions, not dead',
        useBuiltIns: 'usage'
      }]
    ],
    plugins: ['@babel/plugin-transform-runtime', '@babel/plugin-proposal-class-properties']
  };
};
