// src/core/prompts/promptBuilder.js
import {
  COMMON_DEPENDENCIES,
  LEGACY_TO_EXPO_MAP,
  WEB_ONLY_BLOCKLIST,
} from '../config/libraryRules.js';

/**
 * Builds a smart and flexible prompt based on context
 */
export function buildPrompt(fileContext) {
  const {
    filePath,
    content: fileContent,
    imports: fileImports = [],
    exports: fileExports = [],
    pathMap = {},
    exactImportsMap = {},
    globalContext = {},
    installedPackages = [],
  } = fileContext;

  const facts = globalContext.facts || {};
  const tech = facts.tech || {};

  // 1. Infer Tech Stack
  const isTailwindDetected =
    /className\s*=\s*["'`]/.test(fileContent) ||
    /['"]tailwindcss['"]/.test(fileContent);
  const targetStyleSystem =
    tech.styling || (isTailwindDetected ? 'NativeWind' : 'StyleSheet');
  const isNativeWind = targetStyleSystem === 'NativeWind';
  const hasRouting = tech.routing !== 'None';

  // 2. Role Definition
  const roleDefinition = `
You are a Senior Mobile Architect expert in migrating React Web code to React Native (Expo Managed Workflow).
Your objective is to convert the provided web file into a production-ready, idiomatic React Native file.
`;

  // 3. Strict Architecture Rules (The Core Firewall)
  const strictRulesBlock = `
-----------------------------------
STRICT ARCHITECTURAL RULES
-----------------------------------
${
  fileContext.isMainEntry
    ? `[CRITICAL - MAIN ENTRY POINT]
This is the core App component. You MUST output a standard React Native component to serve as the 'app/index.tsx' screen for Expo Router.
STRICT PROHIBITION: DO NOT use manual DOM renderers or root mounting logic. Expo Router handles mounting automatically.
`
    : ''
}
1. TARGET FRAMEWORK (WEB TO NATIVE MAPPING):
   - DOM ABSTRACTION: Completely eliminate ALL HTML/DOM elements. Map them to their semantic React Native primitives (e.g., text containers to <Text>, blocks to <View>, interactables to <Pressable>).
   - BROWSER API ABSTRACTION: Identify any usage of Browser-specific APIs (e.g., Window, Document, DOM storage). Replace them with React Native APIs, Expo SDK features, or standard JavaScript equivalents.

2. STYLING SYSTEM: **${targetStyleSystem}**
${
  isNativeWind
    ? "   - You MUST use the 'className' prop with Tailwind classes (NativeWind is pre-configured).\n   - Translate standard CSS/inline styles to Tailwind classes where possible."
    : "   - You MUST use 'StyleSheet.create({...})'.\n   - DO NOT use 'className'. Translate any existing Tailwind classes to standard StyleSheet objects."
}

3. ROUTING & NAVIGATION (CRITICAL):
${
  hasRouting
    ? `   - The target project uses **Expo Router** (File-based routing).
   - ROUTING ABSTRACTION: Identify ANY web-based or legacy routing library used in the original code. You MUST remove its imports.
   - Translate all declarative web links and imperative navigation hooks to Expo Router equivalents (import { Link, router } from 'expo-router').
   - If this file represents a global provider, structure it so it can be used inside an Expo Router '_layout.tsx' file (export a component that wraps <Slot />).`
    : '   - No specific routing library detected. Use standard React state for conditional rendering if needed.'
}

4. DEPENDENCIES & LIBRARIES MAP:
   - Base Expo Libraries (Pre-installed): ${COMMON_DEPENDENCIES.join(', ')}
   - Installed Packages in Environment: ${installedPackages.join(', ')}
   - STRICT ENGINEERING RULE: You are forbidden to use or import ANY library outside the compiled 'Installed Packages in Environment' list. You are strictly forbidden to invent or introduce new libraries.
   - DYNAMIC LIBRARY RESOLUTION: You MUST strictly follow this translation map for known libraries:
     ${JSON.stringify(LEGACY_TO_EXPO_MAP, null, 2)}
   - FORBIDDEN LIBRARIES HANDLING: 
     Blocklist: ${WEB_ONLY_BLOCKLIST.join(', ')}
     If the original code imports ANY library from this blocklist, or ANY library built exclusively for the Web/DOM, you MUST delete the import. Reverse-engineer its logic and implement the equivalent using pure React Native/Expo features.
   - ICONS ABSTRACTION: Standardize ALL third-party icon libraries to use '@expo/vector-icons' exclusively.

5. MOBILE UI/UX & LAYOUT ADAPTATION (CRITICAL):
   - NO CSS GRID: React Native uses Flexbox exclusively. Convert all grid layouts to semantic Flexbox structures.
   - FLEX DIRECTION: React Native 'flexDirection' defaults to 'column'. Explicitly handle horizontal alignments.
   - RESPONSIVENESS: Replace fixed desktop dimensions with fluid mobile constraints ('w-full', 'flex: 1', percentages).
   - SAFE AREAS: Prevent content overlap with device notches using <SafeAreaView> or 'useSafeAreaInsets'.
   - NO HOVER STATES: Mobile devices lack a mouse cursor. Convert hover effects to active press states using <Pressable>.

6. TYPESCRIPT STRICTNESS (CRITICAL):
   - The output MUST be valid TypeScript (.tsx).
   - 🚨 STRICT ARCHITECTURAL MIGRATION: Identify ALL libraries or patterns used for 'runtime type checking', 'legacy DOM manipulation', or 'web-specific behavior'. You MUST completely remove their imports and usages. Replace them strictly with TypeScript static typing (interfaces/types).
   - NO implicit 'any'. Infer types intelligently from the original code structure.
   - EXTENSION BAN: Ensure all relative local imports point to the correct file without extensions or with .tsx/.ts.
`;

  // 4. Context & Input Code
  // ... (Keep the rest of the code contextBlock and inputCodeBlock as is)
  const contextBlock = `
-----------------------------------
FILE CONTEXT
-----------------------------------
Original File Path: ${filePath}
Exports to maintain: ${JSON.stringify(fileExports)}
External Web Imports: ${JSON.stringify(fileImports.filter((i) => i.source?.startsWith('.') === false).map((i) => i.source))}

${
  Object.keys(exactImportsMap).length > 0
    ? `
EXACT IMPORTS REMAPPING (CRITICAL):
You MUST replace the following old relative imports with EXACTLY these new strings. DO NOT calculate distances yourself:
${JSON.stringify(exactImportsMap, null, 2)}
`
    : ''
}

${
  Object.keys(pathMap).length > 0
    ? `
PATH REMAPPING:
Update any relative imports matching these keys to the new values:
${JSON.stringify(pathMap, null, 2)}
`
    : ''
}
`;

  const inputCodeBlock = `
-----------------------------------
INPUT WEB CODE
-----------------------------------
${fileContent}
`;

  return `
${roleDefinition}
${strictRulesBlock}
${contextBlock}
${inputCodeBlock}
`.trim();
}
export function buildFixPrompt(code, errors, installedPackages = []) {
  return `
You are a Senior React Native Developer.
The TypeScript compiler has detected logic or type issues in the following code.

-----------------------------------
STRICT ARCHITECTURAL CONSTRAINTS
-----------------------------------
- You are FORBIDDEN to use any external library outside this compiled list: [${installedPackages.join(', ')}].
- Do NOT invent or import new npm packages. If a feature or fix requires a missing package, implement it using standard React Native APIs or a manual polyfill.
- Output MUST be the corrected code only.

-----------------------------------
CODE CONTEXT
-----------------------------------
${code}

-----------------------------------
DETECTED ERRORS
-----------------------------------
${errors.join('\n')}

-----------------------------------
TASK
-----------------------------------
Fix the logic or type errors above. 
- If an import is missing, ensure it exists in the constraints list before adding it. Otherwise, remove the dependency and rewrite the logic natively.
- If a type is mismatched, adjust the interface locally.
- Do NOT simply suppress errors with @ts-ignore unless strictly impossible to resolve.
`;
}
