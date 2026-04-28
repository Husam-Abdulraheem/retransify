export function generateRedirectIndex(groupName) {
  return [
    '// [VIRTUAL BLUEPRINT: REDIRECT INDEX]',
    `import { Redirect } from 'expo-router';`,
    `export default function Index() { return <Redirect href="/(${groupName})" />; }`,
  ].join('\n');
}
