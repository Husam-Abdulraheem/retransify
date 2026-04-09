import path from 'path';
import fs from 'fs-extra';
export async function setupNativeWind(projectPath) {
  console.log('🌪️  Configuring NativeWind v4 Architecture...');

  // 1.global.css
  const cssPath = path.join(projectPath, 'global.css');
  if (!(await fs.pathExists(cssPath))) {
    await fs.writeFile(
      cssPath,
      `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n`
    );
  }

  // 2. metro.config.js
  const metroPath = path.join(projectPath, 'metro.config.js');
  if (!(await fs.pathExists(metroPath))) {
    const metroContent = `const { getDefaultConfig } = require("expo/metro-config");\nconst { withNativeWind } = require("nativewind/metro");\n\nconst config = getDefaultConfig(__dirname);\nmodule.exports = withNativeWind(config, { input: "./global.css" });\n`;
    await fs.writeFile(metroPath, metroContent);
  }

  // 3. tailwind.config.js
  const tailwindConfigPath = path.join(projectPath, 'tailwind.config.js');
  if (!(await fs.pathExists(tailwindConfigPath))) {
    const tailwindContent = `/** @type {import('tailwindcss').Config} */\nmodule.exports = {\n  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],\n  presets: [require("nativewind/preset")],\n  theme: { extend: {} },\n  plugins: [],\n};\n`;
    await fs.writeFile(tailwindConfigPath, tailwindContent);
  }

  // 4. nativewind-env.d.ts
  const typesFilePath = path.join(projectPath, 'nativewind-env.d.ts');
  if (!(await fs.pathExists(typesFilePath))) {
    const dtsContent = `/// <reference types="nativewind/types" />\n\nimport 'react';\n\ndeclare module 'react' {\n  interface Attributes {\n    className?: string;\n  }\n}\ndeclare global {\n  namespace JSX {\n    interface IntrinsicAttributes {\n      className?: string;\n    }\n  }\n}\n`;
    await fs.writeFile(typesFilePath, dtsContent);
  }
}
