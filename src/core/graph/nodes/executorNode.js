// src/core/graph/nodes/executorNode.js
import fs from 'fs-extra';
import path from 'path';
import { buildPrompt } from '../../prompt/promptBuilder.js';
import { PathMapper } from '../../helpers/pathMapper.js';
import { z } from 'zod';
import {
  printSubStep,
  printWarning,
  printError,
  startSubSpinner,
  stopSpinner,
} from '../../utils/ui.js';

// Define the expected output structure
const outputSchema = z.object({
  code: z.string().describe('The complete converted React Native code'),
});

// Helper function for sleep
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * ExecutorNode - Converts the current file using smartModel + RAG
 *
 * Inputs from state:
 * - state.currentFile: Current file object (with resolvedDeps from DependencyResolverNode)
 * - state.vectorStore: MemoryVectorStore instance
 * - state.pathMap: Path map
 * - state.facts: Project information
 * - state.installedPackages
 *
 * Outputs to state:
 * - state.generatedCode: Converted code (not written to disk here)
 *
 * @param {import('../state.js').GraphState} state
 * @param {{ smartModel: Session }} models
 * @returns {Partial<import('../state.js').GraphState>}
 */
export async function executorNode(state, models = {}) {
  const {
    currentFile,
    vectorStore,
    pathMap,
    facts,
    installedPackages = [],
  } = state;

  if (!currentFile) {
    printWarning('ExecutorNode: no current file');
    return { generatedCode: null };
  }

  const filePath = currentFile.relativeToProject || currentFile.filePath;
  printSubStep('Converting file via AI...');

  // 1. 🔥 Read the file from disk
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(state.facts?.projectPath || process.cwd(), filePath);

  try {
    currentFile.content = await fs.readFile(absolutePath, 'utf-8');
  } catch (err) {
    printError(`Failed to read ${absolutePath}: ${err.message}`);
  }

  // 2. 🔥 Security check after reading
  if (!currentFile.content || currentFile.content.trim() === '') {
    printWarning(`Empty file, skipping AI: ${filePath}`);
    return { generatedCode: '// Empty file' };
  }

  // ── 1. Retrieve similar context from VectorStore (RAG) ────────
  let ragContext = '';
  if (vectorStore && currentFile.content) {
    try {
      // Retrieve top 3 similar files to help AI understand project pattern
      const similarDocs = await vectorStore.similaritySearch(
        currentFile.content.slice(0, 500), // First 500 chars for search
        3
      );

      if (similarDocs.length > 0) {
        ragContext = similarDocs
          .filter((doc) => doc.metadata.filePath !== filePath) // Exclude the file itself
          .map((doc) => `--- ${doc.metadata.filePath} ---\n${doc.pageContent}`)
          .join('\n\n');

        if (ragContext) {
          printSubStep(`RAG: ${similarDocs.length} context files retrieved`);
        }
      }
    } catch (err) {
      printWarning(`RAG failed: ${err.message}`);
    }
  }

  // ── 2. Build file context for Prompt ──────────────────────────
  const exactImportsMap = PathMapper.calculateExactImports(
    filePath,
    currentFile.content,
    pathMap
  );
  const fileContext = buildFileContext(
    currentFile,
    pathMap,
    facts,
    installedPackages,
    ragContext,
    exactImportsMap
  );

  // ── 3. Build Prompt ───────────────────────────────────────────
  const prompt = buildPrompt(fileContext);

  const model = models.smartModel;
  if (!model) {
    printError('No smartModel found in ExecutorNode');
    return { generatedCode: null };
  }

  // ── Smart Retry System ───────────────────────────────────────────
  const MAX_RETRIES = 3;
  let attempt = 0;
  let delayMs = 2000; // Start with 2 seconds delay

  while (attempt < MAX_RETRIES) {
    try {
      if (attempt > 0) {
        startSubSpinner(`Retry ${attempt}/${MAX_RETRIES} for ${filePath}...`);
      } else {
        startSubSpinner('AI: Generating native code...');
      }

      const structuredModel = model.withStructuredOutput(outputSchema);
      const response = await structuredModel.invoke(prompt);
      stopSpinner();

      const generatedCode = response.code;

      if (!generatedCode) {
        throw new Error('AI returned empty code block');
      }

      printSubStep(`AI Generated: ${generatedCode.length} chars ✔`);

      // Note: We don't write to disk here - that's DiskWriterNode's job
      return {
        generatedCode,
        errors: [], // Reset errors before Verifier
      };
    } catch (err) {
      attempt++;
      printWarning(`AI attempt ${attempt} failed: ${err.message}`);

      // If this was the last attempt, give up and exit
      if (attempt >= MAX_RETRIES) {
        printError(`Failed after ${MAX_RETRIES} attempts: ${filePath}`);
        return {
          generatedCode: null,
          errors: [
            `Failed to generate code from AI after ${MAX_RETRIES} attempts due to API errors.`,
          ],
        };
      }

      // Exponential Backoff: Double the wait time with each failed attempt (2s -> 4s -> 8s)
      printSubStep(`Waiting ${delayMs / 1000}s before retry...`);
      await sleep(delayMs);
      delayMs *= 2;
    }
  }
}

// ── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Builds full file context object for buildPrompt()
 * Maintains same fileContext structure as previously built by contextBuilder.js
 */
function buildFileContext(
  currentFile,
  pathMap,
  facts,
  installedPackages,
  ragContext,
  exactImportsMap
) {
  const filePath = currentFile.relativeToProject || currentFile.filePath;
  const baseName = path.basename(filePath);

  // Determine if it's main App file
  let isMainEntry = false;
  if (/^App\.(tsx|jsx|js|ts)$/i.test(baseName)) {
    isMainEntry = true;
  } else if (facts.mainEntryPoint) {
    const mainBaseName = path.basename(facts.mainEntryPoint);
    const mainRelative = facts.projectPath
      ? path
          .relative(facts.projectPath, facts.mainEntryPoint)
          .replace(/\\/g, '/')
      : null;

    if (filePath === mainRelative || baseName === mainBaseName) {
      isMainEntry = true;
    }
  }

  return {
    // Basic file information
    filePath,
    content: currentFile.content || '',
    imports: currentFile.imports || [],
    exports: currentFile.exports || [],
    components: currentFile.components || [],
    hooks: currentFile.hooks || [],
    hasJSX: currentFile.hasJSX || false,

    // Project information
    globalContext: {
      facts: facts,
      decisions: { pathMap },
    },
    pathMap,
    exactImportsMap,
    installedPackages,

    // RAG Context (New)
    ragContext,

    // Resolved dependencies (from DependencyResolverNode)
    resolvedDeps: currentFile.resolvedDeps || {},

    // Main App file flag
    isMainEntry,

    // Destination path
    targetPath: pathMap[filePath] || filePath,

    // Determine if it is a Layout file conceptually
    isLayoutFile:
      (pathMap[filePath] && pathMap[filePath].endsWith('_layout.tsx')) || false,
  };
}
