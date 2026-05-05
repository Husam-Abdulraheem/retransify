export function generateRootLayout(providers = []) {
  // 1. Generate state provider imports (Dynamic Imports)
  const providerImports = providers
    .map((p) => {
      if (p.isDefault) {
        return `import ${p.name} from '${p.source}';`;
      }
      return `import { ${p.name} } from '${p.source}';`;
    })
    .join('\n');

  // 2. Generate dynamic wrapping for state providers (Dynamic Wrappers)
  let openingTags = '';
  let closingTags = '';

  providers.forEach((p) => {
    openingTags += `        <${p.name}>\n`;
    // Add closing tags in reverse to maintain hierarchical order (LIFO)
    closingTags = `        </${p.name}>\n` + closingTags;
  });

  // 3. Merge your static settings with dynamic data
  return [
    '// [VIRTUAL BLUEPRINT: ROOT LAYOUT]',
    `import "../nativewind";`,
    `import { Slot } from 'expo-router';`,
    `import { ThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native';`,
    `import { useColorScheme } from 'nativewind';`,
    `import { useEffect } from 'react';`,
    `import { Appearance } from 'react-native';`,
    `import { SafeAreaProvider } from 'react-native-safe-area-context';`,
    providerImports, // Context and Provider imports go here
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
    openingTags, // Open dynamic state providers
    `          <Slot />`,
    closingTags, // Close dynamic state providers
    `      </ThemeProvider>`,
    `    </SafeAreaProvider>`,
    `  );`,
    `}`,
  ]
    .filter(Boolean)
    .join('\n');
}
