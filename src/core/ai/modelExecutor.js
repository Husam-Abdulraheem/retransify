import {
  printSubStep,
  printWarning,
  printError,
  startSubSpinner,
  stopSpinner,
} from '../utils/ui.js';

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
      throw new Error(`TRANSIENT:${err.message}`);
    }

    printError(
      `AI execution failed permanently for ${filePath}: ${err.message}`
    );
    throw err;
  }
}
