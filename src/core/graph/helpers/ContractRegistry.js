// src/core/graph/helpers/ContractRegistry.js
import { normalizePath } from '../../utils/pathUtils.js';

// ── JSDoc Type Definitions ───────────────────────────────────────────────────

/**
 * @typedef {Object} ParameterContract
 * @property {string} name
 *   The parameter's display name. For destructured object params this will be
 *   the synthetic form `{ key1, key2 }` so prompt text is immediately readable.
 * @property {string} type
 *   The full TypeScript type text as extracted by ts-morph (e.g. `string`,
 *   `CartItem`, `{ productId: string; quantity: number }`).
 * @property {boolean} isDestructured
 *   True when the parameter is an object-destructuring pattern.
 * @property {string[]} destructuredKeys
 *   Ordered list of the destructured property names (empty when !isDestructured).
 * @property {boolean} isOptional
 *   True when the parameter is marked optional (`?`) or has a default value.
 * @property {string|null} defaultValue
 *   Source-text of the parameter initializer, or null when absent.
 */

/**
 * @typedef {Object} FunctionContract
 * @property {string} name       Export name (or `'default'` for default exports).
 * @property {'function'|'arrow'|'class'} kind
 * @property {ParameterContract[]} parameters  Ordered list of parameter contracts.
 * @property {string} returnType Full return-type text.
 * @property {boolean} isDefault True when this is the file's default export.
 */

// ── ContractRegistry ─────────────────────────────────────────────────────────

/**
 * ContractRegistry — Stores machine-readable, structured function/hook
 * signatures for cross-file contract validation.
 *
 * Unlike ContextStore (which stores lossy text summaries), this registry stores
 * the *structural* data extracted by ts-morph: parameter counts, names, whether
 * a param is destructured, what keys it expects, and the full return type.
 *
 * Storage: normalized filePath → Map<exportName, FunctionContract>
 *
 * The registry is populated once during AnalyzerNode and updated after each
 * file is converted by ContextUpdaterNode so every downstream node always sees
 * the most recent (post-conversion) contract for each file.
 */
export class ContractRegistry {
  constructor() {
    /**
     * Outer key: project-relative file path (normalized, forward-slashes).
     * Inner key: export name string (e.g. 'useCart', 'default').
     * @type {Map<string, Map<string, FunctionContract>>}
     */
    this._registry = new Map();
  }

  // ── Write ──────────────────────────────────────────────────────────────────

  /**
   * Register (or fully replace) all exported function contracts for a file.
   *
   * Passing an empty array effectively clears the file's contracts, which is
   * useful when a file is deleted or re-processed.
   *
   * @param {string} filePath - Project-relative path (will be normalized)
   * @param {FunctionContract[]} contracts
   */
  registerFile(filePath, contracts) {
    const key = normalizePath(filePath);
    const fileMap = new Map();
    for (const contract of contracts) {
      fileMap.set(contract.name, contract);
    }
    this._registry.set(key, fileMap);
  }

  /**
   * Remove all contracts for a specific file (used by contextUpdaterNode before
   * re-registering the post-conversion signature so stale data never lingers).
   *
   * @param {string} filePath
   */
  deleteFile(filePath) {
    this._registry.delete(normalizePath(filePath));
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  /**
   * Retrieve a single function's contract by file + export name.
   *
   * @param {string} filePath
   * @param {string} exportName
   * @returns {FunctionContract|null}
   */
  getContract(filePath, exportName) {
    const fileMap = this._registry.get(normalizePath(filePath));
    return fileMap?.get(exportName) ?? null;
  }

  /**
   * Retrieve all contracts registered for a file.
   *
   * @param {string} filePath
   * @returns {FunctionContract[]}
   */
  getFileContracts(filePath) {
    const fileMap = this._registry.get(normalizePath(filePath));
    return fileMap ? Array.from(fileMap.values()) : [];
  }

  /**
   * Returns the number of files currently tracked.
   * @returns {number}
   */
  get size() {
    return this._registry.size;
  }

  // ── Serialization ──────────────────────────────────────────────────────────

  /**
   * Serialize contracts for a set of imported files into a precise,
   * prompt-friendly string.
   *
   * The output format is intentionally explicit so an LLM can unambiguously
   * determine:
   *   - How many arguments a function expects
   *   - Whether an argument is a single object or individual primitives
   *   - The exact property keys expected inside a destructured object param
   *
   * Example output:
   * ```
   * --- src/hooks/useCart.js (EXACT SIGNATURES) ---
   * export function useCart({ productId, quantity }: { productId: string; quantity: number }): CartState
   *
   * --- src/context/AuthContext.js (EXACT SIGNATURES) ---
   * export function useAuth(): { user: User | null; login: (email: string, password: string) => void; logout: () => void }
   * ```
   *
   * @param {string[]} filePaths - Project-relative paths to serialize
   * @returns {string} Empty string when no contracts are found for any path.
   */
  toPromptContext(filePaths) {
    const sections = [];

    for (const fp of filePaths) {
      const contracts = this.getFileContracts(fp);
      if (contracts.length === 0) continue;

      sections.push(`--- ${fp} (EXACT SIGNATURES) ---`);
      for (const contract of contracts) {
        sections.push(serializeContractSignature(contract));
      }
      sections.push(''); // blank line between files for readability
    }

    return sections.join('\n').trim();
  }
}

// ── Signature Serializer ──────────────────────────────────────────────────────

/**
 * Converts a FunctionContract into a single human + LLM readable signature line.
 *
 * Destructured parameters are rendered as `{ key1, key2 }: TypeText` so the
 * LLM sees the exact shape it must pass — eliminating the "pass an object vs
 * pass individual args" ambiguity that caused the original hallucination bug.
 *
 * @param {FunctionContract} contract
 * @returns {string}
 */
function serializeContractSignature(contract) {
  const paramStrings = contract.parameters.map((p) => {
    let nameStr;
    if (p.isDestructured && p.destructuredKeys.length > 0) {
      // Render as `{ key1, key2 }: TypeText` — structurally unambiguous
      nameStr = `{ ${p.destructuredKeys.join(', ')} }`;
    } else {
      nameStr = p.name;
    }

    const optionalMark = p.isOptional ? '?' : '';
    const defaultMark = p.defaultValue ? ` = ${p.defaultValue}` : '';
    return `${nameStr}${optionalMark}: ${p.type}${defaultMark}`;
  });

  const paramsStr = paramStrings.join(', ');
  const returnStr = contract.returnType || 'void';
  const exportKeyword = contract.isDefault ? 'export default' : 'export';
  const kindStr = contract.kind === 'arrow' ? 'const' : 'function';

  if (contract.kind === 'arrow') {
    return `${exportKeyword} ${kindStr} ${contract.name} = (${paramsStr}): ${returnStr}`;
  }
  return `${exportKeyword} ${kindStr} ${contract.name}(${paramsStr}): ${returnStr}`;
}
