// src/core/graph/nodes/analyzerNode.js
import path from 'path';
import fs from 'fs-extra';
import { Project } from 'ts-morph';
import { MemoryVectorStore } from '../helpers/memoryVectorStoreStub.js';
import { createEmbeddings } from '../../ai/aiFactory.js';
import { Document } from '@langchain/core/documents';
import { PROJECT_PROFILES } from '../../config/profiles.js';

// ── Embeddings Model Setup ────────────────────────────────────────────────────
// Used to convert file summaries to vectors for later search in ExecutorNode
// ── Main Node Function ────────────────────────────────────────────────────────

/**
 * AnalyzerNode - Analyzes project files with ts-morph and stores summaries in VectorStore
 *
 * Inputs from state:
 * - state.projectPath: Web React project path
 * - state.filesQueue: Array of file objects (from FileScanner)
 *
 * Outputs to state:
 * - state.facts: Project information (tech stack, sourceRoot, etc.)
 * - state.vectorStore: MemoryVectorStore instance with file summaries
 * - state.vectorIdMap: Map of filename -> ID in VectorStore
 *
 * @param {import('../state.js').GraphState} state
 * @returns {Partial<import('../state.js').GraphState>}
 */
export async function analyzerNode(state) {
  console.log('\n🕵️  [AnalyzerNode] Starting project analysis...');

  const { projectPath, filesQueue } = state;

  // ── 1. Read package.json ──────────────────────────────────────
  let packageJson = {};
  const packageJsonPath = path.join(projectPath, 'package.json');
  if (await fs.pathExists(packageJsonPath)) {
    packageJson = await fs.readJson(packageJsonPath);
  }

  // ── 2. Analyze Tech Stack ─────────────────────────────────────
  const facts = await analyzeTechStack(projectPath, packageJson);
  console.log('✅ [AnalyzerNode] Tech Stack:', facts.tech);

  // ── 3. Scan files with ts-morph and extract summaries ─────────
  const { vectorStore, vectorIdMap } = await buildVectorStore(
    filesQueue,
    projectPath
  );

  console.log(
    `✅ [AnalyzerNode] Indexed ${Object.keys(vectorIdMap).length} files in VectorStore`
  );

  return {
    facts,
    vectorStore,
    vectorIdMap,
  };
}

// ── Tech Stack Analysis ───────────────────────────────────────────────────────

async function analyzeTechStack(projectPath, packageJson) {
  const deps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  const entryFiles = getEntryFiles(projectPath, packageJson);

  const tech = {
    language: detectLanguage(projectPath, deps),
    stateManagement: await detectStateManagement(deps, entryFiles),
    styling: detectStyling(projectPath, deps),
    routing: await detectRouting(deps, entryFiles),
    buildTool: detectBuildTool(projectPath),
  };

  const sourceRoot = inferSourceRoot(projectPath, entryFiles);
  const writePhaseIgnores = getWritePhaseIgnores(tech);

  // Determine main entry point
  let mainEntryPoint = null;
  if (entryFiles && entryFiles.length > 0) {
    mainEntryPoint = entryFiles[0];
    console.log(`🎯 [AnalyzerNode] Entry point: ${mainEntryPoint}`);
  }

  return {
    tech,
    packageJson,
    sourceRoot,
    writePhaseIgnores,
    mainEntryPoint,
    entryFiles,
    projectPath,
  };
}

function detectLanguage(projectPath, deps) {
  if (fs.existsSync(path.join(projectPath, 'tsconfig.json')))
    return 'TypeScript';
  if (deps['typescript']) return 'TypeScript';
  return 'JavaScript';
}

async function detectStateManagement(deps, entryFiles) {
  if (deps['@reduxjs/toolkit'] || deps['react-redux']) {
    const isUsed = await verifyLibraryUsage(
      ['Provider', 'configureStore'],
      entryFiles
    );
    if (isUsed) return 'Redux';
  }
  if (deps['zustand']) return 'Zustand';
  return 'None';
}

