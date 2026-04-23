import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Execute a shell command silently.
 * Only logs to stderr if the command fails.
 *
 * @param {string} command - Command to run
 * @param {string} cwd - Working directory
 * @param {string} description - Description for the user (e.g., "Installing...")
 * @returns {Promise<void>}
 */
export async function runSilentCommand(command, cwd, description) {
  if (description) {
    console.log(description);
  }

  // 🔥 Magic solution: clean environment variables from parent npm traces
  const cleanEnv = { ...process.env };
  Object.keys(cleanEnv).forEach((key) => {
    if (key.toLowerCase().startsWith('npm_')) {
      delete cleanEnv[key];
    }
  });

  try {
    await execAsync(command, {
      cwd,
      encoding: 'utf-8',
      env: cleanEnv,
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer for large outputs
    });
  } catch (error) {
    // Only print error details if it fails
    console.error(`❌ Failed: ${command}`);
    if (error.stderr) {
      console.error(error.stderr.trim());
    } else if (error.message) {
      console.error(error.message.trim());
    }
    throw error;
  }
}
