export function generateGroupLayout(groupName, screens = []) {
  const isDrawer = groupName === 'drawer';
  const navComponent = isDrawer ? 'Drawer' : 'Tabs';
  const importPath = isDrawer ? 'expo-router/drawer' : 'expo-router';
  const hasScreens = screens.length > 0 && !isDrawer;

  if (!hasScreens) {
    return [
      '// [VIRTUAL BLUEPRINT: GROUP LAYOUT]',
      `import { ${navComponent} } from '${importPath}';`,
      `export default function GroupLayout() {`,
      `  // CRITICAL: Prevent double-headers in Tabs/Drawer`,
      `  return <${navComponent} screenOptions={{ headerShown: false }} />;`,
      `}`,
    ].join('\n');
  }

  // Build Tabs.Screen entries with Feather icon placeholders
  const screenLines = screens
    .map((screen) => {
      const name = screen
        .replace(/^app\/(\(.*?\)\/)?/, '')
        .replace(/\.tsx$/, '');
      const title = capitalize(name);
      return (
        `    <Tabs.Screen\n` +
        `      name="${name}"\n` +
        `      options={{\n` +
        `        title: '${title}',\n` +
        `        // TODO: Replace 'circle' with an appropriate Feather icon name\n` +
        `        tabBarIcon: ({ color }) => <Feather name="circle" size={24} color={color} />,\n` +
        `      }}\n` +
        `    />`
      );
    })
    .join('\n');

  return [
    '// [VIRTUAL BLUEPRINT: DYNAMIC TABS LAYOUT]',
    `import { Tabs } from 'expo-router';`,
    `import { Feather } from '@expo/vector-icons';`,
    `export default function GroupLayout() {`,
    `  return (`,
    `    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#f97316' }}>`,
    screenLines,
    `    </Tabs>`,
    `  );`,
    `}`,
  ].join('\n');
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
