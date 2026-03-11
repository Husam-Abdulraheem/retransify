// src/core/graph/nodes/dependencyResolverNode.js
import {
  CONFLICT_MAP,
  WEB_ONLY_BLOCKLIST,
  COMMON_DEPENDENCIES,
} from '../../config/libraryRules.js';
import { runSilentCommand } from '../../helpers/shell.js';

/**
 * DependencyResolverNode - Scans imports of the current file and checks library compatibility
 *
 * Inputs from state:
 * - state.currentFile: Current file object (must contain imports)
 * - state.installedPackages: Currently installed packages
 * - state.facts.tech: Tech stack information
 *
 * Outputs to state:
 * - state.currentFile: Updated with resolved dependencies info (resolvedDeps)
 *
 * @param {import('../state.js').GraphState} state
 * @param {{ fastModel: Session }} models
 * @returns {Partial<import('../state.js').GraphState>}
 */
export async function dependencyResolverNode(state, models = {}) {
  const { currentFile, installedPackages = [] } = state;

  if (!currentFile) {
    console.warn('⚠️  [DependencyResolverNode] No current file found');
    return {};
  }

  const filePath = currentFile.relativeToProject || currentFile.filePath;
  console.log(
    `\n🔍 [DependencyResolverNode] Checking dependencies: ${filePath}`
  );

  const imports = currentFile.imports || [];
  const installedSet = new Set(installedPackages);

  const resolvedDeps = {
    safe: [], // Safe libraries to use
    replaced: [], // Libraries replaced with RN alternative
    blocked: [], // Blocked libraries (Web Only)
    unknown: [], // Unknown libraries needing inspection
    stubs: [], // Libraries needing Stub instead of installation
  };

  for (const imp of imports) {
    const source = imp.source || imp;

    // Ignore relative imports (local files)
    if (source.startsWith('.') || source.startsWith('/')) continue;

    // Ignore core packages (react, react-native, etc.)
    if (isCorePkg(source)) continue;

    // ── 1. Check blocked list (Web Only) ──────────────────────────
    if (isWebOnly(source)) {
      console.log(`🛡️  [DependencyResolverNode] Blocked (Web Only): ${source}`);
      resolvedDeps.blocked.push(source);
      continue;
    }

    // ── 2. Check conflicts map (CONFLICT_MAP) ─────────────────────
    const replacement = findReplacement(source);
    if (replacement !== undefined) {
      if (replacement === null) {
        resolvedDeps.blocked.push(source);
      } else {
        resolvedDeps.replaced.push({ original: source, replacement });
        console.log(
          `🔄 [DependencyResolverNode] Replacing: ${source} -> ${replacement}`
        );
      }
      continue;
    }

    // ── 3. Check if library is already installed ──────────────────
    if (installedSet.has(source)) {
      resolvedDeps.safe.push(source);
      continue;
    }

    // ── 4. Check if known Expo/RN library ────────────────────────
    if (isKnownExpoOrRN(source)) {
      resolvedDeps.safe.push(source);
      continue;
    }

    // ── 5. Unknown libraries: use fastModel to suggest alternative ──
    console.log(`❓ [DependencyResolverNode] Unknown library: ${source}`);

    if (models.fastModel) {
      const suggestion = await suggestAlternative(source, models.fastModel);

      if (suggestion.action === 'use_expo') {
        resolvedDeps.replaced.push({
          original: source,
          replacement: suggestion.package,
        });
        console.log(
          `💡 [DependencyResolverNode] AI Suggestion: ${source} -> ${suggestion.package}`
        );
      } else if (suggestion.action === 'stub') {
        resolvedDeps.stubs.push(source);
        console.log(
          `🔧 [DependencyResolverNode] Will create Stub for: ${source}`
        );
      } else {
        // Check if package exists in npm
        const exists = await checkNpmPackage(source);
        if (exists) {
          resolvedDeps.safe.push(source);
        } else {
          resolvedDeps.stubs.push(source);
          console.warn(
            `⚠️  [DependencyResolverNode] Package not found in npm: ${source}`
          );
        }
      }
    } else {
      // Without AI, class as unknown for manual review
      resolvedDeps.unknown.push(source);
    }
  }

  // Add resolved dependencies info to current file
  const updatedFile = {
    ...currentFile,
    resolvedDeps,
  };

  console.log(
    `✅ [DependencyResolverNode] Safe: ${resolvedDeps.safe.length} | Replaced: ${resolvedDeps.replaced.length} | Blocked: ${resolvedDeps.blocked.length}`
  );

  return {
    currentFile: updatedFile,
  };
}

// ── Helper Functions ─────────────────────────────────────────────────────────

function isCorePkg(source) {
  const corePkgs = ['react', 'react-native', 'react-dom', 'expo'];
  return corePkgs.some((p) => source === p || source.startsWith(`${p}/`));
}

function isWebOnly(source) {
  return WEB_ONLY_BLOCKLIST.some(
    (blocked) => source === blocked || source.startsWith(`${blocked}/`)
  );
}

function findReplacement(source) {
  // Direct check
  if (Object.prototype.hasOwnProperty.call(CONFLICT_MAP, source)) {
    return CONFLICT_MAP[source];
  }
  // Scope check (scoped packages)
  const scope = source.startsWith('@')
    ? source.split('/')[0] + '/' + source.split('/')[1]
    : null;
  if (scope && Object.prototype.hasOwnProperty.call(CONFLICT_MAP, scope)) {
    return CONFLICT_MAP[scope];
  }
  return undefined;
}

function isKnownExpoOrRN(source) {
  return (
    source.startsWith('expo-') ||
    source.startsWith('@expo/') ||
    source.startsWith('react-native-') ||
    source.startsWith('@react-navigation/') ||
    COMMON_DEPENDENCIES.includes(source)
  );
}

/**
 * Asks fastModel for a suitable alternative for a web library
 */
async function suggestAlternative(packageName, fastModel) {
  const prompt = `You are a React Native expert. A web package "${packageName}" needs a React Native/Expo alternative.
Respond with JSON only:
{
  "action": "use_expo" | "stub" | "keep",
  "package": "expo-package-name or null",
  "reason": "brief reason"
}
If there's a good Expo/RN alternative, use "use_expo".
If no alternative exists and it's UI-only, use "stub".
If it works in RN already, use "keep".`;

  try {
    const response = await fastModel.sendMessage(prompt);
    const parsed = JSON.parse(response);
    return parsed;
  } catch {
    return { action: 'keep', package: null };
  }
}

/**
 * Checks if the package exists in npm
 */
async function checkNpmPackage(packageName) {
  try {
    runSilentCommand(`npm view ${packageName} name`, process.cwd(), null);
    return true;
  } catch {
    return false;
  }
}
