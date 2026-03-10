// src/core/graph/nodes/healerNode.js
import { buildFixPrompt } from '../../prompt/promptBuilder.js';
import { cleanAIResponse } from '../../helpers/cleanAIResponse.js';

/**
 * HealerNode - يُصلح الكود بناءً على أخطاء VerifierNode
 *
 * المدخلات: state.generatedCode, state.errors, state.healAttempts
 * المخرجات: state.generatedCode (محدَّث), state.healAttempts (مُزاد)
 *
 * @param {import('../state.js').GraphState} state
 * @param {{ smartModel: Session }} models
 * @returns {Partial<import('../state.js').GraphState>}
 */
export async function healerNode(state, models = {}) {
  const { generatedCode, errors, healAttempts, currentFile, lastErrorHash } =
    state;

  const filePath =
    currentFile?.relativeToProject || currentFile?.filePath || 'unknown';
  const newAttemptCount = (healAttempts || 0) + 1;

  console.log(
    `\n🚑 [HealerNode] محاولة إصلاح ${filePath} (المحاولة ${newAttemptCount})`
  );
  console.log(`   الأخطاء: ${errors.slice(0, 2).join(' | ')}`);

  if (!models.smartModel) {
    console.error('❌ [HealerNode] لا يوجد smartModel');
    return { healAttempts: newAttemptCount };
  }

  // بناء Prompt الإصلاح
  const fixPrompt = buildFixPrompt(generatedCode, errors);

  try {
    const response = await models.smartModel.sendMessage(fixPrompt);
    const parsed = parseHealerResponse(response);

    if (parsed.code && parsed.code.length > 50) {
      console.log(`✨ [HealerNode] تم توليد إصلاح (${parsed.code.length} حرف)`);
      return {
        generatedCode: parsed.code,
        generatedDependencies: parsed.dependencies || [],
        healAttempts: newAttemptCount,
        errors: [], // نصفِّر الأخطاء ليُعيد VerifierNode الفحص
      };
    }
  } catch (err) {
    console.error(`❌ [HealerNode] خطأ: ${err.message}`);
  }

  console.warn(`⚠️  [HealerNode] فشل توليد إصلاح`);
  return { healAttempts: newAttemptCount };
}

function parseHealerResponse(response) {
  try {
    return JSON.parse(response);
  } catch {
    /* متابعة */
  }

  const match = response.match(/```json([\s\S]*?)```/i);
  if (match?.[1]) {
    try {
      return JSON.parse(match[1]);
    } catch {
      /* متابعة */
    }
  }

  return { code: cleanAIResponse(response), dependencies: [] };
}
