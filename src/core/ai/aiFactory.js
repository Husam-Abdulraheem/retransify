// src/core/ai/aiFactory.js
import dotenv from 'dotenv';
import { sendToGemini, GeminiSession } from './geminiClient.js';
import { sendToGroq, GroqSession } from './groqClient.js';

dotenv.config();

// ── نماذج افتراضية لكل مزود ─────────────────────────────────────────────────

const DEFAULT_MODELS = {
  gemini: {
    fast: 'gemini-2.0-flash', // سريع: للتحليل والتخطيط
    smart: 'gemini-2.5-pro', // ذكي: للتنفيذ والإصلاح
  },
  groq: {
    fast: 'llama-3.1-8b-instant', // سريع: خفيف وسريع
    smart: 'llama-3.3-70b-versatile', // ذكي: دقيق ومتعمق
  },
};

// ── دوال المصنع الأساسية (موجودة سابقاً - لا تغيير) ─────────────────────────

/**
 * Creates a stateful session for the configured AI provider.
 * @param {string} [model]
 * @param {string} [provider]
 * @returns {GroqSession|GeminiSession}
 */
export function createSession(model = null, provider = null) {
  const selectedProvider = provider || process.env.AI_PROVIDER || 'gemini';

  switch (selectedProvider.toLowerCase()) {
    case 'groq':
      return new GroqSession(model);
    case 'gemini':
    default:
      return new GeminiSession(model);
  }
}

/**
 * Sends the prompt to the configured AI provider (Stateless, One-off).
 * @param {string} prompt
 * @param {string} [model]
 * @param {string} [provider]
 * @returns {Promise<string>}
 */
export async function sendToAI(prompt, model = null, provider = null) {
  const selectedProvider = provider || process.env.AI_PROVIDER || 'gemini';

  switch (selectedProvider.toLowerCase()) {
    case 'groq':
      return await sendToGroq(prompt, model);
    case 'gemini':
    default:
      return await sendToGemini(prompt, model);
  }
}

// ── الإضافات الجديدة: دعم fastModel و smartModel ─────────────────────────────

/**
 * يُنشئ نموذجاً سريعاً (fastModel) للمهام الخفيفة:
 * - AnalyzerNode: تحليل الملفات
 * - PlannerNode: ترتيب الملفات
 * - DependencyResolverNode: اقتراح بدائل المكتبات
 *
 * @param {string} [provider] - المزود (gemini | groq). الافتراضي: AI_PROVIDER
 * @param {string} [modelOverride] - تجاوز النموذج الافتراضي يدوياً
 * @returns {GeminiSession|GroqSession}
 */
export function createFastModel(provider = null, modelOverride = null) {
  const selectedProvider = (
    provider ||
    process.env.AI_PROVIDER ||
    'gemini'
  ).toLowerCase();
  const modelName =
    modelOverride ||
    process.env.AI_FAST_MODEL ||
    DEFAULT_MODELS[selectedProvider]?.fast ||
    DEFAULT_MODELS.gemini.fast;

  console.log(`⚡ FastModel: [${selectedProvider}] ${modelName}`);
  return createSession(modelName, selectedProvider);
}

/**
 * يُنشئ نموذجاً ذكياً (smartModel) للمهام المعقدة:
 * - ExecutorNode: تحويل الكود
 * - HealerNode: إصلاح الأخطاء
 *
 * @param {string} [provider] - المزود (gemini | groq). الافتراضي: AI_PROVIDER
 * @param {string} [modelOverride] - تجاوز النموذج الافتراضي يدوياً
 * @returns {GeminiSession|GroqSession}
 */
export function createSmartModel(provider = null, modelOverride = null) {
  const selectedProvider = (
    provider ||
    process.env.AI_PROVIDER ||
    'gemini'
  ).toLowerCase();
  const modelName =
    modelOverride ||
    process.env.AI_SMART_MODEL ||
    DEFAULT_MODELS[selectedProvider]?.smart ||
    DEFAULT_MODELS.gemini.smart;

  console.log(`🧠 SmartModel: [${selectedProvider}] ${modelName}`);
  return createSession(modelName, selectedProvider);
}

/**
 * يُنشئ كلا النموذجين معاً في استدعاء واحد.
 * يُستخدم في workflow.js لتهيئة النماذج مرة واحدة وتمريرها للعقد.
 *
 * @param {Object} options
 * @param {string} [options.provider]
 * @param {string} [options.fastModelOverride]
 * @param {string} [options.smartModelOverride]
 * @returns {{ fastModel: Session, smartModel: Session }}
 *
 * @example
 * const { fastModel, smartModel } = createModelPair();
 * // استخدم fastModel في AnalyzerNode و PlannerNode
 * // استخدم smartModel في ExecutorNode و HealerNode
 */
export function createModelPair(options = {}) {
  const {
    provider = null,
    fastModelOverride = null,
    smartModelOverride = null,
  } = options;

  return {
    fastModel: createFastModel(provider, fastModelOverride),
    smartModel: createSmartModel(provider, smartModelOverride),
  };
}
