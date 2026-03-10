import { scanProject } from '../scanners/FileScanner.js';
import { runMigrationWorkflow } from '../graph/workflow.js';

export async function handleConvert(projectPath, sdkVersion = null) {
  console.log('🚀 Starting conversion...');
  console.log('📂 Project path:', projectPath);
  if (sdkVersion) console.log(`ℹ️  Desired SDK Version: ${sdkVersion}`);

  // 1) Scan Project to get the raw file queue
  console.log('🔍 Scanning project files...');
  const { files } = await scanProject(projectPath);

  // 2) Run LangGraph Workflow
  await runMigrationWorkflow(projectPath, files, {
    sdkVersion,
    provider: process.env.AI_PROVIDER || 'gemini',
  });
}
