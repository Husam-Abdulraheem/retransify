// src/core/ai/aiFactory.js
import dotenv from 'dotenv';
import { sendToGemini, GeminiSession } from './geminiClient.js';
import { sendToGroq, GroqSession } from './groqClient.js';

dotenv.config();

// ── Default Models per Provider ───────────────────────────────────────────

const DEFAULT_MODELS = {
  gemini: {
    fast: 'gemini-2.0-flash', // Fast: for analysis and planning
    smart: 'gemini-2.5-pro', // Smart: for execution and healing
  },
  groq: {
    fast: 'llama-3.1-8b-instant', // Fast: lightweight and fast
    smart: 'llama-3.3-70b-versatile', // Smart: accurate and deep
  },
};

// ── Base Factory Functions (Existing - No Changes) ────────────────────────

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

// ── New Additions: fastModel and smartModel Support ───────────────────────

/**
 * Creates a fast model (fastModel) for lightweight tasks:
 * - AnalyzerNode: File analysis
 * - PlannerNode: File ordering
 * - DependencyResolverNode: Library alternatives suggestion
 *
 * @param {string} [provider] - Provider (gemini | groq). Default: AI_PROVIDER
 * @param {string} [modelOverride] - Manually override default model
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
 * Creates a smart model (smartModel) for complex tasks:
 * - ExecutorNode: Code conversion
 * - HealerNode: Error healing
 *
 * @param {string} [provider] - Provider (gemini | groq). Default: AI_PROVIDER
 * @param {string} [modelOverride] - Manually override default model
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
 * Creates both models together in a single call.
 * Used in workflow.js to initialize models once and pass them to nodes.
 *
 * @param {Object} options
 * @param {string} [options.provider]
 * @param {string} [options.fastModelOverride]
 * @param {string} [options.smartModelOverride]
 * @returns {{ fastModel: Session, smartModel: Session }}
 *
 * @example
 * const { fastModel, smartModel } = createModelPair();
 * // Use fastModel in AnalyzerNode and PlannerNode
 * // Use smartModel in ExecutorNode and HealerNode
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
