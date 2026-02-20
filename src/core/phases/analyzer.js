import fs from 'fs-extra';
import path from 'path';
import { PROJECT_PROFILES } from '../config/profiles.js';

/**
 * @typedef {import('../../types').GlobalMigrationContext} GlobalMigrationContext
 */

export class Analyzer {
  /**
   * @param {string} projectPath 
   */
  constructor(projectPath) {
    this.projectPath = projectPath;
  }

  /**
   * @param {GlobalMigrationContext} context - The shared cognitive memory
   */
  async analyze(context) {
    console.log('🕵️ Analyzing project structure and tech stack...');

    const packageJsonPath = path.join(this.projectPath, 'package.json');
    let packageJson = {};
    if (fs.existsSync(packageJsonPath)) {
      packageJson = await fs.readJson(packageJsonPath);
    }

    // [Enhanced] Use entry files from context (from FileScanner) if available
    const entryFiles = context.entryFiles || this._getEntryFiles(packageJson);

    // Deep Scan & Verify
    const techStack = {
      language: this._detectLanguage(packageJson),
      stateManagement: await this._detectStateManagement(packageJson, entryFiles),
      styling: this._detectStyling(packageJson),
      routing: await this._detectRouting(packageJson, entryFiles),
      buildTool: this._detectBuildTool(packageJson)
    };

    // Store facts in Shared Cognitive Memory
    context.addFact('projectPath', this.projectPath);
    context.addFact('tech', techStack); // Structured Fact
    context.addFact('packageJson', packageJson);

    // [New] Context-Aware Facts for Writer
    context.addFact('sourceRoot', this._inferSourceRoot(entryFiles));
    context.addFact('writePhaseIgnores', this._getWritePhaseIgnores(techStack));

    // [New] The Hijack Phase 1: Detection
    if (entryFiles && entryFiles.length > 0) {
      context.addFact('mainEntryPoint', entryFiles[0]);
      console.log(`🎯 Identified Main Entry Point: ${entryFiles[0]}`);
    }

    console.log('✅ Analysis facts stored in Global Context:', techStack);
  }

  _detectLanguage(packageJson) {
    if (this._checkConfigFile('tsconfig.json')) return 'TypeScript';
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    if (deps['typescript']) return 'TypeScript';
    return 'JavaScript';
  }

  async _detectStateManagement(packageJson, entryFiles) {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    if (deps['@reduxjs/toolkit'] || deps['react-redux']) {
      // Zombie Check: Must be used in root files
      const isUsed = await this._verifyLibraryUsage(['Provider', 'configureStore'], entryFiles);
      if (isUsed) return 'Redux';
    }

    if (deps['zustand']) return 'Zustand';

    return 'None'; // ContextAPI is harder to detect from package.json alone, usually None is safe default
  }

  _detectStyling(packageJson) {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    if (this._checkConfigFile('tailwind.config.js') || this._checkConfigFile('postcss.config.js')) {
      return 'Tailwind';
    }

    if (deps['nativewind']) return 'NativeWind';
    if (deps['tailwindcss']) return 'Tailwind';

    return 'StyleSheet'; // Default for RN
  }

  async _detectRouting(packageJson, entryFiles) {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    if (deps['expo-router']) return 'ExpoRouter';

    if (deps['react-router-dom'] || deps['react-router-native']) {
      const isUsed = await this._verifyLibraryUsage(['BrowserRouter', 'NativeRouter', 'Routes', 'RouterProvider'], entryFiles);
      if (isUsed) return 'ReactRouter';
    }

    return 'None';
  }

  _detectBuildTool(packageJson) {
    if (this._checkConfigFile('vite.config.js')) return 'Vite';
    if (this._checkConfigFile('webpack.config.js')) return 'Webpack';
    return 'Unknown';
  }

  // --- Helpers ---

  _checkConfigFile(fileName) {
    return fs.existsSync(path.join(this.projectPath, fileName));
  }

  _getEntryFiles(packageJson = {}) {
    const candidates = [
      'src/index.js', 'src/index.tsx',
      'src/App.js', 'src/App.tsx',
      'src/main.js', 'src/main.tsx',
      'src/store/index.js', 'src/store/index.ts',
      'index.js', 'App.js' // Root level fallbacks
    ];

    if (packageJson.main) {
      candidates.unshift(packageJson.main);
    }

    return candidates
      .map(f => path.join(this.projectPath, f))
      .filter(f => fs.existsSync(f));
  }

  /**
   * grep-like search in entry files
   * @param {string[]} keywords 
   * @param {string[]} files 
   */
  async _verifyLibraryUsage(keywords, files) {
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf8');
        if (keywords.some(kw => content.includes(kw))) {
          return true; // Found usage!
        }
      } catch (err) {
        // Ignore read errors
      }
    }
    return false; // Confirmed Zombie 🧟‍♂️ (or unused in root)
  }

  _inferSourceRoot(entryFiles) {
    if (!entryFiles || entryFiles.length === 0) return '.';

    // Take the first valid entry file
    const primaryEntry = entryFiles[0];
    const relativeEntry = path.relative(this.projectPath, primaryEntry);
    const dir = path.dirname(relativeEntry);

    // If dir is '.' or empty, return '.'
    return dir === '.' ? '.' : dir;
  }

  _getWritePhaseIgnores(techStack) {
    let profile = null;
    if (techStack.buildTool === 'Vite') profile = PROJECT_PROFILES.vite;
    else if (techStack.buildTool === 'CRA') profile = PROJECT_PROFILES.cra;

    return profile?.writePhaseIgnores || [];
  }
}
