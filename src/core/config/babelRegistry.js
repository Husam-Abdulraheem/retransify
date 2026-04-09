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
};
