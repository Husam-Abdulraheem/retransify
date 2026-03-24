// src/core/graph/nodes/healerNode.js
import { buildFixPrompt } from '../../prompt/promptBuilder.js';
import { z } from 'zod';

const outputSchema = z.object({
  code: z.string().describe('The complete corrected React Native code'),
});

/**
 * HealerNode - Fixes code based on VerifierNode errors
 *
 * Inputs: state.generatedCode, state.errors, state.healAttempts
 * Outputs: state.generatedCode (updated), state.healAttempts (incremented)
 *
 * @param {import('../state.js').GraphState} state
 * @param {{ smartModel: Session }} models
 * @returns {Partial<import('../state.js').GraphState>}
 */
export async function healerNode(state, models = {}) {
  // Fetch installedPackages from the state
  const {
    generatedCode,
    errors,
    healAttempts,
    currentFile,
    installedPackages = [],
  } = state;

  const filePath =
    currentFile?.relativeToProject || currentFile?.filePath || 'unknown';
  const newAttemptCount = (healAttempts || 0) + 1;

  console.log(
    `\n🚑 [HealerNode] Attempting to fix ${filePath} (Attempt ${newAttemptCount})`
  );
  console.log(`   Errors: ${errors.slice(0, 2).join(' | ')}`);

  if (!models.smartModel) {
    console.error('❌ [HealerNode] No smartModel found');
    return { healAttempts: newAttemptCount };
  }

  // Pass installed libraries to restrict the model
  const fixPrompt = buildFixPrompt(generatedCode, errors, installedPackages);

  try {
    const structuredModel =
      models.smartModel.withStructuredOutput(outputSchema);
    const parsed = await structuredModel.invoke(fixPrompt);

    if (parsed.code && parsed.code.length > 50) {
      console.log(
        `✨ [HealerNode] Generated fix (${parsed.code.length} chars)`
      );
      return {
        generatedCode: parsed.code,
        // generatedDependencies has been completely removed
        healAttempts: newAttemptCount,
        errors: [], // Reset errors so Verifier can re-check them
      };
    }
  } catch (err) {
    console.error(`❌ [HealerNode] Error: ${err.message}`);
  }

  console.warn(`⚠️  [HealerNode] Failed to generate fix`);
  return { healAttempts: newAttemptCount };
}
