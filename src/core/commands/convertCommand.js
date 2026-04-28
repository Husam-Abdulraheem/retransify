import { scanProject } from '../scanners/FileScanner.js';
import { runMigrationWorkflow } from '../graph/workflow.js';
import { startSpinner, failSpinner, printMeta } from '../utils/ui.js';

export async function handleConvert(projectPath, sdkVersion = null) {
  // Scan project files
  startSpinner('Scanning project...');

  try {
    const { files, framework: stack } = await scanProject(projectPath);

    // Print clean metadata block once — right before the workflow starts
    printMeta({
      target: projectPath,
      stack,
      initialFiles: files.length,
    });

    // Run LangGraph Workflow
    await runMigrationWorkflow(projectPath, files, {
      sdkVersion,
      provider: process.env.AI_PROVIDER || 'gemini',
    });
  } catch (err) {
    failSpinner(`Scan failed: ${err.message}`);
    throw err;
  }
}
