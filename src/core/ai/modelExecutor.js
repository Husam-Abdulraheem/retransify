import {
  printWarning,
  printError,
  startSubSpinner,
  stopSpinner,
} from '../utils/ui.js';
import { thesisMetrics } from '../utils/thesisMetrics.js';

/**
 * executeModel - Centralized AI model runner with structured output, fallbacks, and error handling.
 *
 * @param {string} prompt - The prompt to send to the AI
 * @param {Object} models - { smartModel, fastModel }
 * @param {import('zod').ZodType|null} schema - Optional Zod schema for structured output
 * @param {Object} options - { spinnerMessage, filePath }
 * @returns {Promise<Object|string|null>} - Parsed object if schema provided, raw string otherwise.
 */
export async function executeModel(
  prompt,
  models,
  schema = null,
  options = {}
) {
  const { spinnerMessage = 'AI: Processing...', filePath = 'unknown' } =
    options;

  if (!models.smartModel) {
    printError(`ModelRunner: smartModel is missing for ${filePath}`);
    return null;
  }

  try {
    if (spinnerMessage) {
      startSubSpinner(spinnerMessage);
    }

    let model;
    if (schema) {
      // Use structured output with fallback
      const fallbackModel = models.fastModel.withStructuredOutput(schema);
      const primaryModel = models.smartModel.withStructuredOutput(schema);
      model = primaryModel.withFallbacks({ fallbacks: [fallbackModel] });
    } else {
      // Use raw text output with fallback
      model = models.smartModel.withFallbacks({
        fallbacks: [models.fastModel],
      });
    }

    const response = await model.invoke(prompt);

    // ── Record Thesis Metrics ──────────────────────────────────────
    if (process.env.THESIS_MODE) {
      // Extract tokens from LangChain usage_metadata (standard in newer versions)
      const inputTokens = response.usage_metadata?.input_tokens || 0;
      const outputTokens = response.usage_metadata?.output_tokens || 0;

      // Get model name from response metadata or fallback to the provided model's property
      const actualModelName =
        response.response_metadata?.model_name ||
        models.smartModel?.model || // Google Generative AI uses .model
        models.smartModel?.modelName || // Other providers might use .modelName
        'gemini-3-flash-preview';

      thesisMetrics.recordModelUsage({
        modelName: actualModelName,
        inputTokens,
        outputTokens,
        isHealerRetry: options.isHealerRetry || false,
      });
    }

    if (spinnerMessage) {
      stopSpinner();
    }

    return response;
  } catch (err) {
    if (spinnerMessage) {
      stopSpinner();
    }

    const isTransient =
      err.message?.includes('503') ||
      err.message?.includes('529') ||
      err.message?.includes('429') ||
      err.message?.includes('Too Many Requests') ||
      err.message?.includes('Service Unavailable') ||
      err.message?.includes('overloaded');

    if (isTransient) {
      printWarning(
        `Transient API error for ${filePath}, will retry: ${err.message}`
      );
      // Throwing so the LangGraph retryNode can catch it via state.errors starting with TRANSIENT:
      throw new Error(`TRANSIENT:${err.message}`, { cause: err });
    }

    printError(
      `AI execution failed permanently for ${filePath}: ${err.message}`
    );
    throw err;
  }
}
