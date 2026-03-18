// src/core/graph/nodes/executorNode.js
import fs from 'fs-extra';
import path from 'path';
import { buildPrompt } from '../../prompt/promptBuilder.js';
import { z } from 'zod';

// Define the expected output structure
const outputSchema = z.object({
  code: z.string().describe('The complete converted React Native code'),
  dependencies: z
    .array(z.string())
    .describe('List of new npm packages required'),
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
 * - state.generatedDependencies: Dependencies suggested by AI
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
    console.warn('⚠️  [ExecutorNode] No current file found');
    return { generatedCode: null, generatedDependencies: [] };
  }

  const filePath = currentFile.relativeToProject || currentFile.filePath;
  console.log(`\n⚙️  [ExecutorNode] Converting: ${filePath}`);

  // 1. 🔥 اقرأ الملف من القرص
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(state.facts?.projectPath || process.cwd(), filePath);

  try {
    currentFile.content = await fs.readFile(absolutePath, 'utf-8');
  } catch (err) {
    console.error(
      `❌ [ExecutorNode] Failed to read file content for ${absolutePath}:`,
      err
    );
  }

  // 2. 🔥 الفحص الأمني بعد القراءة
  if (!currentFile.content || currentFile.content.trim() === '') {
    console.warn(
      `⚠️  [ExecutorNode] File content is strictly empty for ${filePath}, skipping AI.`
    );
    return { generatedCode: '// Empty file', generatedDependencies: [] };
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
          console.log(
            `🔍 [ExecutorNode] RAG: Retrieved ${similarDocs.length} similar files`
          );
        }
      }
    } catch (err) {
      console.warn(`⚠️  [ExecutorNode] RAG Failed: ${err.message}`);
    }
  }

  // ── 2. Build file context for Prompt ──────────────────────────
  const fileContext = buildFileContext(
    currentFile,
    pathMap,
    facts,
    installedPackages,
    ragContext
  );

  // ── 3. Build Prompt ───────────────────────────────────────────
  const prompt = buildPrompt(fileContext);

  const model = models.smartModel;
  if (!model) {
    console.error('❌ [ExecutorNode] No smartModel found');
    return { generatedCode: null, generatedDependencies: [] };
  }

  // ── Smart Retry System ───────────────────────────────────────────
  const MAX_RETRIES = 3;
  let attempt = 0;
  let delayMs = 2000; // Start with 2 seconds delay

  while (attempt < MAX_RETRIES) {
    try {
      if (attempt > 0) {
        console.log(
          `🔄 [ExecutorNode] Retry attempt ${attempt}/${MAX_RETRIES} for ${filePath}...`
        );
      } else {
        console.log('🤖 [ExecutorNode] Sending to AI...');
      }

      const structuredModel = model.withStructuredOutput(outputSchema);
      const response = await structuredModel.invoke(prompt);

      const generatedCode = response.code;
      const generatedDependencies = response.dependencies || [];

      if (!generatedCode) {
        throw new Error('AI returned empty code block');
      }

      console.log(`✅ [ExecutorNode] Generated ${generatedCode.length} chars`);

      if (generatedDependencies.length > 0) {
        console.log(
          `📦 [ExecutorNode] Suggested dependencies: ${generatedDependencies.join(', ')}`
        );
      }

      // Note: We don't write to disk here - that's DiskWriterNode's job
      return {
        generatedCode,
        generatedDependencies,
        errors: [], // Reset errors before Verifier
      };
    } catch (err) {
      attempt++;
      console.warn(
        `⚠️  [ExecutorNode] AI Request Failed (Attempt ${attempt}): ${err.message}`
      );

      // If this was the last attempt, give up and exit
      if (attempt >= MAX_RETRIES) {
        console.error(
          `❌ [ExecutorNode] Failed to convert ${filePath} after ${MAX_RETRIES} attempts.`
        );
        return {
          generatedCode: null,
          generatedDependencies: [],
          errors: [
            `Failed to generate code from AI after ${MAX_RETRIES} attempts due to API errors.`,
          ],
        };
      }

      // Exponential Backoff: Double the wait time with each failed attempt (2s -> 4s -> 8s)
      console.log(
        `⏳ [ExecutorNode] Waiting ${delayMs / 1000} seconds before retrying...`
      );
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
  ragContext
) {
  const filePath = currentFile.relativeToProject || currentFile.filePath;
  const baseName = path.basename(filePath);

  // Determine if it's main App file
  let isMainEntry = false;
  if (/^App\.(tsx|jsx|js|ts)$/i.test(baseName)) {
    isMainEntry = true;
  } else if (
    facts.mainEntryPoint &&
    (filePath === facts.mainEntryPoint ||
      filePath.endsWith(path.basename(facts.mainEntryPoint)))
  ) {
    isMainEntry = true;
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
    installedPackages,

    // RAG Context (New)
    ragContext,

    // Resolved dependencies (from DependencyResolverNode)
    resolvedDeps: currentFile.resolvedDeps || {},

    // Main App file flag
    isMainEntry,

    // Destination path
    targetPath: pathMap[filePath] || filePath,
  };
}
