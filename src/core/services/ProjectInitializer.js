import path from 'path';
import fs from 'fs-extra';
import { COMMON_DEPENDENCIES } from '../config/libraryRules.js';
import { runSilentCommand } from '../helpers/shell.js';

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

  console.log('🟢 Creating new Expo project (Default/Router Template)...');

  try {
    // ⚠️ Await added here to ensure generation completes before cleaning
    await runSilentCommand(
      `npx create-expo-app@latest "${projectPath}" --yes`,
      process.cwd(),
      'Scaffolding Expo Project'
    );
  } catch (e) {
    console.error('❌ Failed to create Expo project.');
    throw e;
  }

  // 2. Clean Expo demo boilerplate files
  await cleanExpoBoilerplate(projectPath);

  // 3. Initialize app settings and dependencies
  await setupExpoConfig(projectPath);
  await queueCommonDependencies(projectPath, dependencyManager);

  console.log('✅ Expo project scaffolding completed successfully.');
  return projectPath;
}

/**
 * Cleans new project from Expo demo files and injects core files
 */
async function cleanExpoBoilerplate(projectPath) {
  console.log('🧹 Cleaning Expo boilerplate files...');

  const dirsToNuke = ['components', 'constants', 'hooks', 'scripts'];
  for (const dir of dirsToNuke) {
    const fullPath = path.join(projectPath, dir);
    if (await fs.pathExists(fullPath)) {
      await fs.remove(fullPath);
      console.log(`   - Deleted: ${dir}`);
    }
  }

  const appDir = path.join(projectPath, 'app');
  if (await fs.pathExists(appDir)) {
    await fs.emptyDir(appDir);
    console.log(`   - Emptied: app/`);

    // 🎯 Inject default _layout.tsx to protect app structure
    const defaultLayoutCode = `import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }} />
  );
}
`;
    await fs.writeFile(path.join(appDir, '_layout.tsx'), defaultLayoutCode);
    console.log(`   - Injected: app/_layout.tsx (Core Router Wrapper)`);
  }
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
