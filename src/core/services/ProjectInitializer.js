import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { COMMON_DEPENDENCIES } from '../config/libraryRules.js';
import {
  printSubStep,
  printSubStepLast,
  printDetail,
  printWarning,
  printError,
  startSubSpinner,
  stopSpinner,
} from '../utils/ui.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 1) Ensure Native Expo Project Exists (Pure I/O)
 */
export async function ensureNativeProject(sdkVersion, dependencyManager) {
  if (!dependencyManager) {
    throw new Error(
      'ensureNativeProject: dependencyManager is REQUIRED for Strict One-Shot mode.'
    );
  }

  const projectPath = path.join(process.cwd(), 'converted-expo-app');

  // If project exists and is valid
  if (await fs.pathExists(projectPath)) {
    if (await isValidExpoProject(projectPath)) {
      printSubStep('Using existing Expo project');
      await queueCommonDependencies(projectPath, dependencyManager);
      return projectPath;
    }
    printWarning('Existing folder not a valid Expo project. Recreating...');
    await fs.remove(projectPath);
  }

  printSubStep('Scaffolding from local SDK template');

  try {
    const templateName = `sdk-${sdkVersion || 54}`;
    const templatePath = path.join(
      __dirname,
      '../../../templates',
      templateName
    );

    if (!(await fs.pathExists(templatePath))) {
      throw new Error(`Template not found at: ${templatePath}`);
    }

    await fs.copy(templatePath, projectPath);
    printSubStep('Template copied');

    const projectName = path.basename(process.cwd()) + '-app';

    const pkgJsonPath = path.join(projectPath, 'package.json');
    if (await fs.pathExists(pkgJsonPath)) {
      const pkgJson = await fs.readJson(pkgJsonPath);
      pkgJson.name = projectName;
      await fs.writeJson(pkgJsonPath, pkgJson, { spaces: 2 });
    }

    const appJsonPath = path.join(projectPath, 'app.json');
    if (await fs.pathExists(appJsonPath)) {
      const appJson = await fs.readJson(appJsonPath);
      if (appJson.expo) {
        appJson.expo.name = projectName;
        appJson.expo.slug = projectName;
      }
      await fs.writeJson(appJsonPath, appJson, { spaces: 2 });
    }

    startSubSpinner('Hydrating base template (npm install)...');
    try {
      // stdio: 'ignore' — npm output is noise, errors are caught below
      execSync('npm install', { cwd: projectPath, stdio: 'ignore' });
      stopSpinner();
    } catch {
      stopSpinner();
      printWarning('Phase 0: npm install had warnings, continuing...');
    }
  } catch (e) {
    printError('Failed to create Expo project.');
    throw e;
  }

  await setupExpoConfig(projectPath);
  await queueCommonDependencies(projectPath, dependencyManager);

  printSubStepLast('Expo project ready');
  return projectPath;
}

/**
 * Core file configurations (Pure File Ops)
 */
async function setupExpoConfig(projectPath) {
  // 1. Setup app.json
  const appJsonPath = path.join(projectPath, 'app.json');
  if (await fs.pathExists(appJsonPath)) {
    const appJson = await fs.readJson(appJsonPath);
    if (appJson.expo && !appJson.expo.scheme) {
      appJson.expo.scheme = 'retransify-app';
      appJson.expo.web = appJson.expo.web || {};
      appJson.expo.web.bundler = 'metro';
      await fs.writeJson(appJsonPath, appJson, { spaces: 2 });
    }
  }

  // 2. Ensure base babel.config.js exists for EVERY project
  const babelConfigPath = path.join(projectPath, 'babel.config.js');
  if (!(await fs.pathExists(babelConfigPath))) {
    const baseBabelContent = `module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};`;
    await fs.writeFile(babelConfigPath, baseBabelContent);
  }
}

/**
 * Queue Common Dependencies
 */
async function queueCommonDependencies(projectPath, dependencyManager) {
  dependencyManager.add(COMMON_DEPENDENCIES);
  printDetail(`Queued ${COMMON_DEPENDENCIES.length} backbone dependencies`);
}

/**
 * Validate project health
 */
async function isValidExpoProject(projectPath) {
  const expoPkg = path.join(projectPath, 'node_modules/expo/package.json');
  return await fs.pathExists(expoPkg);
}
