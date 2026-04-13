import { z } from 'zod';
import {
  printStep,
  printSubStep,
  startSpinner,
  succeedSpinner,
  failSpinner,
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

  try {
    const model = models.fastModel.withStructuredOutput(layoutAgentSchema);
    const result = await model.invoke(prompt);

    succeedSpinner(`Determined Architecture: ${result.type.toUpperCase()}`);

    if (result.modals.length > 0) {
      printSubStep(`Identified Modals: ${result.modals.join(', ')}`);
    }

    return result;
  } catch (error) {
    failSpinner(
      'Layout Agent encountered an error. Defaulting to stack navigation.'
    );
    console.error(`[Layout Agent Error]: ${error.message}`);

    return fallbackSchema;
  }
}
