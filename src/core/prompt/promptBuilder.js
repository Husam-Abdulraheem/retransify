// src/core/prompts/promptBuilder.js

import {
  COMMON_DEPENDENCIES,
  LEGACY_TO_EXPO_MAP,
  WEB_ONLY_BLOCKLIST
} from '../config/libraryRules.js'; // استيراد القواعد التي بنيناها

/**
 * يبني prompt ذكي ومرن يعتمد على السياق
 */
export function buildPrompt(fileContext) {
  const {
    filePath,
    content: fileContent,
    analysis = {},
    techContext = {},
    pathMap = {}
  } = fileContext;

  const { imports: fileImports = [], exports: fileExports = [] } = analysis;
  const tech = techContext.tech || {};

  // 1. استنتاج بيئة العمل (Tech Stack)
  const isTailwindDetected = /className\s*=\s*["'`]/.test(fileContent) || /['"]tailwindcss['"]/.test(fileContent);
  const targetStyleSystem = tech.styling || (isTailwindDetected ? "NativeWind" : "StyleSheet");
  const isNativeWind = targetStyleSystem === "NativeWind";
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
${fileContext.isMainEntry ? `[CRITICAL - MAIN ENTRY POINT]
This is the core App component. You MUST output a standard React Native component to serve as the 'app/index.tsx' screen for Expo Router.
❌ STRICT PROHIBITION: DO NOT use 'registerRootComponent', 'ReactDOM.render', or 'createRoot'. Expo Router handles mounting automatically.
` : ''}
1. TARGET FRAMEWORK: React Native with Expo SDK (Managed Workflow).
   - DO NOT use standard DOM elements (div, span, p, h1, etc.). Use View, Text, Pressable, ScrollView, etc.
   - DO NOT use 'window', 'document', or 'localStorage'. Use React Native APIs or AsyncStorage.

2. STYLING SYSTEM: **${targetStyleSystem}**
${isNativeWind
      ? "   - You MUST use the 'className' prop with Tailwind classes (NativeWind is pre-configured).\n   - Translate standard CSS/inline styles to Tailwind classes where possible."
      : "   - You MUST use 'StyleSheet.create({...})'.\n   - DO NOT use 'className'. Translate any existing Tailwind classes to standard StyleSheet objects."}

3. ROUTING & NAVIGATION (CRITICAL):
${hasRouting
      ? `   - The target project uses **Expo Router** (File-based routing).
   - DO NOT import from 'react-router-dom' or '@react-navigation/...'.
   - Translate web links (<Link to="..."> or useNavigate) to Expo Router equivalents (import { Link, router } from 'expo-router').
   - If this file represents a global provider (like Redux or Theme), structure it so it can be used inside an Expo Router '_layout.tsx' file (export a component that wraps <Slot />).`
      : "   - No specific routing library detected. Use standard React state for conditional rendering if needed."}

4. DEPENDENCIES & LIBRARIES MAP:
   - Base Expo Libraries (Pre-installed, DO NOT add to dependencies output): ${COMMON_DEPENDENCIES.join(', ')}
   - You MUST strictly follow this library translation map (Web -> Mobile):
     ${JSON.stringify(LEGACY_TO_EXPO_MAP, null, 2)}
   - FORBIDDEN LIBRARIES (Do NOT use or import these):
     ${WEB_ONLY_BLOCKLIST.join(', ')}
   - ICONS: Use '@expo/vector-icons' exclusively.
   - 🚨 STRICT NEW DEPENDENCY RULE: Any new library you introduce MUST be 100% compatible with Expo Managed Workflow. DO NOT suggest libraries that require custom native linking, modifying android/ios directories, or running 'pod install'.

5. MOBILE UI/UX & LAYOUT ADAPTATION (CRITICAL):
   - NO CSS GRID: React Native uses Flexbox exclusively. Convert all CSS Grids to Flexbox layouts.
   - FLEX DIRECTION: Remember that React Native 'flexDirection' defaults to 'column' (vertical), unlike the web's 'row'. Add 'flex-row' explicitly where horizontal alignment is needed.
   - RESPONSIVENESS: The design MUST look good on mobile screens. Replace fixed desktop widths (like 'w-[1200px]') with 'w-full', 'flex: 1', or percentages.
   - SAFE AREAS: Wrap root screens with <SafeAreaView> (from 'react-native') or use 'useSafeAreaInsets' (from 'react-native-safe-area-context') to prevent content from hiding under the device notch or status bar.
   - NO HOVER STATES: Mobile devices do not have a mouse. Remove all CSS ':hover' states. Use <Pressable> or <TouchableOpacity> for clickable items.
`;

  // 4. Context & Input Code
  const contextBlock = `
-----------------------------------
FILE CONTEXT
-----------------------------------
Original File Path: ${filePath}
Exports to maintain: ${JSON.stringify(fileExports)}
External Web Imports: ${JSON.stringify(fileImports.filter(i => i.source?.startsWith('.') === false).map(i => i.source))}

${Object.keys(pathMap).length > 0 ? `
PATH REMAPPING:
Update any relative imports matching these keys to the new values:
${JSON.stringify(pathMap, null, 2)}
` : ""}
`;

  const inputCodeBlock = `
-----------------------------------
INPUT WEB CODE
-----------------------------------
${fileContent}
`;

  // 5. Output Format
  const responseFormat = `
-----------------------------------
OUTPUT FORMAT
-----------------------------------
Respond ONLY with a raw, valid JSON object. No markdown formatting (like \`\`\`json). No conversational text.

{
  "decision_trace": [
    { "category": "Tag Mapping", "action": "Mapped div to View", "reasoning": "Standard container" }
  ],
  "code": "The complete, fully converted React Native code string. MUST be ready to run.",
  "dependencies": ["nativewind", "axios"], // Only list NEW mobile-compatible libraries needed for this specific file. Do not list pre-installed Expo ones.
  "notes": "Brief explanation of architectural changes."
}
`;

  return `
${roleDefinition}
${strictRulesBlock}
${contextBlock}
${inputCodeBlock}
${responseFormat}
`.trim();
}
export function buildFixPrompt(code, errors) {
  return `
You are a Senior React Native Developer.
The TypeScript compiler has detected issues in the following code.

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
Fix the logic or type errors. 
- If an import is missing, add it.
- If a type is mismatched, adjust the interface.
- Do NOT simply suppress errors with @ts-ignore unless strictly impossible to resolve.

Return ONLY the raw valid JSON structure.
DO NOT use markdown code blocks.
{
  "code": "Fixed code string",
  "dependencies": [] 
}
`;
}
