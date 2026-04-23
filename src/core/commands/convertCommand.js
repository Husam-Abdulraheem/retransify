import { scanProject } from '../scanners/FileScanner.js';
import { runMigrationWorkflow } from '../graph/workflow.js';
import {
  startSpinner,
  failSpinner,
  printMeta,
  printStep,
  succeedSpinner,
} from '../utils/ui.js';
import { fixBrokenImports } from '../utils/importHealer.js';
import { fixBrokenAssets } from '../utils/assetHealer.js';

export async function handleConvert(projectPath, sdkVersion = null) {
  // Scan project files
  startSpinner('Scanning project...');

  try {
    const { files, framework: stack } = await scanProject(projectPath);

    // Print clean metadata block once — right before the workflow starts
    printMeta({
      target: projectPath,
      stack,
      queue: files.length,
    });

    // Run LangGraph Workflow
    const finalState = await runMigrationWorkflow(projectPath, files, {
      sdkVersion,
      provider: process.env.AI_PROVIDER || 'gemini',
    });

    const targetProjectPath = finalState.targetProjectPath;

    // Final Polish
    printStep(
      'Final Polish — Running Auto-Healer to resolve any broken paths...'
    );
    const importHealth = await fixBrokenImports(targetProjectPath);
    const assetHealth = await fixBrokenAssets(targetProjectPath);

    if (importHealth.healedCount > 0 || assetHealth.healedCount > 0) {
      succeedSpinner(
        `Successfully auto-healed ${importHealth.healedCount + assetHealth.healedCount} broken references.`
      );
    }
  } catch (err) {
    failSpinner(`Scan failed: ${err.message}`);
    throw err;
  }
}
