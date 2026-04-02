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

  // 4. تحديث babel.config.js (استخدام AST المعماري لمنع تعطل الملف)
  const babelConfigPath = path.join(projectPath, 'babel.config.js');
  if (await fs.pathExists(babelConfigPath)) {
    let babelContent = await fs.readFile(babelConfigPath, 'utf8');
    if (!babelContent.includes('jsxImportSource')) {
      try {
        const { Project, SyntaxKind } = await import('ts-morph');
        const project = new Project({ useInMemoryFileSystem: true });
        const sourceFile = project.createSourceFile(
          'temp-babel.js',
          babelContent,
          { overwrite: true }
        );

        const moduleExports = sourceFile
          .getStatements()
          .find(
            (stmt) =>
              stmt.getKind() === SyntaxKind.ExpressionStatement &&
              stmt.getText().startsWith('module.exports')
          );

        if (moduleExports) {
          const returnStatement = moduleExports.getDescendantsOfKind(
            SyntaxKind.ReturnStatement
          )[0];
          if (returnStatement) {
            const objectLiteral = returnStatement.getFirstChildByKind(
              SyntaxKind.ObjectLiteralExpression
            );
            if (objectLiteral) {
              // 1. ضبط الـ presets بشكل صارم للمواصفات المطلوبة
              let presetsProp = objectLiteral.getProperty('presets');
              if (!presetsProp) {
                presetsProp = objectLiteral.addPropertyAssignment({
                  name: 'presets',
                  initializer: '[]',
                });
              }
              presetsProp.setInitializer(
                "[\n      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],\n      'nativewind/babel',\n    ]"
              );

              // 2. ضبط الـ plugins (إضافة reanimated وضمان عدم التكرار)
              let pluginsProp = objectLiteral.getProperty('plugins');
              if (!pluginsProp) {
                pluginsProp = objectLiteral.addPropertyAssignment({
                  name: 'plugins',
                  initializer: '[]',
                });
              }

              const pluginsArray = pluginsProp.getFirstChildByKind(
                SyntaxKind.ArrayLiteralExpression
              );
              if (pluginsArray) {
                const elements = pluginsArray
                  .getElements()
                  .map((e) => e.getText().replace(/['"]/g, ''));
                if (!elements.includes('react-native-reanimated/plugin')) {
                  pluginsArray.addElement("'react-native-reanimated/plugin'");
                }
              }

              babelContent = sourceFile.getText();
            }
          }
        }
      } catch (err) {
        console.warn(
          '⚠️ Could not parse babel.config.js with AST:',
          err.message
        );
      }

      await fs.writeFile(babelConfigPath, babelContent);
      console.log('✅ Updated babel.config.js for NativeWind v4 (AST-based)');
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
