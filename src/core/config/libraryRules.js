// src/core/config/libraryRules.js

export const CONFLICT_MAP = {
  // Routing: Expo Router overrides all web or classic routing
  'expo-router': [
    '@react-navigation/native',
    'react-router-dom',
    'react-router',
    '@react-navigation/stack',
    '@react-navigation/bottom-tabs',
  ],

  // Styling: NativeWind overrides complex CSS-in-JS styling libraries
  nativewind: [
    'styled-components',
    'emotion',
    '@emotion/native',
    'styled-components/native',
  ],
  twrnc: ['nativewind', 'styled-components'],

  'react-native-reanimated': [],
};

// Libraries that rely entirely on the browser DOM and must be completely blocked
export const WEB_ONLY_BLOCKLIST = [
  '@radix-ui/react-accordion',
  '@radix-ui/react-dialog',
  '@radix-ui/react-popover',
  '@radix-ui/react-tooltip',
  'framer-motion',
  'bootstrap',
  'react-bootstrap',
  'reactstrap',
  '@mui/material',
  'jquery',
  'react-helmet',
];
// Note: clsx, tailwind-merge, and cva were kept because they work successfully on mobile

// Pre-installed libraries in the default Expo template (do not install again)
export const COMMON_DEPENDENCIES = [
  'react',
  'react-native',
  'expo',
  'expo-status-bar',
  'react-native-safe-area-context',
  'react-native-screens',
  'expo-router',
  'expo-linking',
  'expo-constants',
  'expo-image',
  'babel-plugin-module-resolver',
];

// Mandatory mapping (Legacy/Web -> Expo)
export const LEGACY_TO_EXPO_MAP = {
  // Routing
  'react-router-dom': 'expo-router',
  'react-router-native': 'expo-router',
  '@react-navigation/native': 'expo-router',
  '@react-navigation/stack': 'expo-router',
  '@react-navigation/bottom-tabs': 'expo-router',

  // Icons
  'lucide-react': 'lucide-react-native',
  'react-icons': '@expo/vector-icons',
  'react-native-vector-icons': '@expo/vector-icons',

  // Storage and Services
  uuid: 'expo-crypto',
  '@react-native-community/async-storage':
    '@react-native-async-storage/async-storage',
  'async-storage': '@react-native-async-storage/async-storage',
  localforage: '@react-native-async-storage/async-storage',
  '@react-native-community/netinfo': '@react-native-community/netinfo',

  // Expo modules (Mandatory replacement to avoid Native Linking issues)
  'expo-permissions': 'expo-modules-core',
  'expo-app-loading': 'expo-splash-screen',
  'react-native-linear-gradient': 'expo-linear-gradient',
  'react-native-fs': 'expo-file-system',
  'react-native-device-info': 'expo-device',
  'react-native-camera': 'expo-camera',
  'react-native-share': 'expo-sharing',
  'react-native-clipboard/clipboard': 'expo-clipboard',
  '@react-native-community/clipboard': 'expo-clipboard',

  // Libraries that work as-is in the mobile environment
  'react-native-webview': 'react-native-webview',
  'react-native-maps': 'react-native-maps',
  'react-native-svg': 'react-native-svg',
  'lottie-react-native': 'lottie-react-native',

  // Strict Denylist (Removed because AI will replace their code with View and Text)
  'react-native-web': null,
  'react-dom': null,
  'prop-types': null,
};
