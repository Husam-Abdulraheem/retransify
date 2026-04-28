export function generateGroupLayout(groupName) {
  const navComponent = groupName === 'tabs' ? 'Tabs' : 'Drawer';
  const importPath =
    groupName === 'drawer' ? 'expo-router/drawer' : 'expo-router';

  return [
    '// [VIRTUAL BLUEPRINT: GROUP LAYOUT]',
    `import { ${navComponent} } from '${importPath}';`,
    `export default function GroupLayout() {`,
    `  // CRITICAL: Prevent double-headers in Tabs/Drawer`,
    `  return <${navComponent} screenOptions={{ headerShown: false }} />;`,
    `}`,
  ].join('\n');
}
