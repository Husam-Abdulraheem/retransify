// src/core/utils/doctor.js
import fs from 'fs-extra';
import path from 'path';
import { checkConfigurations } from './configChecker.js';
import { checkWebLeakage } from './webLeakScanner.js';
import { fixBrokenImports } from './importHealer.js';
import { fixBrokenAssets } from './assetHealer.js';
import { printError, printStep } from './ui.js';

/**
 * The entry point for the 'retransify doctor' command.
 * Orchestrates multiple diagnostic and auto-healing services.
 *
 * @param {string} targetProjectPath - The path to the Expo project
 */
export async function runDoctor(targetProjectPath) {
  console.log('\n🩺 Retransify Doctor is inspecting the project...\n');

  // 🚨 1. The Guard Clause (Fail-Fast Mechanism)
  const pkgPath = path.join(targetProjectPath, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    printError(
      '❌ Aborted: No package.json found. This directory is not a Node.js project.'
    );
    return;
  }

  const pkg = await fs.readJSON(pkgPath);
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

  if (!allDeps['expo']) {
    printError(
      '❌ Aborted: Target is NOT an Expo project. Retransify Doctor can only inspect React Native Expo projects.'
    );
    return;
  }

  // 2. فحص الإعدادات الأساسية
  const configStatus = await checkConfigurations(targetProjectPath);
  console.log('');

  // 3. فحص تسرب أكواد الويب (HTML/DOM)
  const webStatus = await checkWebLeakage(targetProjectPath);
  console.log('');

  // 4. فحص وإصلاح المسارات المكسورة (الميزة القاتلة - Killer Feature)
  const importStatus = await fixBrokenImports(targetProjectPath);
  console.log('');

  // 5. فحص وإصلاح الأصول الثابتة (Images, Fonts, etc.)
  const assetStatus = await fixBrokenAssets(targetProjectPath);

  console.log('\n---------------------------------------------------');

  // القرار النهائي للسلامة: نجاح كل الفحوصات بنسبة 100%
  const isHealthy =
    configStatus &&
    webStatus &&
    importStatus.manualCount === 0 &&
    assetStatus.manualCount === 0;

  if (isHealthy) {
    console.log(
      '✅ Success: Project architecture looks solid and production-ready!'
    );
  } else {
    printError(
      '❌ Issues Found: Your project requires attention before it can run properly on native.'
    );
    console.log('Please review the manual actions and warnings listed above.');
  }
}

// Legacy support for the CLI or other modules
export const Doctor = {
  checkHealth: async (projectPath) => {
    await runDoctor(projectPath);
    return true;
  },
  fixDependencies: async (projectPath) => {
    await runDoctor(projectPath);
  },
};
