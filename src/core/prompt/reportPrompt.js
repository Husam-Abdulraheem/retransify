/**
 * Builds the prompt for the AI Handoff Report Generator
 *
 * @param {Object} payload - The raw telemetry and project metadata
 * @returns {string}
 */
export function buildReportPrompt(payload) {
  return `
You are a Release Engineer. Below is the Telemetry and technical context for a React-to-Expo project migration.
Please write a professional Markdown Handoff Document.

Raw JSON Data (Project Context & Metrics):
${JSON.stringify(payload, null, 2)}

Requirements:
1. Summary Table: Use the following precise terminology:
   - "Total Files Processed"
   - "Successfully Translated (Code Level)"
   - "Manual Action / Rewrite Required"

2. Report Sections:
   - Success Metrics: A summary of the numbers and percentages.
   - Manual Action Required: Group files with similar failure reasons (from Telemetry) for better readability, and provide specific technical remediation steps.
   - New Routing Map: Explain the mapping from original React paths to the new Expo Router structure.
   - Next Steps: Essential commands (e.g., npx expo start) and performance optimization tips.

3. Post-Migration QA Checklist (CRITICAL):
   Based on the detected technologies (state.facts.tech, package.json) and the attached Telemetry logs:
   - DO NOT use generic examples or static templates.
   - Infer specific visual or functional discrepancies (Runtime/UI Discrepancies) based ONLY on the actual packages and patterns found in this project.
   - If files failed due to specific web-only libraries, explicitly warn the developer to review native alternatives.
   - Write these warnings as an actionable, step-by-step checklist.

Note: Write the report in English with a professional, data-driven tone. Use Markdown tables and checklists to make the document highly readable and impressive.
`;
}
