import { execSync } from "child_process";

/**
 * Execute a shell command silently.
 * Only logs to stderr if the command fails.
 * 
 * @param {string} command - Command to run
 * @param {string} cwd - Working directory
 * @param {string} description - Description for the user (e.g., "Installing...") 
 * @returns {void}
 */
export function runSilentCommand(command, cwd, description) {
  if (description) {
    console.log(description);
  }

  try {
    execSync(command, {
      cwd,
      stdio: 'pipe', // Completely silent
      encoding: 'utf-8'
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
