export function generateFallbackIndex() {
  return [
    '// [VIRTUAL BLUEPRINT: FALLBACK INDEX]',
    `import { View, Text } from 'react-native';`,
    `export default function Index() {`,
    `  return (`,
    `    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>`,
    `      <Text>No explicit route or App component found.</Text>`,
    `    </View>`,
    `  );`,
    `}`,
  ].join('\n');
}
