import path from 'path';
import fs from 'fs-extra';
export async function setupNativeWind(projectPath) {
  console.log('🌪️  Configuring NativeWind v4 Architecture...');

  // 1. إنشاء ملف global.css
  const cssPath = path.join(projectPath, 'global.css');
  if (!(await fs.pathExists(cssPath))) {
    await fs.writeFile(
      cssPath,
      `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n`
    );
    console.log('✅ Created global.css');
  }

  // 2. إنشاء metro.config.js الخاص بـ NativeWind
  const metroPath = path.join(projectPath, 'metro.config.js');
  if (!(await fs.pathExists(metroPath))) {
    const metroContent = `const { getDefaultConfig } = require("expo/metro-config");\nconst { withNativeWind } = require("nativewind/metro");\n\nconst config = getDefaultConfig(__dirname);\nmodule.exports = withNativeWind(config, { input: "./global.css" });\n`;
    await fs.writeFile(metroPath, metroContent);
    console.log('✅ Created metro.config.js for NativeWind');
  }

  // 3. إنشاء tailwind.config.js (مع الـ preset)
  const tailwindConfigPath = path.join(projectPath, 'tailwind.config.js');
  if (!(await fs.pathExists(tailwindConfigPath))) {
    const tailwindContent = `/** @type {import('tailwindcss').Config} */\nmodule.exports = {\n  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],\n  presets: [require("nativewind/preset")],\n  theme: { extend: {} },\n  plugins: [],\n};\n`;
    await fs.writeFile(tailwindConfigPath, tailwindContent);
    console.log('✅ Created tailwind.config.js (v4 preset)');
  }

  // 4. تحديث babel.config.js (كما فعلنا سابقاً)
  const babelConfigPath = path.join(projectPath, 'babel.config.js');
  if (await fs.pathExists(babelConfigPath)) {
    let babelContent = await fs.readFile(babelConfigPath, 'utf8');
    if (!babelContent.includes('jsxImportSource')) {
      babelContent = babelContent.replace(
        /presets:\s*\[\s*['"`]babel-preset-expo['"`]\s*\]/,
        `presets: [\n      ['babel-preset-expo', { jsxImportSource: "nativewind" }],\n      "nativewind/babel",\n    ]`
      );
      if (!babelContent.includes('react-native-reanimated/plugin')) {
        if (babelContent.includes('plugins: [')) {
          babelContent = babelContent.replace(
            /plugins:\s*\[/,
            "plugins: [\n      'react-native-reanimated/plugin',"
          );
        } else {
          babelContent = babelContent.replace(
            /(presets:\s*\[[\s\S]*?\],)/,
            "$1\n    plugins: [\n      'react-native-reanimated/plugin',\n    ],"
          );
        }
      }
      await fs.writeFile(babelConfigPath, babelContent);
      console.log('✅ Updated babel.config.js for NativeWind v4');
    }
  }

  // 5. إنشاء nativewind-env.d.ts الذكي
  const typesFilePath = path.join(projectPath, 'nativewind-env.d.ts');
  if (!(await fs.pathExists(typesFilePath))) {
    const dtsContent = `/// <reference types="nativewind/types" />\n\nimport 'react';\n\ndeclare module 'react' {\n  interface Attributes {\n    className?: string;\n  }\n}\ndeclare global {\n  namespace JSX {\n    interface IntrinsicAttributes {\n      className?: string;\n    }\n  }\n}\n`;
    await fs.writeFile(typesFilePath, dtsContent);
    console.log('✅ Created nativewind-env.d.ts');
  }
}
