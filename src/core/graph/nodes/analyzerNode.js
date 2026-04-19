import path from 'path';
import fs from 'fs-extra';
import { Project, SyntaxKind } from 'ts-morph';
import { FrameworkDetector } from '../../detectors/FrameworkDetector.js';
import { setupNativeWind } from '../../services/StyleConfigurator.js';
import { ContextStore } from '../helpers/ContextStore.js';
import { PROJECT_PROFILES } from '../../config/profiles.js';
import {
  printStep,
  printSubStep,
  printWarning,
  startSubSpinner,
  stopSpinner,
} from '../../utils/ui.js';

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
  printStep('Analyzer — scanning project');

  const { projectPath, filesQueue } = state;

  // ── 1. Read package.json ──────────────────────────────────────
  let packageJson = {};
  const packageJsonPath = path.join(projectPath, 'package.json');
  if (await fs.pathExists(packageJsonPath)) {
    packageJson = await fs.readJson(packageJsonPath);
  }

  // ── 2. Detect Build Tool ─────────────────────────────────────────
  const { type: buildToolFramework } =
    await FrameworkDetector.detect(projectPath);

  // Setup ts-morph Project early for analysis
  const tsConfigPath = path.join(projectPath, 'tsconfig.json');
  const jsConfigPath = path.join(projectPath, 'jsconfig.json');
  const configPath = (await fs.pathExists(tsConfigPath))
    ? tsConfigPath
    : (await fs.pathExists(jsConfigPath))
      ? jsConfigPath
      : undefined;

  const tsProject = new Project({
    tsConfigFilePath: configPath,
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

  // Extract Path Aliases for dynamic mapping
  const pathAliases = tsProject.getCompilerOptions().paths || {};
  if (Object.keys(pathAliases).length > 0) {
    printSubStep(
      `Detected ${Object.keys(pathAliases).length} path aliases in config`
    );
  }

  // ── 3. Analyze Tech Stack ─────────────────────────────────────
  const facts = await analyzeTechStack(
    projectPath,
    packageJson,
    tsProject,
    buildToolFramework,
    filesQueue
  );
  facts.pathAliases = pathAliases;
  printSubStep(`Tech Stack: ${JSON.stringify(facts.tech)}`);

  if (
    facts.tech.styling === 'Tailwind' ||
    facts.tech.styling === 'NativeWind'
  ) {
    printSubStep('Configuring NativeWind automatically...');
    // إنشاء ملفات tailwind.config.js و babel.config.js
    await setupNativeWind(state.rnProjectPath);

    // إجبار التثبيت
    if (state.dependencyManager) {
      state.dependencyManager.add(['nativewind', 'tailwindcss']);
      await state.dependencyManager.installAll(state.rnProjectPath);
    }
  }

  // ── 4. Scan files with ts-morph and extract summaries ─────────
  const { contextStore, enrichedFiles } = await buildContextStore(
    filesQueue,
    projectPath,
    tsProject
  );

  printSubStep(`Indexed ${contextStore.size} files in ContextStore`);

  return {
    facts,
    vectorStore: contextStore,
    filesQueue: enrichedFiles,
  };
}

// ── Tech Stack Analysis ───────────────────────────────────────────────────────

async function analyzeTechStack(
  projectPath,
  packageJson,
  tsProject,
  buildToolFramework,
  filesQueue
) {
  const entryFilePath = await getRealEntryPoint(
    projectPath,
    buildToolFramework
  );

  const deps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  // Deep AST technical analysis
  const astTech = await analyzeTechStackAST(
    entryFilePath,
    tsProject,
    deps,
    filesQueue
  );

  const tech = {
    language: detectLanguage(projectPath, deps),
    stateManagement: astTech.stateManagement,
    styling: detectStyling(projectPath, deps),
    routing: astTech.routing,
    buildTool: buildToolFramework,
  };

  const writePhaseIgnores = getWritePhaseIgnores(tech);

  const sourceRoot = inferSourceRoot(projectPath, entryFilePath);

  return {
    tech,
    packageJson,
    mainEntryPoint: entryFilePath,
    projectPath,
    writePhaseIgnores,
    sourceRoot,
  };
}

export async function getRealEntryPoint(projectPath, buildTool) {
  if (buildTool === 'vite' || buildTool === 'Vite') {
    const htmlPath = path.join(projectPath, 'index.html');
    if (await fs.pathExists(htmlPath)) {
      const htmlContent = await fs.readFile(htmlPath, 'utf8');
      // Search for main script source in index.html
      const scriptMatch = htmlContent.match(/<script.+?src=["'](.*?)["']/i);
      if (scriptMatch && scriptMatch[1]) {
        let scriptPath = scriptMatch[1].replace(/^\//, '');
        return path.join(projectPath, scriptPath);
      }
    }
  }

  // Fallback for CRA or generic React
  const possibleCRAEntries = ['src/index.js', 'src/index.jsx', 'src/index.tsx'];
  for (const entry of possibleCRAEntries) {
    const fullPath = path.join(projectPath, entry);
    if (await fs.pathExists(fullPath)) return fullPath;
  }

  return null;
}

async function analyzeTechStackAST(entryFilePath, tsProject, deps, filesQueue) {
  const tech = { stateManagement: 'None', routing: 'None' };

  const coreDeps = [
    'react-router-dom',
    'react-redux',
    '@reduxjs/toolkit',
    'zustand',
    'mobx',
  ];
  const hasRelevantDeps = coreDeps.some((d) => deps[d]);

  if (!hasRelevantDeps && !deps['react']) return tech;

  const targetFiles = filesQueue.filter(
    (f) =>
      /app\.(js|jsx|ts|tsx)$/i.test(f.filename) ||
      /index\.(js|jsx|ts|tsx)$/i.test(f.filename) ||
      /main\.(js|jsx|ts|tsx)$/i.test(f.filename) ||
      /routes?\.(js|jsx|ts|tsx)$/i.test(f.filename)
  );

  let foundRouting = false;
  let foundRedux = false;
  let foundContext = false;

  for (const fileObj of targetFiles) {
    const sourceFile =
      tsProject.getSourceFile(fileObj.absolutePath) ||
      tsProject.addSourceFileAtPath(fileObj.absolutePath);

    const allTags = [
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ].map((node) => node.getTagNameNode().getText());

    if (
      deps['react-router-dom'] &&
      allTags.some((t) =>
        ['BrowserRouter', 'Router', 'RouterProvider', 'Routes'].includes(t)
      )
    ) {
      foundRouting = true;
    }

    if (
      (deps['react-redux'] || deps['@reduxjs/toolkit']) &&
      allTags.includes('Provider')
    ) {
      foundRedux = true;
    }

    if (allTags.some((tag) => tag.endsWith('.Provider'))) {
      foundContext = true;
    }

    const hasCreateContext = sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .some((call) => call.getExpression().getText() === 'createContext');

    if (hasCreateContext) foundContext = true;
  }

  if (foundRouting) tech.routing = 'react-router-dom';
  if (foundRedux) tech.stateManagement = 'Redux';
  else if (foundContext) tech.stateManagement = 'Context API';
  else if (deps['zustand']) tech.stateManagement = 'Zustand';

  return tech;
}

export function inferSourceRoot(projectPath, entryFilePath) {
  if (!entryFilePath) return '.';
  const relativeEntry = path.relative(projectPath, entryFilePath);
  const dir = path.dirname(relativeEntry);
  return dir === '.' ? '.' : dir;
}
function detectLanguage(projectPath, deps) {
  if (fs.existsSync(path.join(projectPath, 'tsconfig.json')))
    return 'TypeScript';
  if (deps['typescript']) return 'TypeScript';
  return 'JavaScript';
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

function getWritePhaseIgnores(tech) {
  let profile = null;
  if (tech.buildTool === 'vite' || tech.buildTool === 'Vite')
    profile = PROJECT_PROFILES?.vite;
  else if (tech.buildTool === 'cra' || tech.buildTool === 'CRA')
    profile = PROJECT_PROFILES?.cra;
  return profile?.writePhaseIgnores || [];
}

// ── Build ContextStore with ts-morph ─────────────────────────────────────────

/**
 * Scans files with ts-morph, extracts AST summaries, and stores them in ContextStore.
 * No embeddings, no vectors — pure deterministic Key-Value storage.
 *
 * @param {Array} filesQueue - Array of file objects
 * @param {string} projectPath
 * @param {import('ts-morph').Project} tsProject
 * @returns {{ contextStore: ContextStore, enrichedFiles: Array }}
 */
async function buildContextStore(filesQueue, projectPath, tsProject) {
  startSubSpinner(`Indexing ${filesQueue.length} files...`);
  const contextStore = new ContextStore();
  const enrichedFiles = [];

  for (const fileObj of filesQueue) {
    const filePath = (fileObj.filePath || fileObj.relativeToProject).replace(
      /\\/g,
      '/'
    );
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(projectPath, filePath);

    try {
      const { summary, hasJSX } = await extractFileSummary(
        tsProject,
        absolutePath,
        filePath
      );

      enrichedFiles.push({ ...fileObj, hasJSX });

      if (!summary) continue;

      contextStore.addDocuments([
        {
          pageContent: summary,
          metadata: {
            filePath,
            absolutePath,
            type: 'source_file',
            hasJSX,
          },
        },
      ]);
    } catch (err) {
      printWarning(`Analyzer skipped ${filePath}: ${err.message}`);
      enrichedFiles.push({ ...fileObj, hasJSX: false });
    }
  }

  stopSpinner();
  return { contextStore, enrichedFiles };
}

/**
 * Extracts a single file's summary using ts-morph:
 * Interfaces, Props, Hooks, Exported Functions
 *
 * @param {Project} tsProject - ts-morph Project instance
 * @param {string} absolutePath
 * @param {string} relativePath
 * @returns {Promise<{ summary: string|null, hasJSX: boolean }>} Summary text
 */
async function extractFileSummary(tsProject, absolutePath, relativePath) {
  const ext = path.extname(absolutePath);
  const validExts = ['.js', '.jsx', '.ts', '.tsx', '.mjs'];
  if (!validExts.includes(ext)) return { summary: null, hasJSX: false };

  let content;
  try {
    content = await fs.readFile(absolutePath, 'utf-8');
  } catch {
    return { summary: null, hasJSX: false };
  }

  // Add file to ts-morph (or update if exists)
  let sourceFile;
  try {
    sourceFile =
      tsProject.getSourceFile(absolutePath) ||
      tsProject.createSourceFile(absolutePath, content, { overwrite: true });
  } catch {
    return { summary: null, hasJSX: false };
  }

  // Detect JSX
  const hasJSX =
    sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement).length > 0 ||
    sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement).length >
      0;

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

    // 4. Hooks — full signatures (name, params, return type)
    const hooks = sourceFile
      .getFunctions()
      .filter((f) => f.getName()?.startsWith('use'));
    if (hooks.length > 0) {
      summaryParts.push('HOOKS:');
      hooks.forEach((h) => {
        const params = h
          .getParameters()
          .map((p) => `${p.getName()}: ${p.getType().getText()}`)
          .join(', ');
        const returnType = h.getReturnType().getText().slice(0, 120);
        summaryParts.push(`  ${h.getName()}(${params}): ${returnType}`);
      });
    }

    // 5. Local imports only (no external packages — they are irrelevant for RAG context).
    // All imports are included — no arbitrary limit.
    const localImports = sourceFile.getImportDeclarations().filter((imp) => {
      const spec = imp.getModuleSpecifierValue();
      return spec.startsWith('.') || spec.startsWith('/');
    });
    if (localImports.length > 0) {
      summaryParts.push('LOCAL_IMPORTS:');
      localImports.forEach((imp) => {
        summaryParts.push(`  from '${imp.getModuleSpecifierValue()}'`);
      });
    }
  } catch {
    // If ts-morph analysis fails, return basic summary
    summaryParts.push(`CONTENT_PREVIEW: ${content.slice(0, 200)}`);
  }

  return { summary: summaryParts.join('\n'), hasJSX };
}
