// src/core/prompt/promptBuilder.js
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
    isLayoutFile = false,
  } = fileContext;

  const facts = globalContext.facts || {};
  const tech = facts.tech || {};

  // 1. Infer Tech Stack
  const isTailwindDetected =
    /className\s*=\s*["'`]/.test(fileContent) ||
    /['"]tailwindcss['"]/.test(fileContent);

  // 🔥 Fix: Map Web 'Tailwind' to Mobile 'NativeWind'
  let targetStyleSystem = 'StyleSheet'; // Default fallback

  if (
    tech.styling === 'Tailwind' ||
    tech.styling === 'NativeWind' ||
    isTailwindDetected
  ) {
    targetStyleSystem = 'NativeWind';
  }

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
1. TARGET FRAMEWORK (WEB TO NATIVE MAPPING):
   - DOM ABSTRACTION: Completely eliminate ALL HTML/DOM elements. Map them to their semantic React Native primitives.

2. STYLING SYSTEM: **${targetStyleSystem}**
${
  isNativeWind
    ? `   - [CRITICAL STYLING RULE]: You MUST use the 'className' prop with Tailwind classes (NativeWind v4 is pre-configured).
   - STRICT PROHIBITION: You are FORBIDDEN from using 'StyleSheet.create({...})'. Do NOT output any StyleSheet objects.
   - Translate ALL standard CSS and inline styles to equivalent Tailwind utility classes.
   - Example: Replace <View style={styles.container}> with <View className="flex-1 items-center justify-center bg-white">.`
    : `   - You MUST use 'StyleSheet.create({...})'.
   - STRICT PROHIBITION: DO NOT use the 'className' prop. Translate any existing Tailwind classes to standard StyleSheet objects.`
}

3. ROUTING & NAVIGATION (CRITICAL):
${
  hasRouting
    ? `   - The target project uses **Expo Router** (File-based routing).
   - ROUTING ABSTRACTION: Identify ANY web-based routing library used and remove its imports.
${
  (fileContext.targetPath || '').includes('[') &&
  (fileContext.targetPath || '').includes(']')
    ? `   - [DYNAMIC ROUTING RULE EXTREMELY CRITICAL]: The target file name has brackets indicating a dynamic route ('${fileContext.targetPath}'). You MUST completely eliminate React Router's 'match.params', 'useParams', or 'useRouteMatch'. You MUST replace them with absolute generic hook call: 'const { ... } = useLocalSearchParams();' imported exclusively from 'expo-router'.`
    : ''
}`
    : '   - No specific routing library detected. Use standard React state for conditional rendering if needed.'
}
${
  isLayoutFile
    ? `   - [CRITICAL LAYOUT RULE]: This file is a ROUTER LAYOUT ('${fileContext.targetPath}').
     - You MUST wrap the application and render the Expo Router <Slot /> component.
     - [CRITICAL SETUP]: You MUST add "import '../global.css';" at the very top of the file if NativeWind is used.
     - DO NOT output standard UI screen content here. This is ONLY for structural wrappers and Providers.`
    : `   - [CRITICAL SCREEN RULE]: This file is a STANDARD UI SCREEN ('${fileContext.targetPath}').
     - STRICT PROHIBITION: You are FORBIDDEN from using the <Slot /> component.
     - DO NOT abstract the UI away into a Context Provider that returns a <Slot />.
     - You MUST directly render the actual visual React Native components (Views, Text, FlatList, Input) inside the main export.`
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

5. MOBILE UI/UX & LAYOUT ADAPTATION (CRITICAL - FIXES OVERLAPPING & OVERFLOW):
   - SCROLLING IS NOT AUTOMATIC: Unlike Web, React Native Views do NOT scroll. You MUST wrap the main body of standard screens in a <ScrollView> or use <FlatList> for lists to prevent overlapping and clipped content.
   - RESPONSIVENESS & WIDTHS: NEVER use fixed large desktop widths (e.g., width: 1000px or w-[1000px]). You MUST convert them to 'w-full', 'flex: 1', or use percentages ('100%') to fit mobile screens.
   - NO CSS GRID: React Native uses Flexbox exclusively. Convert all grid layouts to semantic Flexbox structures (e.g., using 'flexWrap: wrap' and width percentages).
   - FLEX DIRECTION: React Native 'flexDirection' defaults to 'column'. Explicitly handle horizontal alignments.
   - SAFE AREAS: Prevent content overlap with device notches using <SafeAreaView> or 'useSafeAreaInsets'.

6. TYPESCRIPT STRICTNESS (CRITICAL):
   - The output MUST be valid TypeScript (.tsx).
   - STRICT ARCHITECTURAL MIGRATION: Identify ALL libraries or patterns used for 'runtime type checking', 'legacy DOM manipulation', or 'web-specific behavior'. You MUST completely remove their imports and usages. Replace them strictly with TypeScript static typing (interfaces/types).
   - NO implicit 'any'. Infer types intelligently from the original code structure.
   - EXTENSION BAN: Ensure all relative local imports point to the correct file without extensions or with .tsx/.ts.
`;

  // 4. Context & Input Code
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

export function buildFixPrompt(
  code,
  errors,
  installedPackages = [],
  state = {}
) {
  const facts = state.facts || {};
  const tech = facts.tech || {};

  const isNativeWind =
    tech.styling === 'NativeWind' ||
    tech.styling === 'Tailwind' ||
    (installedPackages || []).includes('nativewind') ||
    /className\s*=/.test(code) ||
    /from ['"]nativewind['"]/.test(code);

  return `
You are a Senior React Native Developer & TypeScript Expert.
The TypeScript compiler has detected logic or type issues in the following code.

-----------------------------------
STRICT HEALING PRINCIPLES & CONSTRAINTS
-----------------------------------
1. SCOPE ISOLATION (CRITICAL): You can ONLY modify the code provided in this file. You CANNOT modify external files, imported components, or global interfaces.
2. COMPONENT ADAPTATION: If the error involves a mismatch between passed props and an imported component's signature (e.g., TS2322, TS2769, TS2339), you MUST modify the JSX in THIS file to conform to the component. Strip out unrecognized props, rename them, or coerce the types locally.
3. WEB DOM LEAKAGE: If the error complains about missing web types (e.g., 'window', 'HTMLInputElement', 'div', 'onClick'${!isNativeWind ? ", 'className'" : ''}), you MUST completely remove them or replace them with their React Native/Expo equivalents.
${isNativeWind ? "4. STYLING: This project uses NativeWind. Do NOT remove 'className' properties. If there are type errors regarding 'className', ignore them or fix them without removing the property. DO NOT use StyleSheet.create." : "4. STYLING: This project uses standard StyleSheet. Do NOT use 'className'."}
5. DEPENDENCY RESTRICTION: You are FORBIDDEN to use any external library outside this compiled list: [${installedPackages.join(', ')}]. If a fix requires a missing package, implement it using standard React Native APIs.
6. NO SUPPRESSION: Do NOT use @ts-ignore or 'any' assertions to bypass errors. You must structurally fix the logic.
7. OUTPUT FORMAT: Output MUST be the corrected code only.

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
Analyze the errors and rewrite the code to be 100% valid TypeScript for React Native. Adapt the current file's logic to resolve the boundaries without assuming external changes.
`;
}
