// src/core/graph/nodes/healerNode.js
import { buildFixPrompt } from '../../prompt/promptBuilder.js';
import { z } from 'zod';
import {
  printSubStep,
  printWarning,
  printError,
  startSubSpinner,
  stopSpinner,
} from '../../utils/ui.js';

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

  printSubStep(`🚑 AI Healing attempt ${newAttemptCount}/3...`);
  if (!models.smartModel) {
    printError('HealerNode: no smartModel');
    return { healAttempts: newAttemptCount };
  }

  // Pass installed libraries to restrict the model
  const MAX_ERRORS = 5;
  let displayedErrors = errors;

  if (errors.length > MAX_ERRORS) {
    displayedErrors = errors.slice(0, MAX_ERRORS);
    displayedErrors.push(
      `\n... and ${errors.length - MAX_ERRORS} more errors hidden. Fix these top critical errors first, as they often cascade and solve the rest.`
    );
  }

  // Pass installed libraries to restrict the model
  const fixPrompt = buildFixPrompt(
    generatedCode,
    displayedErrors,
    installedPackages,
    state
  );

  try {
    const structuredModel =
      models.smartModel.withStructuredOutput(outputSchema);
    startSubSpinner(`AI: Fixing ${filePath}...`);
    const parsed = await structuredModel.invoke(fixPrompt);
    stopSpinner();

    if (parsed.code && parsed.code.length > 50) {
      printSubStep(`✨ Fix generated. Re-verifying...`, 1);
      return {
        generatedCode: parsed.code,
        healAttempts: newAttemptCount,
        errors: [], // Reset errors so Verifier can re-check them
      };
    }
  } catch (err) {
    printError(`HealerNode error: ${err.message}`);
  }

  printWarning('HealerNode: failed to generate fix');
  return { healAttempts: newAttemptCount };
}
