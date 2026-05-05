import { Command } from 'commander';
import fs from 'fs';
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
    .version(pkg.version, '-v, --version', 'Output the current version')
    .option('-n, --name <name>', 'Name for the new mobile project')
    .option('-o, --output <dir>', 'Custom output directory (overrides name)')
    .option('-f, --force', 'Overwrite target directory if it exists');

  program
    .command('convert', { isDefault: true })
    .alias('c')
    .description('Transpile a React web project to React Native (Expo)')
    .argument('[path]', 'Path to the source React project', '.')
    .action(async (source) => {
      const options = program.opts();
      const sourcePath = path.resolve(source);

      // Validation: Check if source path exists
      if (!fs.existsSync(sourcePath)) {
        console.error(
          `\n${pc.red('Error:')} Source path ${pc.bold(source)} does not exist.`
        );
        process.exit(1);
      }

      // Validation: Check if it's a JS/TS project (has package.json)
      if (!fs.existsSync(path.join(sourcePath, 'package.json'))) {
        console.warn(
          `\n${pc.yellow('Warning:')} No ${pc.bold('package.json')} found in ${pc.dim(sourcePath)}. Is this a React project?`
        );
      }

      const defaultName = `${path.basename(sourcePath)}-mobile`;

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

      // Force handling: Check if target exists
      if (fs.existsSync(targetProjectPath) && !options.force) {
        console.error(
          `\n${pc.red('Error:')} Target directory ${pc.bold(path.basename(targetProjectPath))} already exists.`
        );
        console.log(`  Use ${pc.cyan('--force')} to overwrite it.\n`);
        process.exit(1);
      }

      await handleConvert(sourcePath, targetProjectPath);
    });

  program
    .command('doctor')
    .alias('d')
    .description('Verify the health of a converted Expo project')
    .argument('[path]', 'Path to the generated Expo project', '.')
    .action(async (target) => {
      const projectPath = path.resolve(target);
      if (!fs.existsSync(projectPath)) {
        console.error(
          `\n${pc.red('Error:')} Path ${pc.bold(target)} does not exist.`
        );
        process.exit(1);
      }
      await runDoctor(projectPath);
    });

  // Custom help formatting
  program.addHelpText(
    'after',
    `
${pc.bold('Aliases:')}
  ${pc.cyan('c')}, ${pc.dim('convert')}
  ${pc.cyan('d')}, ${pc.dim('doctor')}

${pc.bold('Examples:')}
  ${pc.cyan('$ retransify .')}                             ${pc.dim('# Convert current folder (Interactive)')}
  ${pc.cyan('$ retransify ./web-app --name mobile')}       ${pc.dim('# Convert with specific name')}
  ${pc.cyan('$ retransify ./web-app --force')}              ${pc.dim('# Overwrite existing target folder')}
  ${pc.cyan('$ retransify c ./web-app -o ./out')}          ${pc.dim('# Use alias and custom output')}
  ${pc.cyan('$ retransify d ./mobile-app')}                ${pc.dim('# Run health check (alias)')}

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
