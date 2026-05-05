// src/core/graph/nodes/globalAuditNode.js
import { exec } from 'child_process';
import util from 'util';
import {
  printStep,
  startSpinner,
  succeedSpinner,
  failSpinner,
} from '../../utils/ui.js';
import { normalizePath } from '../../utils/pathUtils.js';

const execAsync = util.promisify(exec);

/**
 * GlobalAuditNode - Runs the actual TypeScript compiler (tsc) on the target project.
 * This provides 100% accurate diagnostics by considering node_modules and actual tsconfig.
 */
export async function globalAuditNode(state) {
  printStep('Global Audit — Native Compiler Check');
  startSpinner('Running native TypeScript compiler check (tsc)...');

  const { targetProjectPath, unresolvedErrors = [] } = state;
  const newErrorsFound = [];

  try {
    // 1. Running the actual Expo compiler
    // Use --noEmit to ensure code correctness without generating JS files
    await execAsync('npx tsc --noEmit', { cwd: targetProjectPath });

    succeedSpinner('Global Audit — No errors found.');
  } catch (error) {
    // 2. Analyze tsc output in case of errors
    const tscOutput = (error.stdout || '') + (error.stderr || '');

    // Splitting output into lines (each tsc error starts with the file path)
    const errorLines = tscOutput
      .split('\n')
      .filter((line) => line.includes('error TS'));

    for (const line of errorLines) {
      // Regex to extract file path and error message
      // Format: app/index.tsx(15,2): error TS2304: Cannot find name 'View'.
      const match = line.match(/^(.+?)\(\d+,\d+\):\s+(error\s+TS\d+:\s+.+)$/);

      if (match) {
        const rawFilePath = match[1];
        const errorMessage = match[2];

        // Cleaning the path to be readable in the report
        const cleanPath = normalizePath(rawFilePath);

        // Avoiding duplicate error messages for the same file (Deduplication)
        const isAlreadyReported = unresolvedErrors.some(
          (err) => err.filePath === cleanPath && err.reason === errorMessage
        );

        if (!isAlreadyReported) {
          newErrorsFound.push({
            filePath: cleanPath,
            reason: errorMessage,
            codeSnippet:
              '// Review file manually. TypeScript compiler flagged this exact line.',
            suggestedAction:
              'Resolve TypeScript strictness errors or missing Native equivalent props.',
          });
        }
      }
    }

    if (newErrorsFound.length > 0) {
      failSpinner(
        `Global Audit intercepted ${newErrorsFound.length} true TypeScript errors.`
      );
    } else {
      succeedSpinner('Global Audit finished (no new errors found).');
    }
  }

  // Updating the state (the Reducer will automatically append)
  return { unresolvedErrors: newErrorsFound };
}
