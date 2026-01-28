/**
 * يبني prompt كامل بناءً على سياق الملف
 *
 * @param {object} fileContext - ناتج buildFileContext
 * @returns {string} prompt
 */
export function buildPrompt(fileContext) {
  const {
    projectStructure,
    globalComponentMap,
    dependencyGraph,
    reverseDependencyGraph,
    fileDescription,
    fileImports,
    fileImportedBy,
    fileComponents,
    fileExports,
    fileHooks,
    fileHasJSX,
    fileContent,
    filePath
  } = fileContext;

  return `
You are an expert in converting React (web) projects into optimized and fully functional React Native applications.

Convert ONLY the target file. Do NOT modify any other files.

-----------------------------------
PROJECT STRUCTURE (FULL TREE)
-----------------------------------
${JSON.stringify(projectStructure, null, 2)}

-----------------------------------
GLOBAL COMPONENT MAP
-----------------------------------
${JSON.stringify(globalComponentMap, null, 2)}

-----------------------------------
DEPENDENCY GRAPH (imports)
-----------------------------------
${JSON.stringify(dependencyGraph, null, 2)}

-----------------------------------
REVERSE DEPENDENCY GRAPH (files that depend on this file)
-----------------------------------
${JSON.stringify(reverseDependencyGraph, null, 2)}

-----------------------------------
TARGET FILE INFORMATION
-----------------------------------
File Path: ${filePath}
Description: ${fileDescription}
Components: ${JSON.stringify(fileComponents)}
Exports: ${JSON.stringify(fileExports)}
Hooks Used: ${JSON.stringify(fileHooks)}
Contains JSX: ${fileHasJSX}

-----------------------------------
FILE IMPORTS
-----------------------------------
${JSON.stringify(fileImports, null, 2)}

-----------------------------------
FILES THAT IMPORT THIS FILE
-----------------------------------
${JSON.stringify(fileImportedBy, null, 2)}

-----------------------------------
ORIGINAL FILE CONTENT
-----------------------------------
${fileContent}

-----------------------------------
CONVERSION RULES
-----------------------------------
1. Convert HTML/JSX DOM elements into equivalent React Native components.
2. Replace CSS classes with React Native StyleSheet objects.
3. Convert inline styles into valid RN styles.
4. Replace <div>, <span>, <button>, <img>, etc. with proper RN components.
5. Replace "className" with React Native styles.
6. Keep component names and props identical.
7. Preserve internal logic (hooks, events, state).
8. Keep imports that should remain, remove browser-specific ones.
9. Use React Native APIs instead of DOM APIs.
10. DO NOT include explanations, comments, or markdown.
11. Respond ONLY with the transformed code.
12. Do NOT include backticks.

-----------------------------------
NOW PRODUCE THE TRANSFORMED REACT NATIVE FILE BELOW:
-----------------------------------
`;
}
