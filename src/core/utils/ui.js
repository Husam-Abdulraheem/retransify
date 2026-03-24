// src/core/utils/ui.js
// ─────────────────────────────────────────────────────────────
//  Centralized CLI display layer for Retransify
//  All output MUST go through this module — no direct console.log
// ─────────────────────────────────────────────────────────────
import pc from 'picocolors';
import ora from 'ora';

// ── Internal spinner instance ──────────────────────────────────
let _spinner = null;

// ── Banner ─────────────────────────────────────────────────────

/**
 * Prints the Retransify ASCII banner.
 * Call once at CLI startup.
 */
export function printBanner() {
  const line1 = pc.cyan(
    '  ██████╗ ███████╗████████╗██████╗  █████╗ ███╗  ██╗███████╗██╗███████╗██╗   ██╗'
  );
  const line2 = pc.cyan(
    '  ██╔══██╗██╔════╝╚══██╔══╝██╔══██╗██╔══██╗████╗ ██║██╔════╝██║██╔════╝╚██╗ ██╔╝'
  );
  const line3 = pc.cyan(
    '  ██████╔╝█████╗     ██║   ██████╔╝███████║██╔██╗██║███████╗██║█████╗   ╚████╔╝ '
  );
  const line4 = pc.cyan(
    '  ██╔══██╗██╔══╝     ██║   ██╔══██╗██╔══██║██║╚████║╚════██║██║██╔══╝    ╚██╔╝  '
  );
  const line5 = pc.cyan(
    '  ██║  ██║███████╗   ██║   ██║  ██║██║  ██║██║ ╚███║███████║██║██║        ██║   '
  );
  const line6 = pc.cyan(
    '  ╚═╝  ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚══╝╚══════╝╚═╝╚═╝        ╚═╝   '
  );
  const tagline = pc.dim('  React → React Native · Powered by AI');
  const version = pc.dim('  v1.0.0');
  const separator = pc.dim('  ' + '─'.repeat(80));

  console.log('');
  console.log(line1);
  console.log(line2);
  console.log(line3);
  console.log(line4);
  console.log(line5);
  console.log(line6);
  console.log('');
  console.log(tagline + '  ' + version);
  console.log(separator);
  console.log('');
}

// ── Spinner Controls ───────────────────────────────────────────

/**
 * Stops any running spinner and starts a new one with the given text.
 * @param {string} text
 */
export function startSpinner(text) {
  if (_spinner) _spinner.stop();
  _spinner = ora({ text: pc.cyan(text), color: 'cyan' }).start();
}

/**
 * Starts an indented spinner — used for sub-steps (AI conversion, etc.)
 * @param {string} text
 */
export function startSubSpinner(text) {
  if (_spinner) _spinner.stop();
  _spinner = ora({
    text: pc.cyan(text),
    color: 'cyan',
    prefixText: pc.dim('     ├─ '),
  }).start();
}

/**
 * Updates an indented sub-spinner text
 * @param {string} text
 * @param {number} indent - Nested level (0 = ├─, 1 = │  ├─)
 */
export function updateSubSpinner(text, indent = 0) {
  if (_spinner) {
    const prefix = indent > 0 ? '│  '.repeat(indent) : '';
    _spinner.prefixText = pc.dim(`     ${prefix}├─ `);
    _spinner.text = pc.cyan(text);
  }
}

/**
 * ⚠️  MUST call before any raw console output (npm, LangGraph, etc.)
 * Stops and hides the spinner cleanly to avoid broken lines.
 */
export function stopSpinner() {
  if (_spinner) {
    _spinner.stop();
    _spinner = null;
  }
}

/**
 * Marks the current spinner as succeeded with a green checkmark.
 * @param {string} text
 */
export function succeedSpinner(text) {
  if (_spinner) {
    _spinner.succeed(pc.green(text));
    _spinner = null;
  } else {
    console.log(pc.green(`  ✔  ${text}`));
  }
}

/**
 * Marks the current spinner as failed with a red X.
 * @param {string} text
 */
export function failSpinner(text) {
  if (_spinner) {
    _spinner.fail(pc.red(text));
    _spinner = null;
  } else {
    console.log(pc.red(`  ✖  ${text}`));
  }
}

/**
 * Updates the text of the currently running spinner without interrupting it.
 * @param {string} text
 */
export function updateSpinner(text) {
  if (_spinner) {
    _spinner.text = pc.cyan(text);
  }
}

// ── Colored Message Helpers ────────────────────────────────────

/** Cyan info message */
export function printInfo(msg) {
  console.log(pc.cyan(`  ℹ  ${msg}`));
}

/** Green success message */
export function printSuccess(msg) {
  console.log(pc.green(`  ✔  ${msg}`));
}

/** Red error message */
export function printError(msg) {
  console.error(pc.red(`  ✖  ${msg}`));
}

/** Yellow warning message */
export function printWarning(msg) {
  console.warn(pc.yellow(`  ⚠  ${msg}`));
}

/** Bold white step heading — used for major workflow phases */
export function printStep(label) {
  console.log('');
  console.log(pc.bold(pc.white(`  ▶  ${label}`)));
}

