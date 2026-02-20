import fs from 'fs-extra';
import path from 'path';

/**
 * نتيجة اكتشاف الفريمورك
 * @typedef {Object} DetectionResult
 * @property {'vite' | 'cra'} type - نوع المشروع المكتشف
 * @property {'high' | 'low'} confidence - مدى الثقة في النتيجة
 * @property {string[]} signals - الإشارات التي تم الاعتماد عليها
 */

/**
 * مكتشف نوع المشروع (Framework Detector)
 * يفصل منطق الاكتشاف عن منطق المسح
 */
export class FrameworkDetector {
  /**
   * يكتشف نوع الفريمورك المستخدم في المشروع
   * @param {string} rootPath - مسار جذر المشروع
   * @returns {Promise<DetectionResult>}
   * @throws {Error} إذا كان المشروع Next.js (غير مدعوم)
   */
  static async detect(rootPath) {
    const signals = [];
    const packageJsonPath = path.join(rootPath, 'package.json');
    
    let packageJson = {};
    if (await fs.pathExists(packageJsonPath)) {
      packageJson = await fs.readJson(packageJsonPath);
    }

    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    // 1. Safety Check: Reject Next.js explicitly
    if (deps['next']) {
      throw new Error('❌ Next.js projects are not supported by Retransify yet.');
    }

    // 2. Detect Vite
    // Strongest Signal: Config file
    const viteConfigExists = 
      await fs.pathExists(path.join(rootPath, 'vite.config.js')) ||
      await fs.pathExists(path.join(rootPath, 'vite.config.ts'));

    if (viteConfigExists) {
      signals.push('file:vite.config.*');
      return {
        type: 'vite',
        confidence: 'high',
        signals
      };
    }

    // Strong Signal: Vite in devDependencies
    if (deps['vite']) {
      signals.push('package.json:vite');
      return {
        type: 'vite',
        confidence: 'high',
        signals
      };
    }

    // 3. Detect CRA
    if (deps['react-scripts']) {
      signals.push('package.json:react-scripts');
      return {
        type: 'cra',
        confidence: 'high', // Pretty definitive for CRA
        signals
      };
    }

    // 4. Default Fallback (if uncertain)
    // Could default to CRA or throw error. For now, let's be safe and default to 'vite' structure if ambiguous but likely React
    // OR we can return a low confidence result.
    // The previous logic didn't have a definitive "Unknown".
    // Let's assume Vite if we see 'react' but no scripts, as it's more common now?
    // actually, let's just return 'vite' with low confidence as a safe modern default.
    return {
      type: 'vite',
      confidence: 'low',
      signals: ['default:fallback']
    };
  }
}
