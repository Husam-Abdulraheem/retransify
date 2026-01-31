import fs from 'fs-extra';
import path from 'path';

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
   * @returns {Promise<GlobalMigrationContext>}
   */
  async analyze() {
    console.log('🕵️ Analyzing project structure and tech stack...');

    const packageJsonPath = path.join(this.projectPath, 'package.json');
    let packageJson = {};
    if (fs.existsSync(packageJsonPath)) {
      packageJson = await fs.readJson(packageJsonPath);
    }

    const techStack = this._detectTechStack(packageJson);
    const styleSystem = this._detectStyleSystem(packageJson);
    const navigationStrategy = this._suggestNavigation();

    return {
      projectPath: this.projectPath,
      techStack,
      styleSystem,
      packageJson,
      navigationStrategy
    };
  }

  _detectTechStack(packageJson) {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    const stack = [];
    if (deps['react-redux'] || deps['@reduxjs/toolkit']) stack.push('Redux');
    if (deps['tailwindcss']) stack.push('Tailwind');
    if (deps['typescript']) stack.push('TypeScript');
    if (deps['axios']) stack.push('Axios');
    
    return stack.join(', ') || 'React (Standard)';
  }

  _detectStyleSystem(packageJson) {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    if (deps['tailwindcss'] || deps['nativewind']) return 'NativeWind';
    return 'StyleSheet';
  }

  _suggestNavigation() {
    // This could be more sophisticated by scanning for react-router-dom usage
    return ['Stack Navigation', 'Tab Navigation']; 
  }
}
