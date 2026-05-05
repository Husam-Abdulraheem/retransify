// src/core/utils/thesisMetrics.js
import fs from 'fs';
import path from 'path';

// State Variables
let startTime = 0;
let totalInputTokens = 0;
let totalOutputTokens = 0;
let totalLLOC = 0;
let totalFiles = 0;
let totalHealerRetries = 0;
let totalCostUSD = 0;
let projectPath = '';
let projectName = '';
let usedModels = new Set();

/**
 * model pricing per 1 million token (Gemini 1.5/3 Pricing)
 */
const PRICING = {
  // Gemini 1.5 Flash / Gemini 3 Flash equivalent
  'gemini-3-flash-preview': { input: 0.075, output: 0.3 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },

  // Gemini 1.5 Pro / Gemini 3.1 Pro equivalent
  'gemini-3.1-pro-preview': { input: 3.5, output: 10.5 },
  'gemini-1.5-pro': { input: 3.5, output: 10.5 },

  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  default: { input: 0.15, output: 0.6 },
};

export function countLLOC(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').filter((line) => line.trim().length > 0).length;
  } catch {
    return 0;
  }
}

export const thesisMetrics = {
  startTimer(pPath) {
    if (!process.env.THESIS_MODE) return;
    startTime = performance.now();
    projectPath = pPath;
    projectName = path.basename(path.resolve(pPath));
  },

  setTotalLLOC(filesQueue) {
    if (!process.env.THESIS_MODE) return;
    totalLLOC = 0;
    totalFiles = filesQueue.length;
    for (const file of filesQueue) {
      if (file.absolutePath) {
        totalLLOC += countLLOC(file.absolutePath);
      }
    }
  },

  /**
   * calculating cost
   */
  recordModelUsage({
    modelName,
    inputTokens,
    outputTokens,
    isHealerRetry = false,
  }) {
    if (!process.env.THESIS_MODE) return;

    if (modelName) usedModels.add(modelName);

    const inTokens = inputTokens || 0;
    const outTokens = outputTokens || 0;

    totalInputTokens += inTokens;
    totalOutputTokens += outTokens;

    if (isHealerRetry) {
      totalHealerRetries += 1;
    }

    // ── Smart Pricing Lookup ───────────────────────────────────────
    // searching for the best pricing based on keywords in the model name
    let rates = PRICING['default'];
    const lowerName = (modelName || '').toLowerCase();

    if (lowerName.includes('pro')) {
      rates = PRICING['gemini-3.1-pro-preview'];
    } else if (lowerName.includes('flash')) {
      rates = PRICING['gemini-3-flash-preview'];
    } else if (lowerName.includes('gpt-4o-mini')) {
      rates = PRICING['gpt-4o-mini'];
    }
    // ──────────────────────────────────────────────────────────────

    // calculating cost
    const costForCall =
      (inTokens / 1000000) * rates.input + (outTokens / 1000000) * rates.output;
    totalCostUSD += costForCall;
  },

  saveMetrics(telemetryArray) {
    if (!process.env.THESIS_MODE) return;

    const executionTimeSec = ((performance.now() - startTime) / 1000).toFixed(
      2
    );
    let filesWithIssuesCount = 0;

    if (telemetryArray && Array.isArray(telemetryArray)) {
      const problematicFiles = new Set();

      for (const item of telemetryArray) {
        if (
          item.status === 'failed' ||
          item.status === 'manual_action_required'
        ) {
          problematicFiles.add(item.file || item.filePath);
        }
      }
      filesWithIssuesCount = problematicFiles.size;
    }

    // calculating success rate
    const successRate =
      totalFiles > 0
        ? (((totalFiles - filesWithIssuesCount) / totalFiles) * 100).toFixed(2)
        : 0;
    const costPer1kLLOC =
      totalLLOC > 0 ? ((totalCostUSD / totalLLOC) * 1000).toFixed(4) : 0;
    const modelsUsedStr = Array.from(usedModels).join(' | ');

    // preparing csv line (academic metrics)
    const csvLine = `${projectName},${totalFiles},${totalLLOC},${filesWithIssuesCount},${successRate}%,${executionTimeSec},${totalHealerRetries},${totalInputTokens},${totalOutputTokens},${totalInputTokens + totalOutputTokens},$${totalCostUSD.toFixed(4)},$${costPer1kLLOC},${modelsUsedStr},,\n`;

    const csvPath = path.resolve(process.cwd(), 'retransify-metrics.csv');
    const header =
      'Project Name,Total Files,Total LLOC,Files with Issues,Success Rate,Execution Time (s),Healer Retries,Input Tokens,Output Tokens,Total Tokens,Total Cost (USD),Cost per 1k LLOC (USD),Models Used,Manual Edit LLOC,Notes\n';

    let shouldWriteHeader = !fs.existsSync(csvPath);

    // If file exists, check if it has the old header
    if (!shouldWriteHeader) {
      try {
        const firstLine = fs.readFileSync(csvPath, 'utf-8').split('\n')[0];
        if (firstLine.trim() !== header.trim()) {
          shouldWriteHeader = true; // Force overwrite with new header
        }
      } catch {
        shouldWriteHeader = true;
      }
    }

    if (shouldWriteHeader) {
      fs.writeFileSync(csvPath, header, 'utf-8');
    }
    fs.appendFileSync(csvPath, csvLine, 'utf-8');

    // ── Clean Slate ────────────────────────────────────────────────
    // reset variables for next project
    startTime = 0;
    totalInputTokens = 0;
    totalOutputTokens = 0;
    totalLLOC = 0;
    totalFiles = 0;
    totalHealerRetries = 0;
    totalCostUSD = 0;
    usedModels.clear();
    projectName = '';
    projectPath = '';
  },
};
