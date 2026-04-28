// src/core/graph/nodes/healerNode.js
import { buildFixPrompt } from '../../prompt/promptBuilder.js';
import { z } from 'zod';
import { printSubStep, printError } from '../../utils/ui.js';
import { MAX_HEAL_ATTEMPTS } from '../state.js';
import { executeModel } from '../../ai/modelExecutor.js';
import { optimizeFileContext } from '../../helpers/contextOptimizer.js';

const outputSchema = z.object({
  code: z
    .string()
    .describe(
      'The complete corrected React Native code. You MUST format this code legibly with proper newlines and indentation. DO NOT minify.'
    ),
  analysis: z
    .string()
    .describe(
      'Technical analysis of the errors fixed and what might still be difficult.'
    ),
  suggestedManualAction: z
    .string()
    .describe(
      'Specific instructions for the developer if this automated fix fails (e.g., manual library replacement).'
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

  const { relevantPaths } = optimizeFileContext(state, currentFile);

  const healerPayload = {
    code: generatedCode || currentFile.content,
    errors: displayedErrors,
    installedPackages: installedPackages,
    exactImportsMap: relevantPaths,
    state: {
      facts: state.facts,
      currentFile: state.currentFile,
      pathMap: state.pathMap,
    },
  };

  const fixPrompt = buildFixPrompt(
    healerPayload.code,
    healerPayload.errors,
    healerPayload.installedPackages,
    healerPayload.state,
    healerPayload.exactImportsMap
  );

  try {
    const response = await executeModel(fixPrompt, models, outputSchema, {
      spinnerMessage: `AI Healing: Fixing ${filePath}...`,
      filePath,
    });

    if (response && response.code && response.code.length > 50) {
      printSubStep(`✨ Fix generated. Re-verifying...`, 1);
      return {
        generatedCode: response.code,
        healAttempts: newAttemptCount,
        errors: [],
        lastHealAnalysis: {
          analysis: response.analysis,
          suggestedManualAction: response.suggestedManualAction,
        },
      };
    }
  } catch (err) {
    if (err.message?.startsWith('TRANSIENT:')) {
      return { healAttempts: newAttemptCount, errors: [err.message] };
    }
    printError(`HealerNode failed during invocation: ${err.message}`);
  }

  printSubStep(`Failed to generate fix`, 1);

  // If this was the last attempt, record as unresolved
  if (newAttemptCount >= MAX_HEAL_ATTEMPTS) {
    const errorRecord = {
      filePath: currentFile?.relativeToProject || filePath,
      reason: `Failed to generate a valid AI fix after max attempts (${MAX_HEAL_ATTEMPTS}). Remaining errors: ${errors.length}.`,
      codeSnippet:
        (generatedCode || '').substring(0, 500) + '...\n// (Code truncated)',
      suggestedAction:
        'Manually convert this component to React Native primitives (View, Text).',
    };
    printSubStep(`Marked for manual intervention`, 1);
    return {
      healAttempts: newAttemptCount,
      unresolvedErrors: [errorRecord],
    };
  }

  return { healAttempts: newAttemptCount };
}
