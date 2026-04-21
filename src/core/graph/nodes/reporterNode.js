// src/core/graph/nodes/reporterNode.js
import fs from 'fs-extra';
import path from 'path';
import { printStep, succeedSpinner } from '../../utils/ui.js';

export async function reporterNode(state) {
  printStep('Reporter — generating migration summary');

  const { targetProjectPath, unresolvedErrors, filesQueue, completedFiles } =
    state;
  const reportPath = path.join(
    targetProjectPath,
    'RETRANSIFY_ACTION_REQUIRED.md'
  );

  // إذا لم يكن هناك أخطاء، نكتب رسالة نجاح وننهي العمل
  if (!unresolvedErrors || unresolvedErrors.length === 0) {
    const successReport = `# 🎉 Retransify Migration Successful\n\nAll ${filesQueue.length} files were successfully transpiled to React Native. No manual intervention required!`;
    await fs.writeFile(reportPath, successReport, 'utf8');
    succeedSpinner('Project transpiled perfectly. Zero unresolved errors.');
    return { ...state };
  }

  const totalFiles = (filesQueue?.length || 0) + (completedFiles?.length || 0);

  // بناء تقرير الأخطاء بتنسيق Markdown
  let reportContent = `# ⚠️ Retransify Migration Report: Manual Actions Required\n\n`;
  reportContent += `Out of **${totalFiles}** files processed, **${unresolvedErrors.length}** files require your manual intervention because they contain complex web patterns that could not be safely transpiled to React Native.\n\n`;
  reportContent += `---\n\n`;

  unresolvedErrors.forEach((err, index) => {
    reportContent += `### ${index + 1}. \`${err.filePath}\`\n`;
    reportContent += `- **Reason:** ${err.reason}\n`;
    reportContent += `- **Suggested Action:** ${err.suggestedAction}\n\n`;
    reportContent += `**Problematic Code Snippet:**\n`;
    reportContent += '```tsx\n';
    reportContent += `${err.codeSnippet}\n`;
    reportContent += '```\n\n';
    reportContent += `---\n`;
  });

  reportContent += `\n*Generated automatically by Retransify AI CLI.*`;

  // كتابة الملف في جذر مشروع إكسبو
  await fs.writeFile(reportPath, reportContent, 'utf8');

  succeedSpinner(
    `Migration completed with ${unresolvedErrors.length} unresolved errors. Check RETRANSIFY_ACTION_REQUIRED.md`
  );

  return { ...state };
}
