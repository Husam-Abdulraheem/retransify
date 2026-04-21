import { z } from 'zod';
import {
  printStep,
  printSubStep,
  startSpinner,
  succeedSpinner,
  failSpinner,
  printWarning,
} from '../../utils/ui.js';
import { buildLayoutAgentPrompt } from '../../prompt/layoutPrompt.js';
const layoutAgentSchema = z.object({
  type: z
    .enum(['tabs', 'drawer', 'stack'])
    .describe('The primary navigation structure for the application root'),
  tabs: z
    .array(z.string())
    .default([])
    .describe(
      'List of route paths (from routeMap values) that should be tabs. Typically 2-5 screens.'
    ),
  drawerScreens: z
    .array(z.string())
    .default([])
    .describe(
      'List of route paths that should be drawer items, if drawer layout is chosen.'
    ),
  modals: z
    .array(z.string())
    .default([])
    .describe(
      'List of route paths that act as modals (high inputs/forms count, no navigation links).'
    ),
});

/**
 * Runs the Layout Agent to determine navigation schema based on AST metadata.
 *
 * @param {Object} routeMap
 * @param {Object} routeMetadata
 * @param {Object} models
 */
export async function runLayoutAgent(routeMap, routeMetadata, models) {
  const fallbackSchema = {
    type: 'stack',
    tabs: [],
    drawerScreens: [],
    modals: [],
  };

  if (!models || !models.fastModel) {
    return fallbackSchema;
  }

  printStep('Layout Agent — Structuring Navigation');
  startSpinner('Analyzing AST metadata to determine optimal UX layout...');

  const prompt = buildLayoutAgentPrompt(routeMap, routeMetadata);

  const MAX_RETRIES = 3;
  let lastError = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const model = models.fastModel.withStructuredOutput(layoutAgentSchema);
      const result = await model.invoke(prompt);

      succeedSpinner(`Determined Architecture: ${result.type.toUpperCase()}`);

      if (result.modals.length > 0) {
        printSubStep(`Identified Modals: ${result.modals.join(', ')}`);
      }

      return result;
    } catch (error) {
      lastError = error;

      // Handle 429 Too Many Requests (Rate Limit)
      if (error.message.includes('429') && attempt < MAX_RETRIES - 1) {
        const waitTime = (attempt + 1) * 2000;
        printWarning(
          `[Rate Limit] Gemini is busy. Retrying in ${waitTime / 1000}s... (Attempt ${
            attempt + 1
          }/${MAX_RETRIES})`
        );
        await new Promise((r) => setTimeout(r, waitTime));
        continue;
      }

      // Break on other errors or max retries
      break;
    }
  }

  failSpinner(
    'Layout Agent encountered an error after retries. Defaulting to stack navigation.'
  );
  console.error(`[Layout Agent Error]: ${lastError.message}`);

  return fallbackSchema;
}
