import path from 'path';
import pc from 'picocolors';
import readline from 'readline';
import { handleConvert } from '../core/commands/convertCommand.js';
import { runDoctor } from '../core/utils/doctor.js';
import { printBanner } from '../core/utils/ui.js';
import { getActiveModelName } from '../core/ai/aiFactory.js';

export async function runCLI() {
  printBanner(getActiveModelName());

  // 1. Validate API Key
  if (!validateApiKey()) {
    return;
  }

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

    // 2. Extract default name
    const defaultName = `${path.basename(projectPath)}-mobile`;

    // 3. Prompt user for project name
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const projectName = await new Promise((resolve) => {
      rl.question(
        `\n${pc.cyan('?')} Project name ${pc.dim(`(${defaultName})`)}: `,
        (answer) => {
          rl.close();
          resolve(answer.trim() || defaultName);
        }
      );
    });

    // 4. Form final absolute path
    const targetProjectPath = path.resolve(process.cwd(), projectName);

    await handleConvert(projectPath, targetProjectPath);
    return;
  }

  if (command === 'doctor') {
    const projectPath = args[1] ? path.resolve(args[1]) : process.cwd();
    await runDoctor(projectPath);
    return;
  }

  printHelp();
}

function printHelp() {
  console.log('');
  console.log(`  ${pc.bold('Usage:')}`);
  console.log(
    `    ${pc.cyan('retransify convert')} ${pc.dim('<path-to-react-project>')}`
  );
  console.log(
    `    ${pc.cyan('retransify doctor')}  ${pc.dim('<path-to-expo-project>')}`
  );
  console.log('');
  console.log(`  ${pc.bold('Examples:')}`);
  console.log(`    ${pc.dim('retransify convert ./my-react-app')}`);
  console.log(`    ${pc.dim('retransify doctor ./my-expo-app')}`);
  console.log('');
}

function validateApiKey() {
  const geminiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const provider = process.env.AI_PROVIDER || 'gemini';

  if (provider === 'gemini' && !geminiKey) {
    console.log('');
    console.log(pc.red(pc.bold('  Error: Gemini API Key not found.')));
    console.log('');
    console.log(`  To use Retransify, please set your Google API Key:`);
    console.log(
      `  ${pc.cyan('1.')} Get a free key at: ${pc.underline('https://aistudio.google.com/')}`
    );
    console.log(`  ${pc.cyan('2.')} Set it in your environment:`);
    console.log(`     ${pc.dim('# Windows (PowerShell)')}`);
    console.log(`     ${pc.white('$env:GOOGLE_API_KEY = "your_key_here"')}`);
    console.log(`     ${pc.dim('# Mac/Linux')}`);
    console.log(`     ${pc.white('export GOOGLE_API_KEY="your_key_here"')}`);
    console.log('');
    return false;
  }

  if (provider === 'groq' && !groqKey) {
    console.log('');
    console.log(pc.red(pc.bold('  Error: Groq API Key not found.')));
    console.log('');
    console.log(`  Please set your GROQ_API_KEY in your environment.`);
    console.log('');
    return false;
  }

  return true;
}
