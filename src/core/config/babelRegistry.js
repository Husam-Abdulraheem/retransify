export const BABEL_REGISTRY = {
  // Library name in package.json : Plugin name in babel.config.js

  // 1. Common libraries that require a Plugin
  'react-native-reanimated': {
    plugin: 'react-native-reanimated/plugin',
    isLast: true, // This library must always be at the end of the list
  },
  nativewind: {
    plugin: 'nativewind/babel',
  },
  'react-native-dotenv': {
    plugin: [
      'module:react-native-dotenv',
      {
        moduleName: '@env',
        path: '.env',
      },
    ],
  },
  'expo-router': {
    // Sometimes require special settings, can be added here
    plugin: 'expo-router/babel',
  },

  // You can add hundreds of libraries here in the future without modifying core code
};
