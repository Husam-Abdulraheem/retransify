export const BABEL_REGISTRY = {
  // اسم المكتبة في package.json : اسم البلاجن في babel.config.js
  
  // 1. المكتبات الشائعة التي تتطلب Plugin
  "react-native-reanimated": {
    plugin: "react-native-reanimated/plugin",
    isLast: true, // هذه المكتبة تتطلب أن تكون في آخر القائمة دائماً
  },
  "nativewind": {
    plugin: "nativewind/babel",
  },
  "react-native-dotenv": {
    plugin: [
      "module:react-native-dotenv",
      {
        "moduleName": "@env",
        "path": ".env",
      }
    ]
  },
  "expo-router": {
    // أحياناً تتطلب إعدادات خاصة، يمكن إضافتها هنا
    plugin: "expo-router/babel"
  },
  
  // يمكنك إضافة مئات المكتبات هنا مستقبلاً دون تعديل الكود الأساسي
};
