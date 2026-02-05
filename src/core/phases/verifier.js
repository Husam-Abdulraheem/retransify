import { exec } from 'child_process';
import path from 'path';

export class Verifier {
  /**
   * Run TypeScript compiler to check for errors in a specific file.
   * @param {string} projectPath - Root of the RN project
   * @param {string} filePath - Relative path of the file to check (e.g. src/components/Button.tsx)
   * @returns {Promise<string[]>} - List of actionable error messages. Empty if valid.
   */
  async verify(projectPath, filePath) {
    console.log(`\n🔍 Verifying: ${filePath}...`);

    return new Promise((resolve) => {
      // Run tsc --noEmit. 
      // We run on the whole project because TS needs context, but we filter output for our specific file.
      exec('npx tsc --noEmit', { cwd: projectPath }, (error, stdout, stderr) => {
        // tsc returns exit code 1 if errors found, so 'error' will be present.
        // We rely on stdout for the actual error messages.
        
        const output = stdout + stderr;
        const unexpectedErrors = this._parseErrors(output, filePath);

        if (unexpectedErrors.length > 0) {
            console.log(`⚠️  Found ${unexpectedErrors.length} issues in ${filePath}`);
        } else {
            console.log('✅ verification passed.');
        }

        resolve(unexpectedErrors);
      });
    });
  }

  /**
   * Parse tsc output and filter for relevant errors in the target file.
   * @param {string} output - Full tsc stdout
   * @param {string} targetFile - File we care about
   * @returns {string[]} - Filtered error lines
   */
  _parseErrors(output, targetFile) {
    const lines = output.split('\n');
    const errors = [];

    // Normalized target path for comparison (e.g., src/components/Button.tsx)
    // tsc output usually looks like: src/components/Button.tsx(10,5): error TS2304: Cannot find name 'View'.
    const normalizedTarget = targetFile.replace(/\\/g, '/');

    for (const line of lines) {
      // 1. Check if line refers to our file
      if (!line.replace(/\\/g, '/').includes(normalizedTarget)) {
        continue;
      }

      // 2. Filter out "Cannot find module" (TS2307)
      if (line.includes('TS2307') || line.includes('Cannot find module')) {
        // SMART CHECK:
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
