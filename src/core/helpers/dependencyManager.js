import path from 'path';
import fs from 'fs-extra';
import { runSilentCommand } from './shell.js';
import { COMMON_DEPENDENCIES } from '../constants/commonDependencies.js';
import { setupNativeWind } from '../nativeWriter.js';
import { autoConfigureBabel } from '../utils/babelManager.js';

export class DependencyManager {
  constructor() {
    this.pendingPackages = new Set();
    // Default ignored packages (built-ins or explicitly managed)
    this.ignored = new Set([
      'react', 'react-native', 'expo',
      ...COMMON_DEPENDENCIES
    ]);

    // Map of libraries that conflict with our stack -> The preferred alternative
    this.conflictMap = {
        'react-router-dom': 'expo-router',
        'react-navigation': 'expo-router', // We use expo-router which wraps react-navigation
        '@react-navigation/native': 'expo-router',
        'styled-components': 'nativewind', // If we want to enforce nativewind, but user prompt didn't strictly say so, but user wants to avoid conflicts.
        'node-fetch': 'fetch', // Built-in
        'axios': 'fetch', // Optimization: prefer built-in, though axios is fine. Let's stick to strict conflicts for now.
        'uuid': 'expo-crypto', 
        '@react-native-community/async-storage': '@react-native-async-storage/async-storage',
    };
  }

  /**
   * Add packages to the pending list.
   * @param {string[]} packages - Array of package names
   */
  add(packages) {
    if (!packages || !Array.isArray(packages)) return;
    
    packages.forEach(pkg => {
      // 1. Sanitize package name (remove @version)
      const cleanPkg = pkg.split('@')[0];

      // 2. Check for conflicts
      if (this.conflictMap[cleanPkg]) {
          const preferred = this.conflictMap[cleanPkg];
          console.log(`⚠️  Blocking conflicting library: '${cleanPkg}'. Our stack uses '${preferred}'.`);
          
          // If the preferred one is not ignored, add it instead? 
          // Usually preferred ones are in COMMON_DEPENDENCIES (ignored), so we just drop this.
          if (!this.ignored.has(preferred)) {
              this.pendingPackages.add(preferred);
          }
          return;
      }

      // 3. Filter out core packages that are definitely installed
      if (!this.ignored.has(cleanPkg)) {
        this.pendingPackages.add(cleanPkg);
      } else {
        // console.log(`ℹ️  Skipping common/ignored dependency: ${cleanPkg}`);
      }
    });
  }

  /**
   * Install all pending packages in a single batch.
   * @param {string} projectPath - Root of the RN project
   */
  async installAll(projectPath) {
    if (this.pendingPackages.size === 0) {
      console.log('📦 No new dependencies to install.');
      return;
    }

    try {
        const packageJsonPath = path.join(projectPath, 'package.json');
        let installedDeps = {};
        if (await fs.pathExists(packageJsonPath)) {
             const pkg = await fs.readJson(packageJsonPath);
             installedDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        }

        // Filter out what is already installed
        const toInstall = [];
        for (const pkg of this.pendingPackages) {
            if (!installedDeps[pkg]) {
                toInstall.push(pkg);
            }
        }

    if (toInstall.length === 0) {
         console.log('✅ All discovered dependencies are already installed.');
         this.pendingPackages.clear();
         return;
    }

    const packageList = toInstall.join(' ');
    
    try {
        // [New] Sanitize Environment First (Sync-then-Install)
        // Ensure environment matches package.json before attempting new installs
        console.log("🧹 [DependencyManager] Sanitizing environment...");
        runSilentCommand('npm install', projectPath, "🧹 Syncing node_modules...");
        
        // Attempt 1: Batch install with Expo
        runSilentCommand(
          `npx expo install ${packageList}`, 
          projectPath, 
          `📦 Installing new dependencies: ${packageList}...`
        );
        console.log('✅ Dependencies installed successfully.');

        // [NEW] Configure NativeWind if installed (for tailwind.config.js)
        if (toInstall.includes('nativewind')) {
             await setupNativeWind(projectPath);
        }

        // [NEW] Auto-Configure Babel for ALL dependencies (NativeWind, Reanimated, etc.)
        await autoConfigureBabel(projectPath);

        this.pendingPackages.clear();
    } catch (error) {
        console.warn('⚠️ Batch installation failed. Retrying individually...');
        
        // Attempt 2: Install individually
        for (const pkg of toInstall) {
            try {
                runSilentCommand(
                  `npx expo install ${pkg}`, 
                  projectPath, 
                  `📦 Installing ${pkg}...`
                );
            } catch (innerError) {
                console.warn(`⚠️ 'expo install ${pkg}' failed. Trying 'npm install'...`);
                try {
                     // Attempt 3: NPM fallback
                    runSilentCommand(
                      `npm install ${pkg} --legacy-peer-deps`, 
                      projectPath, 
                      `📦 Fallback Installing ${pkg}...`
                    );
                } catch (npmError) {
                    console.error(`❌ Failed to install ${pkg}. Skipping.`);
                }
            }
        }
        // Check NativeWind post-install even after individual installs
        if (toInstall.includes('nativewind')) {
            await setupNativeWind(projectPath);
        }
        
        // [NEW] Auto-Configure Babel (Retry in catch block too)
        await autoConfigureBabel(projectPath);

        this.pendingPackages.clear();
    }
    } catch (outerError) {
        console.error("❌ Unexpected error during dependency installation:", outerError.message);
    }
  }
}
