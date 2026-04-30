import fs from 'fs-extra';
import path from 'path';
import pc from 'picocolors';
import { printSubStepLast } from '../../utils/ui.js';

/**
 * cacheLoaderNode - Loads previously generated code from disk
 * bypassing the AI execution phase.
 */
export async function cacheLoaderNode(state) {
  const { currentFile, targetProjectPath, pathMap } = state;

  if (!currentFile || !targetProjectPath) {
    return {
      errors: ['CacheLoaderNode: Missing currentFile or targetProjectPath'],
    };
  }

  const sourcePath = currentFile.relativeToProject || currentFile.filePath;
  const destPath = pathMap[sourcePath] || sourcePath;
  const absoluteDestPath = path.join(targetProjectPath, destPath);

  try {
    if (await fs.pathExists(absoluteDestPath)) {
      const existingCode = await fs.readFile(absoluteDestPath, 'utf-8');

      printSubStepLast(
        `${pc.green('✔')} ${pc.dim('[CACHE]')} Loaded ${pc.white(pc.bold(destPath))}`
      );

      return {
        generatedCode: existingCode,
        healAttempts: 0,
        errors: [],
        // We mark it as completed to ensure it flows correctly in the graph
        completedFiles: sourcePath,
      };
    } else {
      return {
        errors: [`CacheLoaderNode: File not found on disk at ${destPath}`],
      };
    }
  } catch (err) {
    return { errors: [`CacheLoaderNode failed: ${err.message}`] };
  }
}
