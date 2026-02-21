import path from 'path';
import fs from 'fs-extra';

/**
 * Configuration Helper (File IO Only)
 * Writes tailwind.config.js and modifies babel.config.js
 */
export async function setupNativeWind(projectPath) {
  console.log('🌪️  Configuring NativeWind Files...');

  // 1. Create Tailwind Config
  const tailwindConfigPath = path.join(projectPath, 'tailwind.config.js');
  if (!(await fs.pathExists(tailwindConfigPath))) {
    const configContent = `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};`;
    await fs.writeFile(tailwindConfigPath, configContent);
    console.log('✅ Created tailwind.config.js');
  }

  // 2. Update Babel Settings
  // ⚠️ This config is compatible with NativeWind v2 and Expo Router
  const babelConfigPath = path.join(projectPath, 'babel.config.js');
  const babelContent = `module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['nativewind/babel'],
  };
};`;

  await fs.writeFile(babelConfigPath, babelContent);
  console.log('✅ Enforced standard babel.config.js for NativeWind');
}
