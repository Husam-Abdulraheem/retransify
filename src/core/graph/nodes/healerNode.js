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
  code: z
    .string()
    .describe(
      'The complete corrected React Native code. You MUST format this code legibly with proper newlines and indentation. DO NOT minify.'
    ),
});

/**
 * HealerNode - Fixes code based on VerifierNode errors
 *
 * @param {import('../state.js').GraphState} state
 * @param {{ smartModel: Session, fastModel: Session }} models
 * @returns {Partial<import('../state.js').GraphState>}
 */
export async function healerNode(state, models = {}) {
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

  const MAX_ERRORS = 5;
  let displayedErrors = errors;

  if (errors.length > MAX_ERRORS) {
    displayedErrors = errors.slice(0, MAX_ERRORS);
    displayedErrors.push(
      `\n... and ${errors.length - MAX_ERRORS} more errors hidden. Fix these top critical errors first, as they often cascade and solve the rest.`
    );
  }

  const fixPrompt = buildFixPrompt(
    generatedCode,
    displayedErrors,
    installedPackages,
    state
  );

  try {
    startSubSpinner(`AI Healing: Fixing ${filePath}...`);

    const fallbackModel = models.fastModel.withStructuredOutput(outputSchema);
    const primaryModel = models.smartModel.withStructuredOutput(outputSchema);
    const model = primaryModel.withFallbacks({ fallbacks: [fallbackModel] });

    const parsed = await model.invoke(fixPrompt);

    stopSpinner();

    if (parsed.code && parsed.code.length > 50) {
      printSubStep(`✨ Fix generated. Re-verifying...`, 1);
      return {
        generatedCode: parsed.code,
        healAttempts: newAttemptCount,
        errors: [],
      };
    }
  } catch (err) {
    stopSpinner();
    printError(`HealerNode failed after all attempts: ${err.message}`);
  }

  printWarning('HealerNode: failed to generate fix');
  return { healAttempts: newAttemptCount };
}
