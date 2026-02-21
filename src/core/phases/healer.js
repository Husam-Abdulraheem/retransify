import { buildFixPrompt } from '../prompt/promptBuilder.js';
import { createSession } from '../ai/aiFactory.js';
import { cleanAIResponse } from '../helpers/cleanAIResponse.js'; // Fallback cleaner

export class Healer {
  constructor(verifier, aiOptions = {}) {
    this.verifier = verifier;
    this.aiOptions = aiOptions;
  }

  /**
   * Attempt to fix the file by feeding errors back to AI.
   * [PASSIVE] Does NOT save file or run new verification. Returns the candidate fix.
   *
   * @param {GlobalMigrationContext} context
   * @param {string} projectPath
   * @param {string} filePath
   * @param {string} coding - The current broken code
   * @param {string[]} initialErrors
   * @param {string} errorHash - Unique hash of the error state (passed from Executor)
   * @returns {Promise<{fixedCode: string, success: boolean, dependencies: string[]}>}
   */
  async heal(context, projectPath, filePath, code, initialErrors, errorHash) {
    console.log(`🚑 Attempting to heal ${filePath}...`);

    // 0. Enforce Contract (Double check, although Executor checks too)
    // context.canHeal is called by Executor to decide IF to call heal.
    // But we record the attempt here.

    // 1. Initialize Stateful Session
    const session = createSession(
      this.aiOptions.model,
      this.aiOptions.provider
    );

    let prompt = buildFixPrompt(code, initialErrors);

    console.log(`   🩹 Asking AI for a fix...`);
    const response = await session.sendMessage(prompt);
    let fixedCode = '';
    let dependencies = [];

    try {
      const parsed = JSON.parse(response);
      fixedCode = parsed.code;
      dependencies = parsed.dependencies || [];
    } catch {
      // Try extracting from markdown
      const match = response.match(/```json([\s\S]*?)```/);
      if (match) {
        try {
          const parsed = JSON.parse(match[1]);
          fixedCode = parsed.code;
          dependencies = parsed.dependencies || [];
        } catch {
          // ignore
        }
      }
    }

    if (!fixedCode) {
      fixedCode = cleanAIResponse(response);
    }

    const success = !!(fixedCode && fixedCode.length > 50);

    // Record Correction and Attempt
    context.addCorrection(filePath, {
      originalErrors: initialErrors,
      fixSummary:
        dependencies.length > 0
          ? `Installed deps: ${dependencies}`
          : 'Code fix applied',
      timestamp: new Date().toISOString(),
    });

    context.recordHealingAttempt(filePath, {
      errorHash: errorHash,
      fixSummary: success ? 'AI generated fix' : 'AI failed to generate fix',
    });

    if (success) {
      console.log(`✨ Healer generated a candidate fix.`);
      return { fixedCode, dependencies, success: true };
    }

    console.warn(`❌ Healer could not generate a valid fix.`);
    return { fixedCode: code, success: false, dependencies: [] };
  }
}
