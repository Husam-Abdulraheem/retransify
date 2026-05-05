// src/core/graph/nodes/healerNode.js
import { buildFixPrompt } from '../../prompt/promptBuilder.js';
import { z } from 'zod';
import { printSubStep, printError, printWarning } from '../../utils/ui.js';
import { MAX_HEAL_ATTEMPTS } from '../state.js';
import { executeModel } from '../../ai/modelExecutor.js';
import { optimizeFileContext } from '../../helpers/contextOptimizer.js';
import { PathMapper } from '../../helpers/pathMapper.js';

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
  requiredDependencies: z
    .array(z.string())
    .optional()
    .describe(
      'New npm package names (exact install names) introduced in the fix that are NOT already installed. The pipeline will run "npx expo install" for each. Leave empty if no new packages were added.'
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
    contractRegistry,
    facts,
  } = state;

  const filePath =
    currentFile?.relativeToProject || currentFile?.filePath || 'unknown';
  const newAttemptCount = (healAttempts || 0) + 1;

  printSubStep(`🚑 Healing Attempt ${newAttemptCount}/${MAX_HEAL_ATTEMPTS}...`);

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

  // ── Resolve cross-file contract context for informed healing ─────────────
  // Give the Healer the exact function signatures of every local import so it
  // can fix call-site argument mismatches without hallucinating the signature.
  let contractContext = '';
  if (contractRegistry) {
    try {
      const codeToAnalyze = healerPayload.code || '';
      const localPaths = await PathMapper.resolveLocalImports(
        codeToAnalyze,
        filePath,
        facts?.pathAliases || {}
      );
      if (localPaths.length > 0) {
        contractContext = contractRegistry.toPromptContext(localPaths);
      }
    } catch (contractErr) {
      // Non-fatal — healer continues without contract context.
      printWarning(
        `Healer: contract context resolution failed — ${contractErr.message}`
      );
    }
  }

  const fixPrompt = buildFixPrompt(
    healerPayload.code,
    healerPayload.errors,
    healerPayload.installedPackages,
    healerPayload.state,
    healerPayload.exactImportsMap,
    contractContext
  );

  try {
    const response = await executeModel(fixPrompt, models, outputSchema, {
      spinnerMessage: `AI Healing: Fixing ${filePath}...`,
      filePath,
      isHealerRetry: true,
    });

    if (response && response.code && response.code.length > 50) {
      const aiDeclaredDeps = (response.requiredDependencies || []).filter(
        (pkg) => pkg && !installedPackages.includes(pkg)
      );
      if (aiDeclaredDeps.length > 0) {
        printSubStep(
          `Healer declared ${aiDeclaredDeps.length} new dep(s): ${aiDeclaredDeps.join(', ')}`,
          1
        );
      }
      printSubStep(`✨ Fix applied. Validating...`, 1);
      return {
        generatedCode: response.code,
        healAttempts: newAttemptCount,
        errors: [],
        missingDependencies: aiDeclaredDeps,
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

  // If this was the last attempt, simply return the count and let DiskWriter handle the failure state
  if (newAttemptCount >= MAX_HEAL_ATTEMPTS) {
    printSubStep(`Marked for manual intervention`, 1);
    return {
      healAttempts: newAttemptCount,
    };
  }

  return { healAttempts: newAttemptCount };
}
