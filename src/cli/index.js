import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import { scanProject } from "../core/fileScanner.js";
import { parseFile } from "../core/astParser.js";
import { buildDependencyGraph } from "../core/graphBuilder.js";
import { buildProjectContext, buildFileContext } from "../core/contextBuilder.js";
import { convertFileWithAI } from "../core/aiClient.js";
import { saveConvertedFile } from "../core/nativeWriter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runCLI() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    return printHelp();
  }

  const command = args[0];

  if (command === "convert") {
    const projectPath = args[1] ? path.resolve(args[1]) : process.cwd();
    await handleConvert(projectPath);
    return;
  }

  printHelp();
}

function printHelp() {
  console.log(`
Retransify (Local CLI)

Usage:
  node cli.js convert <path-to-react-project>

Example:
  node cli.js convert ./my-react-app
`);
}

async function handleConvert(projectPath) {
  console.log("🚀 Starting conversion...");
  console.log("📂 Project path:", projectPath);

  if (!fs.existsSync(projectPath)) {
    console.error("❌ Error: Project path does not exist!");
    return;
  }

  // 1) Scan React project
  const { files, structure } = await scanProject(projectPath);

  console.log(`📄 Found ${files.length} files in src/`);

  // 2) AST parsing
  const parsedFiles = [];
  for (const f of files) {
    const ast = await parseFile(f.absolutePath);
    ast.relativeToSrc = f.relativeToSrc;
    parsedFiles.push(ast);

    console.log(`🔍 Parsed ${f.relativeToSrc}`);
  }

  // 3) Build dependency graph
  const { importsGraph, reverseGraph } = buildDependencyGraph(parsedFiles);
  console.log("🔗 Dependency graph built");

  // 4) Build full project context
  const projectContext = buildProjectContext({
    files,
    parsedFiles,
    importsGraph,
    reverseGraph,
    structure,
  });

  console.log("🧠 Project context generated");

  // 5) Convert each file
  for (const file of files) {
    console.log(`\n🔄 Converting ${file.relativeToSrc}...`);

    const fileContext = buildFileContext(file.relativeToSrc, projectContext);

    const rnCode = await convertFileWithAI(fileContext);
    console.log("📤 Gemini output preview:", rnCode.slice(0, 200)); // أول 200 حرف


    await saveConvertedFile(file.relativeToSrc, rnCode);
  }

  console.log("\n🎉 Conversion complete!");
}
