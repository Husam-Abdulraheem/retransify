import { StateManager } from '../services/stateManager.js';
import { GlobalMigrationContext } from '../context/GlobalMigrationContext.js';
import { Analyzer } from '../phases/analyzer.js';
import { scanProject } from '../scanners/FileScanner.js';
import { parseFile } from '../parser/astParser.js';
import { buildDependencyGraph } from '../parser/graphBuilder.js';
import { Planner } from '../phases/planner.js';
import { buildProjectContext } from '../parser/contextBuilder.js';
import { Executor } from '../phases/executor.js';
import { promptModelSelection } from '../../cli/prompts.js';

export async function handleConvert(projectPath, sdkVersion = null) {
  console.log('🚀 Starting conversion...');
  console.log('📂 Project path:', projectPath);
  if (sdkVersion) console.log(`ℹ️  Desired SDK Version: ${sdkVersion}`);

  // 0) Select AI Model
  const modelInfo = await promptModelSelection();
  console.log(`🤖 Selected Model: ${modelInfo.value} (${modelInfo.provider})`);

  // 1) Initialize State Manager & Global Context
  const stateManager = new StateManager(projectPath);
  const context = new GlobalMigrationContext();

  // 2) Run Analyzer (Phase 1)
  const analyzer = new Analyzer(projectPath);
  await analyzer.analyze(context);

  const tech = context.facts.tech || {};
  console.log(
    `🧠 Recognized Stack: ${tech.language} / ${tech.stateManagement} / ${tech.routing} / ${tech.buildTool}`
  );
  console.log(`🎨 Style System: ${tech.styling}`);

  // 3) Scan & Build Dependency Graph (Existing logic reused for Graph)
  // We still need the detailed file scan for the planner
  const { files, structure } = await scanProject(projectPath);
  const parsedFiles = [];
  for (const f of files) {
    const ast = await parseFile(f.absolutePath);
    ast.relativeToProject = f.relativeToProject;
    parsedFiles.push(ast);
  }
  const { importsGraph, reverseGraph } = buildDependencyGraph(parsedFiles);

  // 4) Run Planner (Phase 2)
  const planner = new Planner(importsGraph);
  await planner.plan(context, files);

  const fileCount = context.decisions.executionOrder
    ? context.decisions.executionOrder.length
    : 0;
  console.log(`📋 Plan creates order for ${fileCount} files.`);

  // 5) Build Full Project Context (for detailed file building)
  const projectContext = buildProjectContext({
    files,
    parsedFiles,
    importsGraph,
    reverseGraph,
    structure,
    facts: context.facts || {}, // [Enhanced] Pass technical facts
  });

  // 6) Run Executor (Phase 3)
  const executor = new Executor(context, stateManager, projectContext, {
    sdkVersion,
    model: modelInfo.value,
    provider: modelInfo.provider,
  });
  await executor.execute();
}
