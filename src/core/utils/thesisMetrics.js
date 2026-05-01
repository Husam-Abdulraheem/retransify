import fs from 'fs';
import path from 'path';

let startTime = 0;
let totalTokens = 0;
let totalLLOC = 0;
let projectPath = '';
let projectName = '';

export function countLLOC(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').filter((line) => line.trim().length > 0).length;
  } catch (err) {
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

  addTokens(tokens) {
    if (!process.env.THESIS_MODE) return;
    if (typeof tokens === 'number') {
      totalTokens += tokens;
    }
  },

  setTotalLLOC(filesQueue) {
    if (!process.env.THESIS_MODE) return;
    totalLLOC = 0;
    for (const file of filesQueue) {
      if (file.absolutePath) {
        totalLLOC += countLLOC(file.absolutePath);
      }
    }
  },

  saveMetrics(telemetryArray) {
    if (!process.env.THESIS_MODE) return;

    const executionTime = ((performance.now() - startTime) / 1000).toFixed(2);

    let filesWithIssuesCount = 0;

    if (telemetryArray && Array.isArray(telemetryArray)) {
      for (const item of telemetryArray) {
        if (
          item.status === 'failed' ||
          item.status === 'manual_action_required'
        ) {
          filesWithIssuesCount++;
        }
      }
    }

    const csvLine = `${projectName},${totalLLOC},${filesWithIssuesCount},${executionTime},${totalTokens}\n`;
    const csvPath = path.resolve(process.cwd(), 'retransify-metrics.csv');

    const header =
      'Project Name,Total LLOC,Files with issues,Execution Time,Total Tokens\n';
    if (!fs.existsSync(csvPath)) {
      fs.writeFileSync(csvPath, header, 'utf-8');
    }
    fs.appendFileSync(csvPath, csvLine, 'utf-8');

    // Cleanup variables to prevent memory leaks
    startTime = 0;
    totalTokens = 0;
    totalLLOC = 0;
  },
};
