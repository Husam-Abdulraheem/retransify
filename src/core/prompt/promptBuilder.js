import { COMMON_DEPENDENCIES } from '../constants/commonDependencies.js';

/**
 * يبني prompt ذكي ومرن يعتمد على السياق بدلاً من التعليمات الصارمة
 */
export function buildPrompt(fileContext) {
  const {
    filePath,
    fileContent,
    fileImports,
    fileExports,
    // نستخدم المعلومات المتصلة فقط بدلاً من الهيكل الكامل
    relevantDependencies = [], // (يمكن استخلاصها من dependencyGraph)
    globalContext = {
      techStack: "React Native CLI", // أو Expo
      styleSystem: "StyleSheet", // أو Tailwind/NativeWind/Tamagui
      stateManagement: "Context API",
      navigationStrategy: "React Navigation"
    },
    pathMap,
    installedPackages = [] // [NEW] List of already installed packages
  } = fileContext;

  // 0. Dynamic Logic: Style System Detection
  // Check if the source code uses Tailwind CSS classes (className)
  const isTailwindDetected = /className\s*=\s*["'`]/.test(fileContent) || /['"]tailwindcss['"]/.test(fileContent);
  const detectedStyleSystem = isTailwindDetected ? "NativeWind" : "StyleSheet";
  
  // Override global context style system for this specific file
  const styleSystem = detectedStyleSystem; 
  
  // 1. تحديد شخصية الموديل بناءً على التكنولوجيا المستهدفة
  const roleDefinition = `
You are a Senior Mobile Architect specializing in migrating legacy Web React code to modern ${globalContext.techStack}.
Your goal is to produce production-ready, idiomatic React Native code that preserves the original business logic but adapts the UI/UX for mobile paradigms.

STYLING STRATEGY:
- Source uses ${isTailwindDetected ? "Tailwind CSS" : "Standard CSS"}.
- Target MUST use **${styleSystem}**.
${isTailwindDetected ? "  - Use 'className' prop with Tailwind classes.\n  - You MUST add 'nativewind' and 'tailwindcss' to the dependencies list." : "  - Use 'StyleSheet.create({...})'."}
`;

  // 2. إعداد تفضيلات التكوين (ديناميكية)
  const techStackConfig = `
TARGET ARCHITECTURE:
- Framework: ${globalContext.techStack}
- Styling: ${styleSystem}
- Navigation: ${globalContext.navigationStrategy}
- Icons/Assets: Adapt standard web assets to React Native equivalents (e.g., react-native-vector-icons or svgs).
  `;

  // 3. أدوات متوفرة (لإجبار الموديل على استخدامها)
  // 3. أدوات متوفرة (لإجبار الموديل على استخدامها)
  // Merge context-provided installed packages with our forced common dependencies
  const allInstalledPackages = [...new Set([...COMMON_DEPENDENCIES, ...installedPackages])];

  const availableTools = `
-----------------------------------
MANDATORY TECHNOLOGY STACK & LIBRARIES
-----------------------------------
The following libraries are PRE-INSTALLED and MUST be used. 
Do NOT suggest alternative libraries for these functionalities (e.g., do not use 'react-router-dom', use 'expo-router'; do not use 'AsyncStorage' from react-native, use '@react-native-async-storage/async-storage').

PRE-INSTALLED LIBRARIES:
${JSON.stringify(allInstalledPackages, null, 2)}

STRICT RULES FOR NEW DEPENDENCIES:
1. IF you need a library NOT in the list above, you MUST verify it is compatible with EXPO and React Native.
2. DO NOT suggest libraries that perform the exact same function as a pre-installed one (e.g. don't add a new SVG library if react-native-svg is present).
3. DO NOT add 'react-native-web' or 'react-dom' - we are targeting Native Mobile.
`;

  return `
${roleDefinition}

${techStackConfig}

${availableTools}

-----------------------------------
INPUT FILE CONTEXT
-----------------------------------
File Path: src/${filePath}
Type: ${filePath.endsWith('tsx') || filePath.endsWith('ts') ? 'TypeScript' : 'JavaScript'}
Exports: ${JSON.stringify(fileExports)}
External Imports: ${JSON.stringify(fileImports.filter(i => i.source?.startsWith('.') === false))}
-----------------------------------
SMART PATH MAPPING (File System Reorganization)
-----------------------------------
${pathMap ? "The project structure has changed. If you encounter relative imports matching these keys, rewrite them to the new values:" : ""}
${pathMap ? JSON.stringify(pathMap, null, 2) : "No path changes needed."}

-----------------------------------
ORIGINAL WEB CODE
-----------------------------------
${fileContent}

-----------------------------------
MIGRATION GUIDELINES (DO NOT MICROMANAGE, USE BEST PRACTICES)
-----------------------------------
1. **Semantic Translation**: Do not just do a 1:1 syntax swap. Understand the *intent* of the web DOM.
   - Example: A generic <div> might be a <View>, but a clickable <div> is likely a <Pressable> or <TouchableOpacity>.
   - Example: A <ul>/<li> list should likely be a <FlatList> if data is dynamic.

2. **Platform Adaptation**:
   - Handle 'safe areas' appropriately for modern devices.
   - Replace web-specific APIs (window, document, localStorage) with React Native equivalents (Dimensions, Alert, AsyncStorage) ONLY where necessary to preserve logic.

3. **Styling & Layout**:
   - Translate CSS/ClassName logic to the target style system (${styleSystem}).
   - Ensure all layout uses Flexbox concepts properly (React Native defaults to flex-direction: column).

4. **Logic Preservation**:
   - Keep Hooks (useState, useEffect) and Custom Hooks intact unless they strictly rely on DOM APIs.
   - If a library is web-only (e.g., react-dom), replace it with a suitable native alternative or mock it if strictly visual.

5. **Dependencies**:
   - You have freedom to choose standard community libraries (e.g., 'react-native-svg' for SVGs, 'expo-linear-gradient').
   - LIST any new dependencies you introduce in the JSON response.

-----------------------------------
RESPONSE FORMAT (STRICT JSON)
-----------------------------------
You MUST respond with a raw valid JSON object only.
DO NOT use markdown code blocks.
DO NOT include any text before or after the JSON.
{
  "code": "The complete converted React Native code (string)",
  "dependencies": ["package-name-1", "package-name-2"],
  "notes": "Short explanation of major architectural decisions (optional)"
}
`;
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
