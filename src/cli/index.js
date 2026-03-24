import path from 'path';
import pc from 'picocolors';
import { handleConvert } from '../core/commands/convertCommand.js';
import { Doctor } from '../core/utils/doctor.js';
import {
  printBanner,
  printSuccess,
  printWarning,
  printStep,
} from '../core/utils/ui.js';

export async function runCLI() {
  printBanner();

  const args = process.argv.slice(2);

  if (args.length === 0) {
    return printHelp();
  }

  const command = args[0];

  if (command === 'convert') {
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

  if (command === 'doctor') {
    const projectPath = args[1] ? path.resolve(args[1]) : process.cwd();
    printStep(`Doctor — checking: ${projectPath}`);

    const isHealthy = await Doctor.checkHealth(projectPath);
    if (!isHealthy) {
      printWarning('Project is unhealthy. Attempting treatment...');
      await Doctor.fixDependencies(projectPath);
    } else {
      printSuccess('Project is in great shape!');
    }
    return;
  }

  printHelp();
}

function printHelp() {
  console.log('');
  console.log(`  ${pc.bold('Usage:')}`);
  console.log(
    `    ${pc.cyan('retransify convert')} ${pc.dim('<path-to-react-project>')} ${pc.dim('[--sdk <version>]')}`
  );
  console.log(
    `    ${pc.cyan('retransify doctor')}  ${pc.dim('<path-to-expo-project>')}`
  );
  console.log('');
  console.log(`  ${pc.bold('Examples:')}`);
  console.log(`    ${pc.dim('retransify convert ./my-react-app --sdk 52')}`);
  console.log(`    ${pc.dim('retransify doctor ./my-expo-app')}`);
  console.log('');
}
