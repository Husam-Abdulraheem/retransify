import fs from 'fs-extra';
import path from 'path';
import { z } from 'zod';
import { printStep, succeedSpinner, printError } from '../../utils/ui.js';
import { executeModel } from '../../ai/modelExecutor.js';
import { buildReportPrompt } from '../../prompt/reportPrompt.js';

const outputSchema = z.object({
  report: z.string().describe('The complete Markdown report content.'),
});

/**
 * ReporterNode — Generates an AI-powered handoff report
 *
 * @param {import('../state.js').GraphState} state
 * @param {{ smartModel: Session, fastModel: Session }} models
 * @returns {Promise<import('../state.js').GraphState>}
 */
export async function reporterNode(state, models = {}) {
  printStep('Reporter — generating AI handoff report');

  const {
    targetProjectPath,
    telemetry = [],
    pathMap = {},
    unresolvedErrors = [],
    failedDependencies = [],
    navigationSchema = {},
    facts = {},
  } = state;

  const reportPath = path.join(targetProjectPath, 'RETRANSIFY_REPORT.md');

  // ── 1. Prepare Telemetry Payload ────────────────────────────
  const payload = {
    metrics: {
      totalFiles: telemetry.length,
      success: telemetry.filter((t) => t.status === 'success').length,
      healed: telemetry.filter((t) => t.status === 'healed').length,
      failed: telemetry.filter((t) => t.status === 'manual_action_required')
        .length,
    },
    telemetry: telemetry,
    pathMap: pathMap,
    unresolvedIssues: unresolvedErrors.map((e) => ({
      file: e.filePath,
      reason: e.reason,
      suggestion: e.suggestedAction,
    })),
    failedDeps: failedDependencies,
    navigation: navigationSchema,
    techStack: facts.tech || {},
  };

  // ── 2. Build AI Prompt (Externalized) ───────────────────────
  const prompt = buildReportPrompt(payload);

  try {
    const response = await executeModel(prompt, models, outputSchema, {
      spinnerMessage: 'AI: Compiling final release document...',
    });

    if (response && response.report) {
      await fs.writeFile(reportPath, response.report, 'utf8');
      succeedSpinner(
        `Success! Final handoff report saved to: RETRANSIFY_REPORT.md`
      );
    } else {
      throw new Error('AI returned empty report content');
    }
  } catch (err) {
    printError(`Failed to generate AI report: ${err.message}`);
    // Fallback to a basic report if AI fails
    const fallbackReport = `# Retransify Migration Report\n\nMigration completed with ${unresolvedErrors.length} issues. AI generation failed.`;
    await fs.writeFile(reportPath, fallbackReport, 'utf8');
  }

  return { ...state };
}
