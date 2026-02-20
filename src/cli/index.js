import path from "path";
import { fileURLToPath } from "url";
import { handleConvert } from "../core/commands/convertCommand.js";
import { Doctor } from "../core/utils/doctor.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runCLI() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    return printHelp();
  }

  const command = args[0];

  if (command === "convert") {
    const projectPathIndex = 1; 
    let projectPath = args[projectPathIndex];
    
    if (!projectPath || projectPath.startsWith('--')) {
        projectPath = process.cwd();
    } else {
        projectPath = path.resolve(projectPath);
    }

    // Parse --sdk flag
    let sdkVersion = null;
    const sdkIndex = args.indexOf('--sdk');
    if (sdkIndex !== -1 && args[sdkIndex + 1]) {
        sdkVersion = args[sdkIndex + 1];
    }

    await handleConvert(projectPath, sdkVersion);
    return;
  }

  if (command === "doctor") {
    const projectPath = args[1] ? path.resolve(args[1]) : process.cwd();
    console.log(`👨‍⚕️ Calling the Doctor for: ${projectPath}`);
    
    // Check health
    const isHealthy = await Doctor.checkHealth(projectPath);
    if (!isHealthy) {
        console.log("🤒 Project is sick. Attempting treatment...");
        await Doctor.fixDependencies(projectPath);
    } else {
        console.log("💪 Project is in great shape!");
    }
    return;
  }

  printHelp();
}

function printHelp() {
  console.log(`
Retransify (Local CLI)

Usage:
  node cli.js convert <path-to-react-project> [--sdk <version>]

Example:
  node cli.js convert ./my-react-app --sdk 50

  node cli.js doctor <path-to-expo-project>
`);
}
