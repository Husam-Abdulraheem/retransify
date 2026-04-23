// src/core/utils/configChecker.js
import fs from 'fs-extra';
import path from 'path';
import { printStep, printSubStep, printWarning } from './ui.js';

export async function checkConfigurations(targetProjectPath) {
  printStep('Doctor — Checking Configuration Integrity...');
  let hasErrors = false;

  const pkgPath = path.join(targetProjectPath, 'package.json');
  const pkg = fs.existsSync(pkgPath) ? await fs.readJSON(pkgPath) : {};
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

  // 1. فحص babel.config.js
  const babelPath = path.join(targetProjectPath, 'babel.config.js');
  if (fs.existsSync(babelPath)) {
    const babelContent = await fs.readFile(babelPath, 'utf-8');

    // فحص NativeWind فقط إذا كان موجوداً في الحزم
    if (allDeps['nativewind'] && !babelContent.includes('nativewind/babel')) {
      printWarning(
        `[✖] NativeWind detected in package.json but missing from babel.config.js.`
      );
      hasErrors = true;
    }
  }

  // 2. فحص app.json (التأكد من وجود expo-router)
  const appJsonPath = path.join(targetProjectPath, 'app.json');
  if (fs.existsSync(appJsonPath)) {
    try {
      const appJson = await fs.readJSON(appJsonPath);
      const plugins = appJson?.expo?.plugins || [];
      const hasRouter = plugins.some(
        (p) =>
          p === 'expo-router' || (Array.isArray(p) && p[0] === 'expo-router')
      );

      if (!hasRouter) {
        printWarning(`[✖] app.json is missing 'expo-router' plugin.`);
        hasErrors = true;
      }
    } catch (e) {
      printWarning(`[✖] app.json is malformed and cannot be parsed.`);
      hasErrors = true;
    }
  } else {
    printWarning(`[✖] app.json not found!`);
    hasErrors = true;
  }

  if (!hasErrors) {
    printSubStep('[✔] Configurations are correct for this project type.', 1);
  }

  return !hasErrors;
}
