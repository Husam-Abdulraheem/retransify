// src/core/config/libraryRules.js

export const CONFLICT_MAP = {
  // التوجيه: إكسبو راوتر يلغي كل ما يخص توجيه الويب أو التوجيه الكلاسيكي
  'expo-router': ['@react-navigation/native', 'react-router-dom', 'react-router', '@react-navigation/stack', '@react-navigation/bottom-tabs'],
  
  // التنسيق: نيتف ويند يلغي مكتبات التنسيق المعتمدة على CSS-in-JS المعقدة
  'nativewind': ['styled-components', 'emotion', '@emotion/native', 'styled-components/native'],
  'twrnc': ['nativewind', 'styled-components'],
  
  'react-native-reanimated': [], 
};

export const WEB_ONLY_BLOCKLIST = [
  // مكتبات تعتمد كلياً على DOM المتصفح ويجب حظرها تماماً
  '@radix-ui/react-accordion', 
  '@radix-ui/react-dialog',
  '@radix-ui/react-popover',
  '@radix-ui/react-tooltip',
  'framer-motion', 
  // ملاحظة: تم إبقاء clsx و tailwind-merge و cva لأنها تعمل بنجاح في الموبايل
];

// المكتبات التي تأتي مثبتة مسبقاً مع قالب Expo الافتراضي (يُمنع تثبيتها مجدداً)
export const COMMON_DEPENDENCIES = [
    'react',
    'react-native',
    'expo',
    'expo-status-bar',
    'react-native-safe-area-context',
    'react-native-screens',
    'expo-router',       
    'expo-linking',      
    'expo-constants'     
];

// خريطة التحويل الإجبارية (Legacy/Web -> Expo)
export const LEGACY_TO_EXPO_MAP = {
    // التوجيه (Routing)
    'react-router-dom': 'expo-router',
    'react-router-native': 'expo-router',
    '@react-navigation/native': 'expo-router',
    '@react-navigation/stack': 'expo-router',
    '@react-navigation/bottom-tabs': 'expo-router',
    
    // الأيقونات
    'lucide-react': 'lucide-react-native', 
    'react-icons': '@expo/vector-icons',   
    'react-native-vector-icons': '@expo/vector-icons',
    
    // التخزين والخدمات
    'uuid': 'expo-crypto', 
    '@react-native-community/async-storage': '@react-native-async-storage/async-storage',
    'async-storage': '@react-native-async-storage/async-storage',
    'localforage': '@react-native-async-storage/async-storage', 
    '@react-native-community/netinfo': '@react-native-community/netinfo', 
    
    // وحدات إكسبو (الاستبدال الإجباري لتجنب مشاكل Native Linking)
    'expo-permissions': 'expo-modules-core', 
    'expo-app-loading': 'expo-splash-screen', 
    'react-native-linear-gradient': 'expo-linear-gradient',
    'react-native-fs': 'expo-file-system',
    'react-native-device-info': 'expo-device',
    'react-native-camera': 'expo-camera',
    'react-native-share': 'expo-sharing',
    'react-native-clipboard/clipboard': 'expo-clipboard',
    '@react-native-community/clipboard': 'expo-clipboard',
    
    // مكتبات تعمل كما هي في بيئة الموبايل
    'react-native-webview': 'react-native-webview', 
    'react-native-maps': 'react-native-maps', 
    'react-native-svg': 'react-native-svg', 
    'lottie-react-native': 'lottie-react-native', 
    
    // الممنوعات القاطعة (يتم إزالتها لأن الذكاء الاصطناعي سيستبدل كودها بـ View و Text)
    'react-native-web': null, 
    'react-dom': null,
    'prop-types': null, 
};