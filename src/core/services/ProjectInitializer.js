import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { COMMON_DEPENDENCIES } from '../config/libraryRules.js';

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
      console.log('🟡 Using existing Expo project:', projectPath);
      // Ensure libraries are initialized even if project exists
      await queueCommonDependencies(projectPath, dependencyManager);
      return projectPath;
    }
    // If folder exists but is empty or invalid, remove it
    console.warn(
      '⚠️ Existing folder found but not a valid Expo project. Recreating...'
    );
    await fs.remove(projectPath);
  }

  console.log('🟢 Creating new Expo project from local template...');

  try {
    const templateName = `sdk-${sdkVersion || 54}`;
    // Navigate from src/core/services to templates/
    const templatePath = path.join(
      __dirname,
      '../../../templates',
      templateName
    );

    if (!(await fs.pathExists(templatePath))) {
      throw new Error(`Template not found at: ${templatePath}`);
    }

    await fs.copy(templatePath, projectPath);
    console.log('   - Template copied successfully.');

    // Inject project name programmatically
    const projectName = path.basename(process.cwd()) + '-app';

    const pkgJsonPath = path.join(projectPath, 'package.json');
    if (await fs.pathExists(pkgJsonPath)) {
      const pkgJson = await fs.readJson(pkgJsonPath);
      pkgJson.name = projectName;
      await fs.writeJson(pkgJsonPath, pkgJson, { spaces: 2 });
      console.log('   - Injected projectName into package.json');
    }

    const appJsonPath = path.join(projectPath, 'app.json');
    if (await fs.pathExists(appJsonPath)) {
      const appJson = await fs.readJson(appJsonPath);
      if (appJson.expo) {
        appJson.expo.name = projectName;
        appJson.expo.slug = projectName;
      }
      await fs.writeJson(appJsonPath, appJson, { spaces: 2 });
      console.log('   - Injected projectName into app.json');
    }

    console.log('📦 [Phase 0] Hydrating base template (npm install)...');
    try {
      execSync('npm install', { cwd: projectPath, stdio: 'inherit' });
    } catch (e) {
      console.warn(
        '⚠️ [Phase 0] Failed to hydrate base template, but continuing...'
      );
    }
  } catch (e) {
    console.error('❌ Failed to create Expo project.');
    throw e;
  }

  // 3. Initialize app settings and dependencies
  await setupExpoConfig(projectPath);
  await queueCommonDependencies(projectPath, dependencyManager);

  console.log('✅ Expo project scaffolding completed successfully.');
  return projectPath;
}

/**
 * Core file configurations (Pure File Ops)
 */
async function setupExpoConfig(projectPath) {
  // 1. Configure app.json scheme for deep linking
  const appJsonPath = path.join(projectPath, 'app.json');
  if (await fs.pathExists(appJsonPath)) {
    const appJson = await fs.readJson(appJsonPath);
    if (appJson.expo && !appJson.expo.scheme) {
      appJson.expo.scheme = 'retransify-app';
      // Force Expo to use Metro for web to ensure high compatibility
      appJson.expo.web = appJson.expo.web || {};
      appJson.expo.web.bundler = 'metro';
      await fs.writeJson(appJsonPath, appJson, { spaces: 2 });
      console.log('🔧 Configured app.json scheme.');
    }
  }
}

/**
 * Queue Common Dependencies
 */
async function queueCommonDependencies(projectPath, dependencyManager) {
  console.log('🚀 Queuing Expo Router & Standard Libs...');
  dependencyManager.add(COMMON_DEPENDENCIES);
  console.log(`📦 Queued ${COMMON_DEPENDENCIES.length} backbone dependencies.`);
}

/**
 * Validate project health
 */
async function isValidExpoProject(projectPath) {
  const expoPkg = path.join(projectPath, 'node_modules/expo/package.json');
  return await fs.pathExists(expoPkg);
}
