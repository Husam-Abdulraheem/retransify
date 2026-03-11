// src/core/graph/nodes/healerNode.js
import { buildFixPrompt } from '../../prompt/promptBuilder.js';
import { cleanAIResponse } from '../../helpers/cleanAIResponse.js';

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
  const { generatedCode, errors, healAttempts, currentFile } = state;

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

  // Build Fix Prompt
  const fixPrompt = buildFixPrompt(generatedCode, errors);

  try {
    const response = await models.smartModel.sendMessage(fixPrompt);
    const parsed = parseHealerResponse(response);

    if (parsed.code && parsed.code.length > 50) {
      console.log(
        `✨ [HealerNode] Generated fix (${parsed.code.length} chars)`
      );
      return {
        generatedCode: parsed.code,
        generatedDependencies: parsed.dependencies || [],
        healAttempts: newAttemptCount,
        errors: [], // Reset errors so VerifierNode can re-check
      };
    }
  } catch (err) {
    console.error(`❌ [HealerNode] Error: ${err.message}`);
  }

  console.warn(`⚠️  [HealerNode] Failed to generate fix`);
  return { healAttempts: newAttemptCount };
}

function parseHealerResponse(response) {
  try {
    return JSON.parse(response);
  } catch {
    /* Continue */
  }

  const match = response.match(/```json([\s\S]*?)```/i);
  if (match?.[1]) {
    try {
      return JSON.parse(match[1]);
    } catch {
      /* Continue */
    }
  }

  return { code: cleanAIResponse(response), dependencies: [] };
}