/** Dim secondary detail line — used inside node logs */
export function printDetail(msg) {
  console.log(pc.dim(`     ${msg}`));
}

// ── File Processing Logs ───────────────────────────────────────

/** Shown when a new file enters the pipeline */
export function printFileStart(filePath, remaining) {
  console.log('');
  console.log(
    pc.bold(pc.blue(`  📄 ${filePath}`) + pc.dim(` (${remaining} remaining)`))
  );
}

/** Shown when a file completes successfully */
export function printFileSuccess(filePath) {
  console.log(pc.green(`  ✔  Done → ${filePath}`));
}

/** Shown when a file is skipped or blocked */
export function printFileSkip(reason, filePath) {
  console.log(pc.dim(`  ⏩ ${reason}: ${filePath}`));
}

/**
 * Tree-style sub-step under the current file
 * @param {string} msg
 * @param {number} indent - Nested level
 * @param {boolean} isLast - Whether this is the final branch (└─)
 */
export function printSubStep(msg, indent = 0, isLast = false) {
  const prefix = indent > 0 ? '│  '.repeat(indent) : '';
  const branch = isLast ? '└─ ' : '├─ ';
  console.log(pc.dim(`     ${prefix}${branch}${msg}`));
}

/**
 * Vertical bar for nested sub-steps
 * @param {string} msg
 * @param {number} indent
 */
export function printTreeLine(msg, indent = 1) {
  const prefix = '│  '.repeat(indent);
  console.log(pc.dim(`     ${prefix}├─ `) + msg);
}

/**
 * Prints a file written notification with icon
 * @param {string} filePath
 */
export function printFileWritten(filePath) {
  console.log(pc.bold(pc.white(`📁 File written: ${filePath}`)));
}

/**
 * Legacy wrapper: Tree-style sub-step last branch └─
 * @param {string} msg
 */
export function printSubStepLast(msg) {
  printSubStep(msg, 0, true);
}

/**
 * Clean metadata block — printed once right after the banner.
 * @param {{ target: string, stack: string, queue: number }} info
 */
export function printMeta({ target, stack, queue }) {
  console.log(pc.cyan(`  ℹ  Target : ${target}`));
  if (stack) {
    // Standardize stack name display (Vite, React Native)
    const displayStack = stack.charAt(0).toUpperCase() + stack.slice(1);
    console.log(pc.cyan(`  ℹ  Stack  : ${displayStack}`));
  }
  console.log(
    pc.cyan(`  ℹ  Queue  : ${queue} file${queue !== 1 ? 's' : ''} to process`)
  );
  console.log('');
}

// ── Summary Box ────────────────────────────────────────────────

/**
 * Prints the final summary box after migration completes.
 *
 * @param {{ completed: number, failed: number, outputPath: string, elapsedMs: number }} stats
 */
export function printSummaryBox({ completed, failed, outputPath, elapsedMs }) {
  const elapsedSec = (elapsedMs / 1000).toFixed(1);
  const width = 52;
  const topBorder = '  ╔' + '═'.repeat(width) + '╗';
  const midBorder = '  ╠' + '═'.repeat(width) + '╣';
  const bottomBorder = '  ╚' + '═'.repeat(width) + '╝';

  const pad = (label, value, color) => {
    let rawValue = String(value);
    const maxAvailableSpace = width - label.length - 2;

    // Smart truncation for long values (e.g. paths)
    if (rawValue.length > maxAvailableSpace) {
      rawValue = '...' + rawValue.slice(-(maxAvailableSpace - 3));
    }

    const padCount = maxAvailableSpace - rawValue.length;
    return (
      '  ║ ' + pc.bold(label) + color(rawValue) + ' '.repeat(padCount) + ' ║'
    );
  };

  // Emojis take 2 chars in memory but display as 1 — adjust padding manually
  const title = '  Migration Complete!🎉';
  const titlePadding = ' '.repeat(width - title.length + 1);
  const header = '  ║' + pc.cyan(pc.bold(title)) + titlePadding + '║';

  console.log('');
  console.log(pc.cyan(topBorder));
  console.log(header);
  console.log(pc.cyan(midBorder));
  console.log(pad(' ✔  Files converted : ', completed, pc.green));
  console.log(
    pad(' ✖  Files failed    : ', failed, failed > 0 ? pc.red : pc.dim)
  );
  console.log(pad(' ⏱  Time elapsed    : ', `${elapsedSec}s`, pc.yellow));
  console.log(pad(' 📂 Output path     : ', outputPath, pc.cyan));
  console.log(pc.cyan(bottomBorder));
  console.log('');
}

// ── Legacy / Object API Wrapper ────────────────────────────────
export const ui = {
  step: printStep,
  printSubStep,
  printSubStepLast,
  printTreeLine,
  printFileWritten,
  warn: printWarning,
  error: printError,
  info: printInfo,
  success: printSuccess,
  startSpinner,
  stopSpinner,
  succeedSpinner,
  failSpinner,
};