function detectStyling(projectPath, deps) {
  if (
    fs.existsSync(path.join(projectPath, 'tailwind.config.js')) ||
    fs.existsSync(path.join(projectPath, 'postcss.config.js'))
  )
    return 'Tailwind';
  if (deps['nativewind']) return 'NativeWind';
  if (deps['tailwindcss']) return 'Tailwind';
  return 'StyleSheet';
}

async function detectRouting(deps, entryFiles) {
  if (deps['expo-router']) return 'ExpoRouter';
  if (deps['react-router-dom'] || deps['react-router-native']) {
    const isUsed = await verifyLibraryUsage(
      ['BrowserRouter', 'NativeRouter', 'Routes', 'RouterProvider'],
      entryFiles
    );
    if (isUsed) return 'ReactRouter';
  }
  return 'None';
}

function detectBuildTool(projectPath) {
  if (fs.existsSync(path.join(projectPath, 'vite.config.js'))) return 'Vite';
  if (fs.existsSync(path.join(projectPath, 'webpack.config.js')))
    return 'Webpack';
  return 'Unknown';
}

function getEntryFiles(projectPath, packageJson = {}) {
  const candidates = [
    'src/index.js',
    'src/index.tsx',
    'src/App.js',
    'src/App.tsx',
    'src/main.js',
    'src/main.tsx',
    'src/store/index.js',
    'src/store/index.ts',
    'index.js',
    'App.js',
  ];
  if (packageJson.main) candidates.unshift(packageJson.main);
  return candidates
    .map((f) => path.join(projectPath, f))
    .filter((f) => fs.existsSync(f));
}

async function verifyLibraryUsage(keywords, files) {
  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf8');
      if (keywords.some((kw) => content.includes(kw))) return true;
    } catch {
      /* Ignore read errors */
    }
  }
  return false;
}

function inferSourceRoot(projectPath, entryFiles) {
  if (!entryFiles || entryFiles.length === 0) return '.';
  const primaryEntry = entryFiles[0];
  const relativeEntry = path.relative(projectPath, primaryEntry);
  const dir = path.dirname(relativeEntry);
  return dir === '.' ? '.' : dir;
}

function getWritePhaseIgnores(tech) {
  let profile = null;
  if (tech.buildTool === 'Vite') profile = PROJECT_PROFILES?.vite;
  else if (tech.buildTool === 'CRA') profile = PROJECT_PROFILES?.cra;
  return profile?.writePhaseIgnores || [];
}

// ── Build VectorStore with ts-morph ───────────────────────────────────────────

/**
 * Scans files with ts-morph, extracts summaries, and stores them in MemoryVectorStore
 * @param {Array} filesQueue - Array of file objects
 * @param {string} projectPath
 * @returns {{ vectorStore: MemoryVectorStore, vectorIdMap: Object }}
 */
async function buildVectorStore(filesQueue, projectPath) {
  const embeddings = createEmbeddings();
  const documents = [];
  const vectorIdMap = {};

  // Setup ts-morph Project
  const tsProject = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: {
      allowJs: true,
      jsx: 2, // React JSX
      strict: false,
      noResolve: true,
      isolatedModules: true,
    },
  });

  for (const fileObj of filesQueue) {
    const filePath = fileObj.filePath || fileObj.relativeToProject;
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(projectPath, filePath);

    try {
      const summary = await extractFileSummary(
        tsProject,
        absolutePath,
        filePath
      );
      if (!summary) continue;

      // Create LangChain Document
      const doc = new Document({
        pageContent: summary,
        metadata: {
          filePath: filePath,
          absolutePath: absolutePath,
          type: 'source_file',
        },
      });

      documents.push({ doc, filePath });
    } catch (err) {
      console.warn(
        `⚠️  [AnalyzerNode] Failed to analyze: ${filePath} - ${err.message}`
      );
    }
  }

  if (documents.length === 0) {
    // Create empty VectorStore to avoid errors
    const emptyStore = new MemoryVectorStore(embeddings);
    return { vectorStore: emptyStore, vectorIdMap: {} };
  }

  // Create VectorStore from Documents
  const docs = documents.map((d) => d.doc);
  const vectorStore = await MemoryVectorStore.fromDocuments(docs, embeddings);

  // Build vectorIdMap: filePath -> index (MemoryVectorStore uses index as ID)
  documents.forEach(({ filePath }, index) => {
    vectorIdMap[filePath] = index;
  });

  return { vectorStore, vectorIdMap };
}

