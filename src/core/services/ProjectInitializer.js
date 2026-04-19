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
export async function ensureNativeProject(
  sourceProjectPath,
  sdkVersion,
  dependencyManager
) {
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

      // Migrate assets
      printSubStep('Migrating assets (Images, Icons, etc.)...');
      const assetMap = await migrateAssets(sourceProjectPath, projectPath);

      // Migrate environment variables
      printSubStep('Migrating environment variables (.env)...');
      await migrateEnvVariables(sourceProjectPath, projectPath);

      return { projectPath, assetMap };
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

  // Migrate assets
  printSubStep('Migrating assets (Images, Icons, etc.)...');
  const assetMap = await migrateAssets(sourceProjectPath, projectPath);

  // Migrate environment variables
  printSubStep('Migrating environment variables (.env)...');
  await migrateEnvVariables(sourceProjectPath, projectPath);

  printSubStepLast('Expo project ready');
  return { projectPath, assetMap };
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

  // 2. Write base babel.config.js (module-resolver will be injected later by babelManager via babelRegistry)
  const babelConfigPath = path.join(projectPath, 'babel.config.js');
  if (!(await fs.pathExists(babelConfigPath))) {
    const baseBabelContent = `module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [],
  };
};`;
    await fs.writeFile(babelConfigPath, baseBabelContent);
  }

  // 3. Ensure tsconfig.json explicitly maps @/* dynamically based on project structure
  const tsConfigPath = path.join(projectPath, 'tsconfig.json');
  let tsConfig = {};
  if (await fs.pathExists(tsConfigPath)) {
    try {
      tsConfig = await fs.readJson(tsConfigPath);
    } catch (e) {
      printWarning(`Failed to parse tsconfig.json: ${e.message}`);
    }
  }

  // Expo Router routes are expected under `app/` (root). Still, we may generate non-route code under `src/`.
  // Keep '@' flexible without ever moving routes to `src/app`.
  const hasSrcDir = await fs.pathExists(path.join(projectPath, 'src'));
  const aliasTarget = hasSrcDir ? ['./*', './src/*'] : ['./*'];

  tsConfig.extends = tsConfig.extends || 'expo/tsconfig.base';
  tsConfig.compilerOptions = tsConfig.compilerOptions || {};
  tsConfig.compilerOptions.strict = true;
  tsConfig.compilerOptions.baseUrl = '.';
  tsConfig.compilerOptions.paths = {
    ...(tsConfig.compilerOptions.paths || {}),
    '@/*': aliasTarget,
  };
  await fs.writeJson(tsConfigPath, tsConfig, { spaces: 2 });
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

/**
 * 2) Migrate Assets (Images, SVGs, etc.) and create a path map
 */
export async function migrateAssets(sourceDir, targetDir) {
  const assetMap = {};
  const EXTS = [
    '.png',
    '.jpg',
    '.jpeg',
    '.svg',
    '.gif',
    '.webp',
    '.json',
    '.ttf',
    '.otf',
    '.woff',
    '.mp3',
    '.mp4',
  ];
  const IGNORED_JSONS = [
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'app.json',
    'jsconfig.json',
    'theme.json',
  ];

  async function walk(dir) {
    let files;
    try {
      files = await fs.readdir(dir);
    } catch {
      return;
    }

    for (let file of files) {
      if (
        [
          'node_modules',
          '.git',
          'dist',
          'build',
          '.expo',
          'converted-expo-app',
        ].includes(file)
      )
        continue;

      const fullPath = path.join(dir, file);
      let stat;
      try {
        stat = await fs.stat(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        await walk(fullPath);
      } else {
        const ext = path.extname(file).toLowerCase();
        if (EXTS.includes(ext) && !IGNORED_JSONS.includes(file)) {
          const relPath = path
            .relative(sourceDir, fullPath)
            .replace(/\\/g, '/');

          // Preserve directory structure instead of flattening.
          // We strip common prefixes (src/assets, public, assets, src) to keep the target folder clean.
          // Using a loop to handle cases where prefixes might be layered (e.g. src/assets).
          let subPath = relPath;
          let changed = true;
          while (changed) {
            changed = false;
            const prefixes = ['src/assets/', 'assets/', 'public/', 'src/'];
            for (const p of prefixes) {
              if (subPath.toLowerCase().startsWith(p)) {
                subPath = subPath.substring(p.length);
                changed = true;
                break;
              }
            }
          }
          const newRelative = `assets/${subPath}`;
          const targetPath = path.join(targetDir, newRelative);

          await fs.ensureDir(path.dirname(targetPath));
          await fs.copy(fullPath, targetPath);

          // Map the old relative path to the new relative path
          assetMap[relPath] = newRelative;
        }
      }
    }
  }

  await walk(sourceDir);
  return assetMap;
}

/**
 * 3) Migrate Environment Variables (.env files)
 */
export async function migrateEnvVariables(sourceDir, targetDir) {
  const envFiles = [
    '.env',
    '.env.local',
    '.env.development',
    '.env.production',
  ];
  const prefixRegex = /^(REACT_APP_|VITE_|NEXT_PUBLIC_)/;

  for (const envFile of envFiles) {
    const sourcePath = path.join(sourceDir, envFile);
    if (await fs.pathExists(sourcePath)) {
      try {
        const content = await fs.readFile(sourcePath, 'utf8');
        const lines = content.split('\n');
        const newLines = [];

        for (const line of lines) {
          // Keep comments and empty lines intact
          if (!line || line.trim().startsWith('#')) {
            newLines.push(line);
            continue;
          }

          // Match KEY=VALUE pairs
          const match = line.match(/^([^=]+)=(.*)$/);
          if (match) {
            let key = match[1].trim();
            const value = match[2];

            // Replace web prefixes with EXPO_PUBLIC_
            if (prefixRegex.test(key)) {
              key = key.replace(prefixRegex, 'EXPO_PUBLIC_');
            }

            newLines.push(`${key}=${value}`);
          } else {
            newLines.push(line);
          }
        }

        const targetPath = path.join(targetDir, envFile);
        await fs.writeFile(targetPath, newLines.join('\n'));
      } catch {
        // Silently skip if a file can't be read/written
        continue;
      }
    }
  }
}
