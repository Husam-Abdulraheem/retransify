import fs from 'fs-extra';
import path from 'path';

/**
 * Framework detection result
 * @typedef {Object} DetectionResult
 * @property {'vite' | 'cra'} type - Detected project type
 * @property {'high' | 'low'} confidence - Confidence level
 * @property {string[]} signals - Signals relied upon
 */

/**
 * Framework Detector
 * Separates detection logic from scanning logic
 */
export class FrameworkDetector {
  /**
   * Detects the framework used in the project
   * @param {string} rootPath - Project root path
   * @returns {Promise<DetectionResult>}
   * @throws {Error} If project is Next.js (unsupported)
   */
  static async detect(rootPath) {
    const signals = [];
    const packageJsonPath = path.join(rootPath, 'package.json');

    if (!(await fs.pathExists(packageJsonPath))) {
      return {
        type: 'vite', // Default to vite if no package.json found (modern default)
        confidence: 'low',
        signals: ['default:fallback'],
      };
    }

    const packageJson = await fs.readJson(packageJsonPath);
    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    // 1. Safety Check: Reject Next.js explicitly
    if (deps['next']) {
      throw new Error(
        '❌ Next.js projects are not supported by Retransify yet.'
      );
    }

    // 2. Detect Vite
    if (deps['vite']) {
      signals.push('package.json:vite');
      return {
        type: 'vite',
        confidence: 'high',
        signals,
      };
    }

    // 3. Detect CRA
    if (deps['react-scripts']) {
      signals.push('package.json:react-scripts');
      return {
        type: 'cra',
        confidence: 'high',
        signals,
      };
    }

    // 4. Default Fallback
    return {
      type: 'vite',
      confidence: 'low',
      signals: ['default:fallback'],
    };
  }
}
