export function generateRootLayout(providers = []) {
  // 1. توليد استيرادات مزودات الحالة (Dynamic Imports)
  const providerImports = providers
    .map((p) => {
      if (p.isDefault) {
        return `import ${p.name} from '${p.source}';`;
      }
      return `import { ${p.name} } from '${p.source}';`;
    })
    .join('\n');

  // 2. توليد التغليف الديناميكي لمزودات الحالة (Dynamic Wrappers)
  let openingTags = '';
  let closingTags = '';

  providers.forEach((p) => {
    openingTags += `        <${p.name}>\n`;
    // إضافة وسم الإغلاق بالعكس للحفاظ على الترتيب الهرمي (LIFO)
    closingTags = `        </${p.name}>\n` + closingTags;
  });

  // 3. دمج إعداداتك الثابتة مع البيانات الديناميكية
  return [
    '// [VIRTUAL BLUEPRINT: ROOT LAYOUT]',
    `import "../nativewind";`,
    `import { Slot } from 'expo-router';`,
    `import { ThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native';`,
    `import { useColorScheme } from 'nativewind';`,
    `import { useEffect } from 'react';`,
    `import { Appearance } from 'react-native';`,
    `import { SafeAreaProvider } from 'react-native-safe-area-context';`,
    providerImports, // استيرادات الـ Contexts والـ Providers هنا
    ``,
    `export default function RootLayout() {`,
    `  const { colorScheme, setColorScheme } = useColorScheme();`,
    ``,
    `  // Sync initial system state with NativeWind`,
    `  useEffect(() => {`,
    `    const systemTheme = Appearance.getColorScheme();`,
    `    if (systemTheme) setColorScheme(systemTheme);`,
    `  }, []);`,
    ``,
    `  return (`,
    `    <SafeAreaProvider>`,
    `      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>`,
    openingTags, // فتح مزودات الحالة الديناميكية
    `          <Slot />`,
    closingTags, // إغلاق مزودات الحالة الديناميكية
    `      </ThemeProvider>`,
    `    </SafeAreaProvider>`,
    `  );`,
    `}`,
  ]
    .filter(Boolean)
    .join('\n');
}
