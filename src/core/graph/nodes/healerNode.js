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
import { MAX_HEAL_ATTEMPTS } from '../state.js';

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
    unresolvedErrors = [],
  } = state;

  const filePath =
    currentFile?.relativeToProject || currentFile?.filePath || 'unknown';
  const newAttemptCount = (healAttempts || 0) + 1;

  printSubStep(
    `🚑 AI Healing attempt ${newAttemptCount}/${MAX_HEAL_ATTEMPTS}...`
  );

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
    state,
    state.exactImportsMap
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
    printError(`HealerNode failed during invocation: ${err.message}`);
  }

  printWarning(`HealerNode: failed to generate fix for ${filePath}`);

  // If this was the last attempt, record as unresolved
  if (newAttemptCount >= MAX_HEAL_ATTEMPTS) {
    const errorRecord = {
      filePath: currentFile?.relativeToProject || filePath,
      reason:
        'Failed to resolve complex DOM references or unsupported UI library after max retries.',
      codeSnippet:
        (generatedCode || '').substring(0, 500) + '...\n// (Code truncated)',
      suggestedAction:
        'Manually convert this component to React Native primitives (View, Text).',
    };
    printWarning(`Marked ${errorRecord.filePath} for manual intervention.`);
    return {
      healAttempts: newAttemptCount,
      unresolvedErrors: [errorRecord],
    };
  }

  return { healAttempts: newAttemptCount };
}
