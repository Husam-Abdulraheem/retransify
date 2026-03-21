// src/core/graph/nodes/filePickerNode.js
import path from 'path';

/**
 * FilePickerNode - Pulls the next file from filesQueue for processing
 *
 * This is a helper node that runs at the beginning of each processing cycle:
 * - Pulls the first file from filesQueue
 * - Checks if the file should be skipped
 * - Resets healAttempts and errors for the new file
 *
 * Inputs: state.filesQueue, state.completedFiles, state.facts
 * Outputs: state.currentFile, state.filesQueue (updated), state.healAttempts: 0
 *
 * @param {import('../state.js').GraphState} state
 * @returns {Partial<import('../state.js').GraphState>}
 */
export async function filePickerNode(state) {
  const { filesQueue, completedFiles = [], facts = {} } = state;

  if (!filesQueue || filesQueue.length === 0) {
    console.log('\n✅ [FilePickerNode] All files processed');
    return { currentFile: null };
  }

  // Pull first file
  const [nextFile, ...remainingFiles] = filesQueue;
  const filePath = nextFile.relativeToProject || nextFile.filePath;

  // ── Check previously completed files (resumption) ───────────
  if (completedFiles.includes(filePath)) {
    console.log(
      `⏩ [FilePickerNode] Skipped (previously completed): ${filePath}`
    );
    return {
      filesQueue: remainingFiles,
      currentFile: null, // Will re-invoke for the next file
    };
  }

  // ── Check Web Mount files to delete ─────────────────────────
  const baseName = path.basename(filePath);
  if (
    /^(main|index)\.(tsx|jsx|js|ts)$/i.test(baseName) &&
    filePath.includes('src')
  ) {
    console.log(`🚫 [FilePickerNode] Deleting Web Mount File: ${filePath}`);
    return {
      filesQueue: remainingFiles,
      currentFile: null,
    };
  }

  // ── Check ignore list (writePhaseIgnores) ───────────────────
  const writePhaseIgnores = facts.writePhaseIgnores || [];
  if (writePhaseIgnores.some((regex) => regex.test(filePath))) {
    console.log(`🚫 [FilePickerNode] Blocked by Profile rule: ${filePath}`);
    return {
      filesQueue: remainingFiles,
      currentFile: null,
    };
  }

  console.log(`\n📂 [FilePickerNode] Next file: ${filePath}`);
  console.log(`   (${remainingFiles.length} files remaining)`);

  // Read file content if not present
  let fileWithContent = nextFile;
  if (!nextFile.content && nextFile.filePath) {
    try {
      const { readFile } = await import('fs/promises');
      const absolutePath = nextFile.filePath;
      const content = await readFile(absolutePath, 'utf-8');
      fileWithContent = { ...nextFile, content };
    } catch {
      console.warn(`⚠️  [FilePickerNode] Failed to read: ${filePath}`);
    }
  }

  return {
    currentFile: fileWithContent,
    filesQueue: remainingFiles,
    healAttempts: 0, // Reset heal attempts for each new file
    errors: [], // Reset errors
    generatedCode: null, // Reset previous code
    generatedDependencies: [], // Reset previous dependencies
    lastErrorHash: null, // Reset error hash
    installAttempts: 0, // Reset auto-installer circuit breaker
    missingDependencies: [], // Reset missing dependencies array
  };
}
