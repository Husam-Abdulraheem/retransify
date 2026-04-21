// src/core/prompt/promptBuilder.js
import {
  COMMON_DEPENDENCIES,
  LEGACY_TO_EXPO_MAP,
  WEB_ONLY_BLOCKLIST,
} from '../config/libraryRules.js';
import { PathMapper } from '../helpers/pathMapper.js';

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
    navigationSchema = {},
    requiredData = [],
    ragContext = '',
  } = fileContext;

  const isRootLayout = fileContext.targetPath === 'app/_layout.tsx';
  const isIndexFile = fileContext.targetPath === 'app/index.tsx';

  const isGroupLayout = fileContext.targetPath?.match(
    /^app\/\((tabs|drawer)\)\/_layout\.tsx$/
  );

  const providers = globalContext.globalProviders || [];
  const hasProviders = providers.length > 0;
  const globalHeader = globalContext.globalHeader || null;
  const isGlobalHeaderSource =
    !!globalHeader &&
    (globalHeader.source === filePath ||
      globalHeader.source === (fileContext.filePath || filePath));

  let providerWrapperText = '';
  if (isRootLayout && hasProviders) {
    const providerRules = providers
      .map((p) => {
        if (p.source) {
          const mappedProviderPath = pathMap[p.source] || p.source;
          const exactPath = PathMapper.calculateExactRelativePath(
            fileContext.targetPath || 'app/_layout.tsx',
            mappedProviderPath
          );
          const importStatement = p.isDefault
            ? `import ${p.name} from "${exactPath}";`
            : `import { ${p.name} } from "${exactPath}";`;
          return `     - [CRITICAL ARCHITECTURE RULE]: You MUST wrap your <Stack> (or <Slot>) inside <${p.name}>. You MUST import it exactly like this: ${importStatement}`;
        }
        return `     - [CRITICAL ARCHITECTURE RULE]: You MUST wrap your <Stack> inside <${p.name}>.`;
      })
      .join('\n');

    providerWrapperText = `\n${providerRules}`;
  }

  // Centralized Header Logic for Native Mobile Architecture
  let headerWrapperText = '';
  if (isRootLayout && globalHeader) {
    const mappedHeaderPath =
      pathMap[globalHeader.source] || globalHeader.source;
    const exactHeaderPath = PathMapper.calculateExactRelativePath(
      fileContext.targetPath || 'app/_layout.tsx',
      mappedHeaderPath
    );
    const importStatement = globalHeader.isDefault
      ? `import ${globalHeader.name} from "${exactHeaderPath}";`
      : `import { ${globalHeader.name} } from "${exactHeaderPath}";`;

    headerWrapperText = `     - [CRITICAL HEADER RULE]: A global web header was detected. You MUST use it as a Native Custom Header.
     - You MUST import it exactly like this: ${importStatement}
     - You MUST inject it into the Root Stack Navigator (and NOT Tabs/Drawer): <Stack screenOptions={{ header: () => <${globalHeader.name} />, headerShown: true }} />
     - STRICT PROHIBITION: You are FORBIDDEN from setting headerShown:false on the Root Stack when a global header exists.`;
  }

  const facts = globalContext.facts || {};
  const tech = facts.tech || {};

  // 🔥 Fix: Map Web 'Tailwind' to Mobile 'NativeWind'
  let targetStyleSystem = 'StyleSheet'; // Default fallback

  const isTailwindInFile =
    /className\s*=\s*["'`]/.test(fileContent) &&
    (/tailwind/i.test(fileContent) || /['"]tailwindcss['"]/.test(fileContent));

  if (tech.styling === 'Tailwind' || tech.styling === 'NativeWind') {
    targetStyleSystem = 'NativeWind';
  } else if (tech.styling === 'StyleSheet') {
    targetStyleSystem = 'StyleSheet';
  } else if (isTailwindInFile) {
    // Only fallback to NativeWind if we are unsure about styling AND we see strong tailwind signals
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
${
  isGroupLayout
    ? `     - You MUST render the Expo Router <${navigationSchema.type === 'tabs' ? 'Tabs' : 'Drawer'}> component.
     - [NAVIGATION ARCHITECTURE]: Configure these screens as items: ${(navigationSchema.type === 'tabs' ? navigationSchema.tabs : navigationSchema.drawerScreens || []).join(', ')}`
    : `     - You MUST wrap the application and render the Expo Router ${navigationSchema.type === 'tabs' || navigationSchema.type === 'drawer' ? '<Stack>' : '<Stack> or <Slot>'} component.
${providerWrapperText}
${headerWrapperText}`
}
${navigationSchema.modals && navigationSchema.modals.length > 0 && isRootLayout ? `     - [MODALS CONFIGURATION]: The following paths MUST be configured as modals (e.g. options={{ presentation: 'modal' }}): ${navigationSchema.modals.join(', ')}` : ''}
${
  isRootLayout
    ? `     - [CRITICAL SETUP]: You MUST add "import '${PathMapper.calculateExactRelativePath(fileContext.targetPath || 'app/_layout.tsx', 'global.css')}';" at the very top of the file if NativeWind is used.
     - [NATIVEWIND & EXPO-IMAGE INTEROP]: If NativeWind is used, you MUST register 'expo-image' globally in this file to support className by adding:
       import { cssInterop } from 'nativewind';
       import { Image } from 'expo-image';
       cssInterop(Image, { className: 'style' });`
    : ''
}
     - [WEB TO MOBILE LAYOUT PATTERN (CRITICAL)]: In React Native, the Navigator MUST be the root visual element. DO NOT wrap the Navigator inside any UI container or ScrollView.`
    : `   - [CRITICAL SCREEN RULE]: This file is a STANDARD UI SCREEN ('${fileContext.targetPath}').
${
  isIndexFile
    ? `     - [INDEX FILE RULE]: If the source file is just a wrapper (e.g., App.tsx) that imports and renders a main component (like <Home />), DO NOT invent UI. Simply import that component and render it.`
    : ''
}
     - DO NOT import or use <Header> or <Footer>. The Header is handled centrally by the root _layout.tsx file.
     - The Footer MUST BE COMPLETELY IGNORED and removed from this mobile version.
     - SCROLLING: Wrap the main body of this screen in a <ScrollView className="flex-1"> or <View className="flex-1"> depending on content length to prevent clipping.`
}

${
  isGlobalHeaderSource
    ? `
   - [HEADER EXPORT RULE (CRITICAL)]: This file declares the global header component "${globalHeader?.name}".
     - You MUST ensure "${globalHeader?.name}" is exported (add \`export\` to its declaration or \`export { ${globalHeader?.name} }\`).
     - The Root Layout will import this header from this file, so missing export will break the app.`
    : ''
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
   - [IMAGES & DIMENSION COLLAPSE (CRITICAL)]: Convert all HTML <img> tags to the <Image> component imported EXCLUSIVELY from 'expo-image' (import { Image } from 'expo-image';). 
   - 🚨 [CRITICAL DIMENSION RULE]: In React Native, images WITHOUT explicit dimensions will collapse to 0x0 pixels and become INVISIBLE. You MUST always assign explicit width and height via className (e.g., className="w-24 h-24", "w-full aspect-square", or "w-[100px] h-[50px]"). NEVER leave an <Image> without dimensions!
   - You MUST use the '@/' prefix before the mapped path inside a require() call. Example: <Image source={require("@/assets/logo.png")} className="w-16 h-16 content-cover" />.
   - [DYNAMIC LOCAL IMAGES (FATAL ERROR)]: Metro Bundler CANNOT load local images from dynamic string variables. If an image path comes from JSON or a prop (e.g., <img src={item.image} />), replacing it with <Image source={item.image} /> will FAIL SILENTLY. You MUST create a Static Asset Map dictionary inside the file. Example: const assetMap = { "/assets/product1.jpg": require("@/assets/product1.jpg"), "/assets/product2.jpg": require("@/assets/product2.jpg") }; Then use: <Image source={assetMap[item.image]} className="..." />
   - 🚨 METRO STATIC REQUIRE RULE (CRITICAL — WILL CRASH THE APP IF VIOLATED): Metro Bundler is a STATIC bundler. It resolves ALL require() calls at BUILD TIME, NOT at runtime. Therefore, you are STRICTLY FORBIDDEN from placing any dynamic expression inside require(). This includes: variables, function calls, ternary expressions, template literals with variables, or any non-literal value. ILLEGAL examples: require(getImagePath(name)), require(\`@/assets/\${product}.jpg\`), require(condition ? a : b). If the original web code uses a dynamic image-loading function (e.g., getImagePath(type)), you MUST refactor it into a STATIC lookup map where every require() contains a hard-coded string literal. LEGAL pattern: const imageMap = { tablet: require('@/assets/images/product-tablet.jpg'), mobile: require('@/assets/images/product-mobile.jpg') }; then access it as: imageMap[type]. 🚨 To build this map, you MUST extract the actual specific image names from the 'AVAILABLE ASSETS IN REPOSITORY' list at the bottom of the prompt! DO NOT guess or hallucinate names.
   - [NON-CODE ASSETS & DATA IMPORTS (CRITICAL)]: If the original code imports ANY non-code file (e.g., .json, .csv, .mp4, .yaml, .png) using 'import' or 'require()', you MUST understand that the asset migrator has moved it to the 'assets' directory. You MUST strictly use the exact mapped string provided in the 'EXACT IMPORTS REMAPPING' section below, OR use the absolute alias (e.g., require('@/assets/data.json')). DO NOT guess, hardcode, or manually calculate relative paths for non-code files. If you use an absolute alias, verify the exact file name from the 'AVAILABLE ASSETS IN REPOSITORY' list.
   - SCROLLING IS NOT AUTOMATIC: Unlike Web, React Native Views do NOT scroll. You MUST wrap the main body of standard screens in a <ScrollView> or use <FlatList> for lists to prevent overlapping and clipped content.
   - RESPONSIVENESS & WIDTHS: NEVER use fixed large desktop widths (e.g., width: 1000px or w-[1000px]). You MUST convert them to 'w-full', 'flex: 1', or use percentages ('100%') to fit mobile screens.
   - NO CSS GRID: React Native uses Flexbox exclusively. Convert all grid layouts to semantic Flexbox structures (e.g., using 'flexWrap: wrap' and width percentages).
   - FLEX DIRECTION: React Native 'flexDirection' defaults to 'column'. Explicitly handle horizontal alignments.
   - SAFE AREAS: Prevent content overlap with device notches using <SafeAreaView> or 'useSafeAreaInsets'.
   - 🚨 [EXPO ROUTER LINK TYPING (CRITICAL)]: Expo Router uses strictly typed routes. When converting web <Link to="..."> to Expo <Link href="...">, if the path is dynamic, a variable, or involves string interpolation, you MUST cast it to any to prevent TypeScript crashes. Example: <Link href={\`/product/\${id}\` as any} asChild>.

6. TYPESCRIPT STRICTNESS (CRITICAL):
   - The output MUST be valid TypeScript (.tsx).
   - STRICT ARCHITECTURAL MIGRATION: Identify ALL libraries or patterns used for 'runtime type checking', 'legacy DOM manipulation', or 'web-specific behavior'. You MUST completely remove their imports and usages. Replace them strictly with TypeScript static typing (interfaces/types).
   - NO implicit 'any'. Infer types intelligently from the original code structure.
   - EXTENSION BAN: Ensure all relative local imports point to the correct file without extensions or with .tsx/.ts.

7. ENVIRONMENT VARIABLES (CRITICAL):
   - The original project's environment variables (e.g. REACT_APP_*, VITE_*, NEXT_PUBLIC_*) have been migrated to the Expo standard prefix: 'EXPO_PUBLIC_'.
   - You MUST replace any usage of 'process.env.REACT_APP_XYZ' or 'import.meta.env.VITE_XYZ' with 'process.env.EXPO_PUBLIC_XYZ'.
   - NEVER use 'import.meta.env' in React Native, it will crash the app. Always use 'process.env.EXPO_PUBLIC_*'.

8. CODE FORMATTING & LEGIBILITY (CRITICAL FOR PARSERS):
   - You MUST format the output code legibly with proper newlines and indentation.
   - DO NOT minify the code under any circumstances, even for short files.
   - You MUST ensure quotes and string templates are perfectly valid to prevent JSON parsing failures.

${
  requiredData.length > 0
    ? `9. DATA DEPENDENCY & PROP INJECTION (CRITICAL):
${requiredData
  .map((data) => {
    const newTargetPath = pathMap[data.originalSource] || data.originalSource;
    const exactPath = PathMapper.calculateExactRelativePath(
      fileContext.targetPath || filePath,
      newTargetPath
    );
    return `   - In the original web code, this component received '${data.propName}' as a prop. In Expo Router, screens do NOT receive props. You MUST import it directly: 'import ${data.propName} from "${exactPath}";' and use it as a replacement for 'props.${data.propName}'.`;
  })
  .join('\n')}`
    : ''
}
`;

  // Extract all assets for fuzzy matching
  const assetExtensions = [
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.svg',
    '.webp',
    '.json',
    '.csv',
    '.mp4',
    '.pdf',
    '.yaml',
    '.txt',
  ];
  const availableAssets = [
    ...new Set(
      Object.values(pathMap).filter(
        (p) =>
          typeof p === 'string' &&
          assetExtensions.some((ext) => p.toLowerCase().endsWith(ext))
      )
    ),
  ];

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
  availableAssets.length > 0
    ? `
AVAILABLE ASSETS IN REPOSITORY (CRITICAL FOR DYNAMIC MAPPING):
When creating static lookup maps for dynamic images or importing data files, you MUST pick the exact file path exclusively from this list. DO NOT hallucinate or guess file names (e.g., missing suffixes like '-headphones'):
${JSON.stringify(availableAssets, null, 2)}
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

// 🚨 التعديل الجذري: حقن سياق المشروع المفقود 🚨
${
  ragContext
    ? `
### PROJECT CONTEXT (RAG DATABASE) ###
The following are interfaces, types, and hooks from other files in the project. 
Use this context to understand how to call external functions and pass correct props:
${ragContext}

[TYPESCRIPT INTERFACES]: DO NOT redefine global interfaces (like CartItem, Product, User, etc.) if they already exist above in this PROJECT CONTEXT. Assume they are available globally or import them from a shared types file (e.g., '../types'). Avoid duplicate interface declarations at all costs.
######################################
`
    : ''
}
${contextBlock}
${inputCodeBlock}
`.trim();
}

export function buildFixPrompt(
  code,
  errors,
  installedPackages = [],
  state = {},
  exactImportsMap = {}
) {
  const facts = state.facts || {};
  const tech = facts.tech || {};

  const filePath =
    state.currentFile?.relativeToProject || state.currentFile?.filePath || '';
  const targetPath = state.pathMap?.[filePath] || filePath;
  const isLayoutFile = targetPath.endsWith('_layout.tsx');

  const isNativeWind =
    tech.styling === 'NativeWind' ||
    tech.styling === 'Tailwind' ||
    (installedPackages || []).includes('nativewind') ||
    /className\s*=/.test(code) ||
    /from ['"]nativewind['"]/.test(code);

  const importsBlock =
    exactImportsMap && Object.keys(exactImportsMap).length > 0
      ? `\n[EXACT IMPORTS REMAPPING]:\nYou MUST use these exact paths for your imports:\n${Object.entries(
          exactImportsMap
        )
          .map(
            ([oldImport, newPath]) =>
              `- Replace import from '${oldImport}' WITH '${newPath}'`
          )
          .join('\n')}\n`
      : '';

  return `
You are a Senior React Native Developer & TypeScript Expert.
The Verifier tool (AST Analyzer & Typescript) has detected structural, architectural, or logic errors in the following Expo React Native code.

${importsBlock}
-----------------------------------
STRICT HEALING PRINCIPLES & CONSTRAINTS
-----------------------------------
1. SCOPE ISOLATION (CRITICAL): You can ONLY modify the code provided in this file. You CANNOT modify external files, imported components, or global interfaces.
2. COMPONENT ADAPTATION: If the error involves a mismatch between passed props and an imported component's signature, you MUST modify the JSX in THIS file to conform to the component by stripping out unrecognized props.
3. WEB DOM LEAKAGE & EXPO COMPLIANCE (CRITICAL): If the error complains about unsupported Web DOM elements (e.g., 'div', 'span', 'img') or React Router dead links, you MUST replace them with React Native/Expo Router equivalents. This project uses Expo Router v3+, so ALWAYS use 'expo-router' components (<Link href="/...">, <Stack>, <Tabs>) and hooks ('useLocalSearchParams', 'useRouter').
${isNativeWind ? "4. STYLING: This project uses NativeWind. Do NOT remove 'className' properties. DO NOT use StyleSheet.create." : "4. STYLING: This project uses standard StyleSheet. Do NOT use 'className'."}
${isLayoutFile ? '5. LAYOUT ARCHITECTURE (CRITICAL): This is an Expo Router layout file. The Navigator (<Stack> or <Tabs> or <Slot>) MUST be the root visual component. Do NOT wrap Navigation elements in <View> or <ScrollView>.' : '5. SCREEN COMPLIANCE: Direct rendering constraint applies. Ensure you use standard native scrolling elements like <ScrollView> where appropriate.'}
6. DEPENDENCY RESTRICTION: You are FORBIDDEN to use any external library outside this compiled list: [${installedPackages.join(', ')}]. If a fix requires a missing package, implement it using standard React Native APIs.
7. NO SUPPRESSION: Do NOT use @ts-ignore or 'any' assertions to bypass errors. You must structurally fix the logic.
8. CODE FORMATTING: You MUST format output code legibly with proper newlines. DO NOT minify.
9. OUTPUT FORMAT: Output MUST be the completely corrected code only. DO NOT output partial code snippets.

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
Ensure the resulting code is pretty-printed, indented, and NOT on a single line.
`;
}
