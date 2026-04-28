import path from 'path';
import fs from 'fs-extra';
import { SyntaxKind, Node } from 'ts-morph';
import { AstManager } from '../../services/AstManager.js';
import { FrameworkDetector } from '../../detectors/FrameworkDetector.js';
import { setupNativeWind } from '../../services/StyleConfigurator.js';
import { ContextStore } from '../helpers/ContextStore.js';
import { ContractRegistry } from '../helpers/ContractRegistry.js';
import { PROJECT_PROFILES } from '../../config/profiles.js';
import {
  printStep,
  printSubStep,
  printWarning,
  startSubSpinner,
  stopSpinner,
} from '../../utils/ui.js';
import { resolveAbsolutePath, normalizePath } from '../../utils/pathUtils.js';

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
  const tsProject = AstManager.getWebProject();

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
    // Ensure the correct target project path is used
    await setupNativeWind(state.targetProjectPath);

    if (state.dependencyManager) {
      state.dependencyManager.add(['nativewind', 'tailwindcss']);
      await state.dependencyManager.installAll(state.targetProjectPath);
    }
  }

  // ── 4. Scan files with ts-morph and extract summaries ─────────
  const { contextStore, contractRegistry, enrichedFiles } =
    await buildContextStore(filesQueue, projectPath, tsProject);

  printSubStep(`Indexed ${contextStore.size} files in ContextStore`);
  printSubStep(`Registered contracts for ${contractRegistry.size} files`);

  return {
    facts,
    vectorStore: contextStore,
    contractRegistry,
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
  const tailwindConfigs = [
    'tailwind.config.js',
    'tailwind.config.ts',
    'tailwind.config.cjs',
    'tailwind.config.mjs',
  ];

  const hasTailwindConfig = tailwindConfigs.some((config) =>
    fs.existsSync(path.join(projectPath, config))
  );

  const hasTailwindDep = !!(deps['tailwindcss'] || deps['nativewind']);

  if (hasTailwindConfig || hasTailwindDep) {
    return deps['nativewind'] ? 'NativeWind' : 'Tailwind';
  }

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
 * Scans files with ts-morph, extracts AST summaries (ContextStore) and
 * structured function contracts (ContractRegistry).
 *
 * Both stores are populated in a single pass over the file queue to keep
 * analysis O(n) — no separate scan is needed for contracts.
 *
 * @param {Array} filesQueue - Array of file objects
 * @param {string} projectPath
 * @param {import('ts-morph').Project} tsProject
 * @returns {{ contextStore: ContextStore, contractRegistry: ContractRegistry, enrichedFiles: Array }}
 */
async function buildContextStore(filesQueue, projectPath, tsProject) {
  startSubSpinner(`Indexing ${filesQueue.length} files...`);
  const contextStore = new ContextStore();
  const contractRegistry = new ContractRegistry();
  const enrichedFiles = [];

  for (const fileObj of filesQueue) {
    const filePath = normalizePath(
      fileObj.filePath || fileObj.relativeToProject
    );
    const absolutePath = resolveAbsolutePath(fileObj, projectPath);

    try {
      const { summary, hasJSX, role, sourceFile } = await extractFileSummary(
        tsProject,
        absolutePath,
        filePath
      );

      enrichedFiles.push({ ...fileObj, hasJSX, role: role || 'component' });

      if (!summary) continue;

      // ── ContextStore (text summaries for LLM RAG context) ──────────
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

      // ── ContractRegistry (structured signatures for validation) ────
      // Only populate when we have a live sourceFile reference. If
      // extractFileSummary hit the catch-fallback, sourceFile is null.
      if (sourceFile) {
        try {
          const contracts = extractFileContracts(sourceFile);
          if (contracts.length > 0) {
            contractRegistry.registerFile(filePath, contracts);
          }
        } catch (contractErr) {
          // Non-fatal: contract extraction failure must never block the
          // main analysis pipeline.
          printWarning(
            `ContractRegistry: skipped ${filePath} — ${contractErr.message}`
          );
        }
      }
    } catch (err) {
      printWarning(`Analyzer skipped ${filePath}: ${err.message}`);
      enrichedFiles.push({ ...fileObj, hasJSX: false });
    }
  }

  stopSpinner();
  return { contextStore, contractRegistry, enrichedFiles };
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
  if (!validExts.includes(ext))
    return { summary: null, hasJSX: false, role: 'util' };

  let content;
  try {
    content = await fs.readFile(absolutePath, 'utf-8');
  } catch {
    return { summary: null, hasJSX: false, role: 'util' };
  }

  // Add file to ts-morph (or update if exists)
  let sourceFile;
  try {
    sourceFile =
      tsProject.getSourceFile(absolutePath) ||
      tsProject.createSourceFile(absolutePath, content, { overwrite: true });
  } catch {
    return { summary: null, hasJSX: false, role: 'util' };
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

    // 4. Hooks — full signatures (name, params, return type).
    // Covers both `function useX()` declarations AND `const useX = () =>`
    // arrow exports. Destructured params are rendered as `{ key1, key2 }`
    // instead of the lossy `param0: any` produced by the old approach.
    const fnHooks = sourceFile
      .getFunctions()
      .filter((f) => f.getName()?.startsWith('use'));

    const arrowHooks = sourceFile.getVariableDeclarations().filter((v) => {
      const init = v.getInitializer();
      return (
        init &&
        (init.getKind() === SyntaxKind.ArrowFunction ||
          init.getKind() === SyntaxKind.FunctionExpression) &&
        v.getName()?.startsWith('use')
      );
    });

    const allHooks = [
      ...fnHooks.map((h) => ({
        name: h.getName(),
        parameters: h.getParameters(),
        returnTypeText: h.getReturnType().getText(),
      })),
      ...arrowHooks.map((v) => {
        const init = v.getInitializer();
        return {
          name: v.getName(),
          parameters: init.getParameters ? init.getParameters() : [],
          returnTypeText: init.getReturnType
            ? init.getReturnType().getText()
            : 'unknown',
        };
      }),
    ];

    if (allHooks.length > 0) {
      summaryParts.push('HOOKS:');
      allHooks.forEach(({ name, parameters, returnTypeText }) => {
        const params = parameters
          .map((p) => {
            const nameNode = p.getNameNode();
            // Render destructured patterns as `{ key1, key2 }` so the LLM
            // immediately sees the expected shape, not a synthetic `__0`.
            if (
              nameNode &&
              nameNode.getKind() === SyntaxKind.ObjectBindingPattern
            ) {
              const keys = nameNode
                .getElements()
                .map((el) => el.getName())
                .join(', ');
              return `{ ${keys} }: ${p.getType().getText()}`;
            }
            return `${p.getName()}: ${p.getType().getText()}`;
          })
          .join(', ');
        const returnType = returnTypeText.slice(0, 200);
        summaryParts.push(`  ${name}(${params}): ${returnType}`);
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

  // 6. Semantic Role determination
  let role = 'component';
  const text = sourceFile.getFullText();

  const isContext = text.includes('createContext');
  const isProvider =
    /export\s+(const|function)\s+[a-zA-Z0-9_]*Provider/.test(text) ||
    (isContext && text.includes('Provider'));
  const isHook = path.basename(relativePath).startsWith('use');
  const isUtil =
    !hasJSX &&
    !isContext &&
    !isHook &&
    !isProvider &&
    !relativePath.includes('app/');

  if (isContext) role = 'context';
  else if (isProvider) role = 'provider';
  else if (isHook) role = 'hook';
  else if (isUtil) role = 'util';

  // Return the live sourceFile reference so buildContextStore can pass it
  // directly to extractFileContracts without re-parsing.
  return { summary: summaryParts.join('\n'), hasJSX, role, sourceFile };
}

// ── Contract Extraction Helpers ──────────────────────────────────────────────

/**
 * Extracts structured FunctionContract objects for every exported function,
 * arrow function, and hook found in a source file.
 *
 * Covers four patterns:
 *   1. `export function foo(params) {}`
 *   2. `export default function foo(params) {}`
 *   3. `export const foo = (params) => {}`  (ArrowFunction)
 *   4. `export const foo = function(params) {}`  (FunctionExpression)
 *
 * @param {import('ts-morph').SourceFile} sourceFile
 * @returns {import('../helpers/ContractRegistry.js').FunctionContract[]}
 */
function extractFileContracts(sourceFile) {
  const contracts = [];

  // ── 1. Named function declarations ──────────────────────────────────────
  for (const fn of sourceFile.getFunctions()) {
    const name = fn.getName();
    // Include exported functions and all hooks (hooks are always relevant
    // even when not explicitly exported in JS files).
    if (!fn.isExported() && !name?.startsWith('use')) continue;
    if (!name) continue;

    contracts.push({
      name,
      kind: 'function',
      parameters: fn.getParameters().map(buildParameterContract),
      returnType: fn.getReturnType().getText(),
      isDefault: false,
    });
  }

  // ── 2. Default export function ───────────────────────────────────────────
  for (const fn of sourceFile.getFunctions()) {
    if (fn.isDefaultExport()) {
      contracts.push({
        name: 'default',
        kind: 'function',
        parameters: fn.getParameters().map(buildParameterContract),
        returnType: fn.getReturnType().getText(),
        isDefault: true,
      });
    }
  }

  // ── 3. Exported variable declarations (arrow / function expressions) ─────
  for (const varDecl of sourceFile.getVariableDeclarations()) {
    const init = varDecl.getInitializer();
    if (!init) continue;

    const kind = init.getKind();
    const isArrow = kind === SyntaxKind.ArrowFunction;
    const isFnExpr = kind === SyntaxKind.FunctionExpression;
    if (!isArrow && !isFnExpr) continue;

    const name = varDecl.getName();
    if (!name) continue;

    // Include if exported OR if it's a hook (starts with 'use').
    const isExported = varDecl.isExported?.();
    const isHook = name.startsWith('use');
    if (!isExported && !isHook) continue;

    // ts-morph arrow/function expressions expose getParameters() directly.
    const params = init.getParameters ? init.getParameters() : [];
    const returnType = init.getReturnType
      ? init.getReturnType().getText()
      : 'unknown';

    contracts.push({
      name,
      kind: 'arrow',
      parameters: params.map(buildParameterContract),
      returnType,
      isDefault: false,
    });
  }

  return contracts;
}

/**
 * Converts a single ts-morph ParameterDeclaration into a ParameterContract.
 *
 * The key improvement over the old lossy approach is in how destructured
 * parameters are handled: instead of returning `param0: any`, we inspect the
 * ObjectBindingPattern to collect the actual property names the function
 * expects, giving the LLM (and the future Verifier) the exact required shape.
 *
 * @param {import('ts-morph').ParameterDeclaration} param
 * @returns {import('../helpers/ContractRegistry.js').ParameterContract}
 */
function buildParameterContract(param) {
  const nameNode = param.getNameNode();
  const isDestructured =
    Node.isObjectBindingPattern(nameNode) ||
    (nameNode && nameNode.getKind() === SyntaxKind.ObjectBindingPattern);

  let destructuredKeys = [];
  let displayName = param.getName();

  if (isDestructured && Node.isObjectBindingPattern(nameNode)) {
    // Extract each binding element's key name, ignoring rest elements.
    destructuredKeys = nameNode
      .getElements()
      .filter((el) => !Node.isBindingElement(el) || !el.getDotDotDotToken())
      .map((el) => {
        // getPropertyNameNode() is the key when there's renaming (e.g. { foo: bar })
        // getName() returns the local variable name (e.g. bar).
        // We want the *key* (what the callee defines), so prefer getPropertyNameNode.
        const propName = el.getPropertyNameNode();
        return propName ? propName.getText() : el.getName();
      })
      .filter(Boolean);

    displayName = `{ ${destructuredKeys.join(', ')} }`;
  }

  return {
    name: displayName,
    type: param.getType().getText(),
    isDestructured,
    destructuredKeys,
    isOptional: param.isOptional(),
    defaultValue: param.getInitializer()?.getText() ?? null,
  };
}
