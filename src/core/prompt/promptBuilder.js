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
    filePath,
    globalContext, // Injected from Executor
    pathMap // Injected from Executor
  } = fileContext;

  const styleGuide = globalContext ? `
-----------------------------------
GLOBAL MIGRATION CONTEXT
-----------------------------------
Detected Tech Stack: ${globalContext.techStack}
Style System: ${globalContext.styleSystem}
Navigation Strategy: ${globalContext.navigationStrategy}
  ` : '';

  return `
25: You are an expert in converting React (web) projects into optimized and fully functional React Native applications.
26: 
27: Convert ONLY the target file. Do NOT modify any other files.
${styleGuide}

29: -----------------------------------
30: PROJECT STRUCTURE (FULL TREE)
31: -----------------------------------
32: ${JSON.stringify(projectStructure, null, 2)}
33: 
34: -----------------------------------
35: GLOBAL COMPONENT MAP
36: -----------------------------------
37: ${JSON.stringify(globalComponentMap, null, 2)}
38: 
39: -----------------------------------
40: DEPENDENCY GRAPH (imports)
41: -----------------------------------
42: ${JSON.stringify(dependencyGraph, null, 2)}
43: 
44: -----------------------------------
45: REVERSE DEPENDENCY GRAPH (files that depend on this file)
46: -----------------------------------
47: ${JSON.stringify(reverseDependencyGraph, null, 2)}
48: 
49: -----------------------------------
50: TARGET FILE INFORMATION
51: -----------------------------------
52: File Path: ${filePath}
53: Description: ${fileDescription}
54: Components: ${JSON.stringify(fileComponents)}
55: Exports: ${JSON.stringify(fileExports)}
56: Hooks Used: ${JSON.stringify(fileHooks)}
57: Contains JSX: ${fileHasJSX}
58: 
59: -----------------------------------
60: FILE IMPORTS
61: -----------------------------------
62: ${JSON.stringify(fileImports, null, 2)}
63: 
64: -----------------------------------
65: FILES THAT IMPORT THIS FILE
66: -----------------------------------
67: ${JSON.stringify(fileImportedBy, null, 2)}
68: 
69: -----------------------------------
70: ORIGINAL FILE CONTENT
71: -----------------------------------
72: ${fileContent}
73: 
74: -----------------------------------
SMART PATH MAPPING
-----------------------------------
The project structure is being reorganized. Use this map to find where files have moved.
Keys are original paths (relative to src), Values are new paths (relative to project root).
If an import points to a file in this map, rewrite the import path to be relative to the NEW location of THIS file.

${pathMap ? JSON.stringify(pathMap, null, 2) : "No mapping provided."}

-----------------------------------
75: CONVERSION RULES
76: -----------------------------------
77: 1. Convert HTML/JSX DOM elements into equivalent React Native components.
78: 2. Replace CSS classes with React Native StyleSheet objects.
79: 3. Convert inline styles into valid RN styles.
80: 4. Replace <div>, <span>, <button>, <img>, etc. with proper RN components.
81: 5. Replace "className" with React Native styles.
82: 6. Keep component names and props identical.
83: 7. Preserve internal logic (hooks, events, state).
84: 8. Keep imports that should remain, remove browser-specific ones.
85: 9. REWRITE IMPORTS: Checks the SMART PATH MAPPING above. If a file moved, update the import path to point to the new location.
86: 10. Use React Native APIs instead of DOM APIs.
87: 11. STRICT TYPESCRIPT: You are generating a .tsx file.
88:     - Define interface for all component Props.
89:     - Define types for State and Hooks.
90:     - Do NOT use 'any' unless absolutely necessary.
91: 12. DO NOT include explanations, comments, or markdown.
92: 13. Respond ONLY with the transformed code.
93: 14. Do NOT include backticks.

-----------------------------------
NOW PRODUCE THE TRANSFORMED REACT NATIVE FILE BELOW:
-----------------------------------
`;
}