/**
 * Extracts a single file's summary using ts-morph:
 * Interfaces, Props, Hooks, Exported Functions
 *
 * @param {Project} tsProject - ts-morph Project instance
 * @param {string} absolutePath
 * @param {string} relativePath
 * @returns {string|null} Summary text
 */
async function extractFileSummary(tsProject, absolutePath, relativePath) {
  const ext = path.extname(absolutePath);
  const validExts = ['.js', '.jsx', '.ts', '.tsx', '.mjs'];
  if (!validExts.includes(ext)) return null;

  let content;
  try {
    content = await fs.readFile(absolutePath, 'utf-8');
  } catch {
    return null;
  }

  // Add file to ts-morph (or update if exists)
  let sourceFile;
  try {
    sourceFile =
      tsProject.getSourceFile(absolutePath) ||
      tsProject.createSourceFile(absolutePath, content, { overwrite: true });
  } catch {
    return null;
  }

  const summaryParts = [`FILE: ${relativePath}`];

  try {
    // 1. Interfaces
    const interfaces = sourceFile.getInterfaces();
    if (interfaces.length > 0) {
      summaryParts.push('INTERFACES:');
      interfaces.forEach((iface) => {
        const props = iface
          .getProperties()
          .map((p) => `  ${p.getName()}: ${p.getType().getText()}`);
        summaryParts.push(`  ${iface.getName()} { ${props.join(', ')} }`);
      });
    }

    // 2. Type Aliases (Props Types)
    const typeAliases = sourceFile.getTypeAliases();
    if (typeAliases.length > 0) {
      summaryParts.push('TYPES:');
      typeAliases.forEach((ta) => {
        summaryParts.push(
          `  ${ta.getName()} = ${ta.getType().getText().slice(0, 100)}`
        );
      });
    }

    // 3. Exported Functions & Components
    const functions = sourceFile.getFunctions().filter((f) => f.isExported());
    const arrowFunctions = sourceFile.getVariableDeclarations().filter((v) => {
      const init = v.getInitializer();
      return (
        init &&
        (init.getKind() === 213 || init.getKind() === 212) &&
        v.isExported?.()
      );
    });

    if (functions.length > 0 || arrowFunctions.length > 0) {
      summaryParts.push('EXPORTS:');
      functions.forEach((fn) => {
        const params = fn
          .getParameters()
          .map((p) => `${p.getName()}: ${p.getType().getText()}`);
        summaryParts.push(`  function ${fn.getName()}(${params.join(', ')})`);
      });
      arrowFunctions.forEach((v) => {
        summaryParts.push(`  const ${v.getName()}`);
      });
    }

    // 4. Hooks (functions starting with "use")
    const hooks = sourceFile
      .getFunctions()
      .filter((f) => f.getName()?.startsWith('use'));
    if (hooks.length > 0) {
      summaryParts.push('HOOKS:');
      hooks.forEach((h) => summaryParts.push(`  ${h.getName()}`));
    }

    // 5. Imports (to understand dependencies)
    const imports = sourceFile.getImportDeclarations().slice(0, 5); // Only first 5
    if (imports.length > 0) {
      summaryParts.push('IMPORTS:');
      imports.forEach((imp) => {
        summaryParts.push(`  from '${imp.getModuleSpecifierValue()}'`);
      });
    }
  } catch {
    // If ts-morph analysis fails, return basic summary
    summaryParts.push(`CONTENT_PREVIEW: ${content.slice(0, 200)}`);
  }

  return summaryParts.join('\n');
}
