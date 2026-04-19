export const BABEL_REGISTRY = {
  'react-native-reanimated': {
    plugin: 'react-native-reanimated/plugin',
    isLast: true,
  },
  'react-native-dotenv': {
    plugin: [
      'module:react-native-dotenv',
      { moduleName: '@env', path: '.env' },
    ],
  },
  // Key matches npm package name so babelManager can find it in package.json dependencies
  'babel-plugin-module-resolver': {
    plugin: [
      'module-resolver',
      {
        root: ['./'],
        alias: {
          '@': './',
        },
      },
    ],
    isLast: false,
  },
};
