import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import { scanProject } from "../core/fileScanner.js";
import { parseFile } from "../core/astParser.js";
import { buildDependencyGraph } from "../core/graphBuilder.js";
import { buildProjectContext } from "../core/contextBuilder.js";

import { Analyzer } from "../core/phases/analyzer.js";
import { Planner } from "../core/phases/planner.js";
import { Executor } from "../core/phases/executor.js";
import { StateManager } from "../core/stateManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runCLI() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    return printHelp();
  }

  const command = args[0];

  if (command === "convert") {
    // Basic argument parsing
    const projectPathIndex = 1;
    let projectPath = args[projectPathIndex];
    
    // Check if projectPath looks like a flag, if so, assume CWD or handle differently
    // For simplicity, we assume: retransify convert <path> [--sdk <version>]
    if (!projectPath || projectPath.startsWith('--')) {
        projectPath = process.cwd();
    } else {
        projectPath = path.resolve(projectPath);
    }

    // Parse --sdk flag
    let sdkVersion = null;
    const sdkIndex = args.indexOf('--sdk');
    if (sdkIndex !== -1 && args[sdkIndex + 1]) {
        sdkVersion = args[sdkIndex + 1];
    }

    await handleConvert(projectPath, sdkVersion);
    return;
  }

  printHelp();
}

function printHelp() {
  console.log(`
Retransify (Local CLI)

Usage:
  node cli.js convert <path-to-react-project> [--sdk <version>]

Example:
  node cli.js convert ./my-react-app --sdk 50
`);
}

async function handleConvert(projectPath, sdkVersion = null) {
  console.log("🚀 Starting conversion...");
  console.log("📂 Project path:", projectPath);
  if (sdkVersion) console.log(`ℹ️  Desired SDK Version: ${sdkVersion}`);

  // 0) Select AI Model
  const modelInfo = await promptModelSelection();
  console.log(`🤖 Selected Model: ${modelInfo.value} (${modelInfo.provider})`);

  // 1) Initialize State Manager
  const stateManager = new StateManager(projectPath);

  // 2) Run Analyzer (Phase 1)
  const analyzer = new Analyzer(projectPath);
  const globalContext = await analyzer.analyze();
  console.log(`🧠 Recognized Stack: ${globalContext.techStack}`);
  console.log(`🎨 Style System: ${globalContext.styleSystem}`);

  // 3) Scan & Build Dependency Graph (Existing logic reused for Graph)
  // We still need the detailed file scan for the planner
  const { files, structure } = await scanProject(projectPath);
  const parsedFiles = [];
  for (const f of files) {
    const ast = await parseFile(f.absolutePath);
    ast.relativeToSrc = f.relativeToSrc;
    parsedFiles.push(ast);
  }
  const { importsGraph, reverseGraph } = buildDependencyGraph(parsedFiles);

  // 4) Run Planner (Phase 2)
  const planner = new Planner(globalContext, importsGraph);
  const plan = await planner.plan(files);
  console.log(`📋 Plan creates order for ${plan.files.length} files.`);

  // 5) Build Full Project Context (for detailed file building)
  const projectContext = buildProjectContext({
    files,
    parsedFiles,
    importsGraph,
    reverseGraph,
    structure,
  });

  // 6) Run Executor (Phase 3)
  const executor = new Executor(globalContext, plan, stateManager, projectContext, { 
    sdkVersion,
    model: modelInfo.value,
    provider: modelInfo.provider
  });
  await executor.execute();
}

async function promptModelSelection() {
  const models = [
    { name: "Gemini 3 Flash", value: "gemini-3.0-flash", provider: "gemini" },
    { name: "Gemini 2.5 Flash", value: "gemini-2.5-flash", provider: "gemini" },
    { name: "Gemini 2.5 Flash Lite", value: "gemini-2.5-flash-lite", provider: "gemini" },
    { name: "Llama 3.3 70B (Versatile)", value: "llama-3.3-70b-versatile", provider: "groq" },
    { name: "Llama 3.1 8B (Instant)", value: "llama-3.1-8b-instant", provider: "groq" },
    { name: "Mixtral 8x7b", value: "mixtral-8x7b-32768", provider: "groq" }
  ];

  console.log("\n🤖 Select AI Model:");
  models.forEach((m, i) => {
    console.log(`  ${i + 1}) ${m.name}`);
  });

  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('\n👉 Enter choice (1-5) [Default: 1]: ', (answer) => {
      rl.close();
      const choice = parseInt(answer.trim());
      let selected;
      
      if (isNaN(choice) || choice < 1 || choice > models.length) {
        selected = models[0]; // Default to first option
      } else {
        selected = models[choice - 1];
      }

      if (!selected.value) {
        // Fallback or error if value is missing (sanity check)
        console.warn("⚠️  Warning: Selected model value is missing. Defaulting to Gemini 3 Flash.");
        selected = models[0];
      }

      resolve(selected);
    });
  });
}
