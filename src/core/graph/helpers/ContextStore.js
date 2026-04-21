// src/core/graph/helpers/ContextStore.js
import { normalizePath } from '../../utils/pathUtils.js';
/**
 * ContextStore — Pure In-Memory Key-Value store for file summaries.
 *
 * Replaces MemoryVectorStore. Since we use Deterministic JIT Context retrieval
 * (based on actual file imports), there is no need for embeddings, vectors,
 * or semantic similarity search. Those were wasting API cost and latency.
 *
 * Storage: filePath (project-relative) → { summary: string, metadata: Object }
 */
export class ContextStore {
  constructor() {
    /** @type {Map<string, { summary: string, metadata: Object }>} */
    this._store = new Map();
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  /**
   * Add or update multiple documents (compatible with former addDocuments API).
   * Each doc must have: { pageContent: string, metadata: { filePath: string, ...} }
   * @param {Array<{ pageContent: string, metadata: { filePath: string } }>} docs
   */
  addDocuments(docs) {
    for (const doc of docs) {
      const filePath = doc.metadata?.filePath;
      if (!filePath) continue;
      this._store.set(filePath, {
        summary: doc.pageContent,
        metadata: doc.metadata,
      });
    }
  }

  /**
   * Remove the entry for a specific file path (prevents stale context).
   * @param {string} filePath - Project-relative path
   */
  deleteDocumentByFilePath(filePath) {
    this._store.delete(filePath);
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  /**
   * Deterministic JIT retrieval — fetches context only for the exact file paths
   * that are imported by the file currently being converted.
   *
   * @param {string[]} paths - Array of project-relative file paths
   * @returns {{ pageContent: string, metadata: Object }[]}
   */
  getDocumentsByPaths(paths) {
    const results = [];
    for (const filePath of paths) {
      // Normalize to forward slashes for consistent lookup
      const entry = this._store.get(normalizePath(filePath));
      if (entry) {
        results.push({
          pageContent: entry.summary,
          metadata: entry.metadata,
        });
      }
    }
    return results;
  }

  /**
   * Returns how many files are currently indexed.
   * @returns {number}
   */
  get size() {
    return this._store.size;
  }

  // ── Static Factory ────────────────────────────────────────────────────────

  /**
   * Build a ContextStore from an array of documents (replaces fromDocuments API).
   * @param {Array<{ pageContent: string, metadata: { filePath: string } }>} docs
   * @returns {ContextStore}
   */
  static fromDocuments(docs) {
    const store = new ContextStore();
    store.addDocuments(docs);
    return store;
  }
}
