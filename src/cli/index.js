import { Command } from 'commander';
import path from 'path';
import pc from 'picocolors';
import readline from 'readline';
import { createRequire } from 'module';
import { handleConvert } from '../core/commands/convertCommand.js';
import { runDoctor } from '../core/utils/doctor.js';
import { printBanner } from '../core/utils/ui.js';
import { getActiveModelName } from '../core/ai/aiFactory.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

export async function runCLI() {
  printBanner(getActiveModelName());

  // 1. Validate API Key
  if (!validateApiKey()) {
    return;
  }

  const program = new Command();

  program
    .name(pc.cyan('retransify'))
    .description(pc.dim(pkg.description))
    .version(pkg.version, '-v, --version', 'Output the current version');

  program
    .command('convert', { isDefault: true })
    .description('Transpile a React web project to React Native (Expo)')
    .argument('[path]', 'Path to the source React project', '.')
    .option('-n, --name <name>', 'Name for the new mobile project')
    .option('-o, --output <dir>', 'Custom output directory (overrides name)')
    .action(async (source, options) => {
      const projectPath = path.resolve(source);
      const defaultName = `${path.basename(projectPath)}-mobile`;

      let projectName = options.name;
      let targetProjectPath;

      if (options.output) {
        targetProjectPath = path.resolve(process.cwd(), options.output);
      } else {
        if (!projectName) {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });

          projectName = await new Promise((resolve) => {
            rl.question(
              `\n${pc.cyan('?')} ${pc.bold('Project name')} ${pc.dim(`(${defaultName})`)}: `,
              (answer) => {
                rl.close();
                resolve(answer.trim() || defaultName);
              }
            );
          });
        }
        targetProjectPath = path.resolve(process.cwd(), projectName);
      }

      await handleConvert(projectPath, targetProjectPath);
    });

  program
    .command('doctor')
    .description('Verify the health of a converted Expo project')
    .argument('[path]', 'Path to the generated Expo project', '.')
    .action(async (target) => {
      const projectPath = path.resolve(target);
      await runDoctor(projectPath);
    });

  // Custom help formatting
  program.addHelpText(
    'after',
    `
${pc.bold('Examples:')}
  ${pc.cyan('$ retransify .')}                             ${pc.dim('# Convert project in current folder')}
  ${pc.cyan('$ retransify ./my-app --name mobile-app')}    ${pc.dim('# Convert with a specific name')}
  ${pc.cyan('$ retransify doctor ./mobile-app')}           ${pc.dim('# Run health check on output')}

${pc.bold('Documentation:')}
  ${pc.underline('https://github.com/Husam-Abdulraheem/retransify')}
`
  );

  if (process.argv.length <= 2) {
    program.help();
  }

  await program.parseAsync(process.argv);
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
    console.log(`     ${pc.dim('# Windows (CMD)')}`);
    console.log(`     ${pc.white('set GOOGLE_API_KEY=your_key_here')}`);
    console.log(`     ${pc.dim('# Mac / Linux')}`);
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
