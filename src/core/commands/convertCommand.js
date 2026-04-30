import { scanProject } from '../scanners/FileScanner.js';
import { runMigrationWorkflow } from '../graph/workflow.js';
import { startSpinner, failSpinner, printMeta } from '../utils/ui.js';

export async function handleConvert(sourceProjectPath, targetProjectPath) {
  // Scan project files
  startSpinner('Scanning project...');

  try {
    const { files, framework: stack } = await scanProject(sourceProjectPath);

    // Print clean metadata block once — right before the workflow starts
    printMeta({
      target: sourceProjectPath,
      stack,
      initialFiles: files.length,
    });

    // Run LangGraph Workflow
    await runMigrationWorkflow(sourceProjectPath, targetProjectPath, files, {
      provider: process.env.AI_PROVIDER || 'gemini',
    });
  } catch (err) {
    failSpinner(`Scan failed: ${err.message}`);
    throw err;
  }
}
