// src/core/utils/ui.js
// ─────────────────────────────────────────────────────────────
//  Centralized CLI display layer for Retransify
//  All output MUST go through this module — no direct console.log
// ─────────────────────────────────────────────────────────────
import pc from 'picocolors';
import ora from 'ora';

// ── Internal state ─────────────────────────────────────────────
let _spinner = null;

// Handle terminal resize to prevent "ghosting" or broken lines
if (process.stdout.isTTY) {
  let resizeTimeout;
  process.stdout.on('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (_spinner && _spinner.isSpinning) {
        const text = _spinner.text;
        const prefixText = _spinner.prefixText;
        const color = _spinner.color;
        _spinner.stop();
        _spinner = ora({ text, prefixText, color }).start();
      }
    }, 100);
  });
}

// ── Banner ─────────────────────────────────────────────────────

/**
 * Prints the Retransify ASCII banner.
 * Call once at CLI startup.
 * @param {string} [modelName] - The name of the AI model being used
 */
export function printBanner(modelName) {
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
  const version = pc.dim('  v1.0.0-beta.2');
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
  if (modelName) {
    console.log(pc.dim(`  Model: ${pc.cyan(modelName)}`));
  }
  console.log(separator);
  console.log('');
}

// ── Spinner Controls ───────────────────────────────────────────

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
    _spinner.text = pc.white(text);
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
  console.log(pc.bold(pc.white(`  ⚡ ${label}`)));
}

/** Dim secondary detail line — used inside node logs */
export function printDetail(msg) {
  console.log(pc.dim(`     ${msg}`));
}

// ── File Processing Logs ───────────────────────────────────────

/** Shown when a new file enters the pipeline */
export function printFileStart(filePath, count) {
  console.log('');
  const countStr = count.toString().padStart(2, ' ');
  const counter = pc.dim('[') + pc.cyan(pc.bold(countStr)) + pc.dim(']');
  console.log(`  ${pc.white('📄')} ${counter}  ${pc.bold(pc.white(filePath))}`);
}

/** Shown when a file completes successfully */
export function printFileSuccess(filePath) {
  console.log(
    `  ${pc.green('✨')} ${pc.green('Transpiled:')} ${pc.white(pc.bold(filePath))}`
  );
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
 * Legacy wrapper: Tree-style sub-step last branch └─
 * @param {string} msg
 */
export function printSubStepLast(msg) {
  printSubStep(msg, 0, true);
}

/**
 * Clean metadata block — printed once right after the banner.
 * @param {{ target: string, stack: string, initialFiles: number }} info
 */
export function printMeta({ target, stack, initialFiles }) {
  console.log(pc.cyan(`  ℹ  Target : ${target}`));
  if (stack) {
    const displayStack = stack.charAt(0).toUpperCase() + stack.slice(1);
    console.log(pc.cyan(`  ℹ  Stack  : ${displayStack}`));
  }
  console.log(
    pc.cyan(
      `  ℹ  Initial Scan : ${initialFiles} file${initialFiles !== 1 ? 's' : ''} detected`
    )
  );
  console.log('');
}

// ── Summary Box ────────────────────────────────────────────────

/**
 * Prints the final summary box after migration completes.
 *
 * @param {{ completed: number, failed: number, outputPath: string, elapsedMs: number }} stats
 */
export function printSummaryBox({
  completed,
  failed,
  skipped = 0,
  unresolved = 0,
  outputPath,
  elapsedMs,
}) {
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
  if (unresolved > 0) {
    console.log(pad(' ⚠  Files with issues: ', unresolved, pc.yellow));
  }
  console.log(
    pad(' ✖  Files failed    : ', failed, failed > 0 ? pc.red : pc.dim)
  );
  if (skipped > 0) {
    console.log(pad(' ⏩ Files skipped   : ', skipped, pc.yellow));
  }
  console.log(pad(' ⏱  Time elapsed    : ', `${elapsedSec}s`, pc.yellow));
  console.log(pad(' 📂 Output path     : ', outputPath, pc.cyan));
  console.log(pc.cyan(bottomBorder));
  console.log('');
}

// ── Navigation Schema Display ──────────────────────────────────

/**
 * Prints a visual block summarizing the navigation architecture
 * decided by the Layout Agent.
 *
 * @param {{ type: string, tabs?: string[], drawerScreens?: string[], modals?: string[] }} schema
 */
export function printNavigationSchema(schema) {
  const icons = { tabs: '📑', drawer: '☰ ', stack: '📋' };
  const typeLabel = schema.type?.toUpperCase() ?? 'STACK';
  const icon = icons[schema.type] ?? '📋';

  console.log('');
  console.log(
    pc.bold(pc.magenta(`  ${icon}  Navigation Architecture: ${typeLabel}`))
  );

  if (schema.type === 'tabs' && schema.tabs?.length > 0) {
    schema.tabs.forEach((tab, i) => {
      const isLast = i === schema.tabs.length - 1;
      const branch = isLast ? '└─' : '├─';
      console.log(pc.magenta(`     ${branch} Tab: `) + pc.dim(tab));
    });
  }

  if (schema.type === 'drawer' && schema.drawerScreens?.length > 0) {
    schema.drawerScreens.forEach((screen, i) => {
      const isLast = i === schema.drawerScreens.length - 1;
      const branch = isLast ? '└─' : '├─';
      console.log(pc.magenta(`     ${branch} Drawer: `) + pc.dim(screen));
    });
  }

  if (schema.modals?.length > 0) {
    console.log(pc.magenta('     ├─ Modals:'));
    schema.modals.forEach((modal, i) => {
      const isLast = i === schema.modals.length - 1;
      const branch = isLast ? '└─' : '├─';
      console.log(pc.dim(`     │  ${branch} ${modal}`));
    });
  }

  console.log('');
}

// ── Legacy / Object API Wrapper ────────────────────────────────
export const ui = {
  step: printStep,
  printSubStep,
  printSubStepLast,
  printTreeLine,
  warn: printWarning,
  error: printError,
  info: printInfo,
  success: printSuccess,
  startSpinner,
  stopSpinner,
  succeedSpinner,
  failSpinner,
};
