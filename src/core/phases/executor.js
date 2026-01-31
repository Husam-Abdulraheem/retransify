import { buildFileContext } from '../contextBuilder.js';
import { convertFileWithAI } from '../aiClient.js';
import { saveConvertedFile } from '../nativeWriter.js';

/**
 * @typedef {import('../../types').MigrationPlan} MigrationPlan
 * @typedef {import('../../types').GlobalMigrationContext} GlobalMigrationContext
 * @typedef {import('../stateManager').StateManager} StateManager
 */

export class Executor {
  /**
   * @param {GlobalMigrationContext} globalContext
   * @param {MigrationPlan} plan
   * @param {StateManager} stateManager
   * @param {Object} projectContext - The full project context object from contextBuilder
   * @param {Object} options - { sdkVersion }
   */
  constructor(globalContext, plan, stateManager, projectContext, options = {}) {
    this.globalContext = globalContext;
    this.plan = plan;
    this.stateManager = stateManager;
    this.projectContext = projectContext;
    this.options = options;
  }

  async execute() {
    console.log('🏗️  Starting execution phase...');

    for (const filePath of this.plan.files) {
      if (this.stateManager.isConverted(filePath)) {
        console.log(`⏩ Skipping already converted: ${filePath}`);
        continue;
      }

      console.log(`\n🔄 Converting ${filePath}...`);
      
      try {
        const fileContext = buildFileContext(filePath, this.projectContext);
        
        // Inject global context into file context if needed, or pass it separately
        // For now, we'll pass generic global info.
        // Ideally promptBuilder should be updated to accept globalContext directly.
        fileContext.globalContext = this.globalContext; 

        // Inject Smart Path Map
        if (this.plan?.pathMap) {
            fileContext.pathMap = this.plan.pathMap;
        }

        // Convert
        const rnCode = await convertFileWithAI(fileContext, this.options);
        
        // Save using Smart Path if available, else fallback to 'src/' mirror
        let destPath = this.plan?.pathMap?.[filePath] || `src/${filePath}`;
        
        await saveConvertedFile(destPath, rnCode, this.options.sdkVersion);
        
        // Update State
        this.stateManager.markAsComplete(filePath);
        console.log(`✅ Success: ${filePath}`);

      } catch (error) {
        console.error(`❌ Failed: ${filePath}`, error.message);
        this.stateManager.markAsError(filePath, error.message);
        // We continue to the next file (fail-soft)
      }
      
      // ⏳ Throttling for Rate Limits
      // Free tiers often allow ~15-60 RPM. A short delay helps avoid 429s.
      // Wait 2 seconds between files.
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log('\n🎉 Execution phase complete!');
  }
}
