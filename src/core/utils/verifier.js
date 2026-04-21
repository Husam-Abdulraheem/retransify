import { exec } from 'child_process';
import { normalizePath } from './pathUtils.js';

export class Verifier {
  /**
   * Run TypeScript compiler to check for errors in a specific file.
   * @param {string} projectPath - Root of the RN project
   * @param {string} filePath - Relative path of the file to check (e.g. src/components/Button.tsx)
   * @returns {Promise<string[]>} - List of actionable error messages. Empty if valid.
   */
  /**
   * Run TypeScript compiler to check for errors in a specific file.
   * @param {GlobalMigrationContext} context - The shared cognitive memory
   * @param {string} projectPath - Root of the RN project
   * @param {string} filePath - Relative path of the file to check (e.g. src/components/Button.tsx)
   * @param {boolean} _checkModules - If true, treat "Cannot find module" as a real error (Post-Install)
   * @returns {Promise<string[]>} - List of actionable error messages. Empty if valid.
   */
  // eslint-disable-next-line no-unused-vars
  async verify(context, projectPath, filePath, checkModules = false) {
    // [OPTIMIZATION] Individual file verification is disabled in favor of batch verification.
    // We return empty errors to allow the process to continue.
    return [];
  }

  /**
   * Run TypeScript compiler on the entire project ONCE.
   * @param {string} projectPath
   * @returns {Promise<string[]>} List of all errors found
   */
  async verifyProject(projectPath) {
    console.log('\n🔍 Verifying entire project (Batch Mode)...');
    return new Promise((resolve) => {
      exec(
        'npx tsc --noEmit',
        { cwd: projectPath },
        (error, stdout, stderr) => {
          const output = stdout + stderr;
          const errors = output
            .split('\n')
            .filter((line) => line.includes('error TS'))
            .map((line) => line.trim());

          if (errors.length > 0) {
            console.log(
              `⚠️  Found ${errors.length} TypeScript issues in the project.`
            );
          } else {
            console.log('✅ Project verification passed (No TS errors).');
          }
          resolve(errors);
        }
      );
    });
  }

  /**
   * Parse tsc output and filter for relevant errors in the target file.
   * @param {string} output - Full tsc stdout
   * @param {string} targetFile - File we care about
   * @param {boolean} checkModules
   * @returns {string[]} - Filtered error lines
   */
  _parseErrors(output, targetFile, checkModules) {
    const lines = output.split('\n');
    const errors = [];

    // Normalized target path for comparison (e.g., src/components/Button.tsx)
    // tsc output usually looks like: src/components/Button.tsx(10,5): error TS2304: Cannot find name 'View'.
    const normalizedTarget = normalizePath(targetFile);

    for (const line of lines) {
      // 1. Check if line refers to our file
      if (!normalizePath(line).includes(normalizedTarget)) {
        continue;
      }

      // 2. Filter out "Cannot find module" (TS2307)
      if (line.includes('TS2307') || line.includes('Cannot find module')) {
        // [STRICT CHECK] If we are checking modules (Post-Install), we KEEP this error.
        if (checkModules) {
          errors.push(line.trim());
          continue;
        }

        // SMART CHECK (Pre-Install):
        // If the missing module starts with '.' (e.g., './xx', '../xx'), it's a relative path error.
        // We MUST report this so the Healer can fix the path.
        const match = line.match(/'([^']+)'/);
        if (match && match[1] && match[1].startsWith('.')) {
          // It is a relative path -> KEEP IT (Do not continue)
        } else {
          // It is likely a package (e.g. 'react-native-maps') -> IGNORE IT (Assume it will be installed)
          continue;
        }
      }

      // 3. Keep other errors (Syntax, Type Mismatch, etc.)
      errors.push(line.trim());
    }

    return errors;
  }
}
