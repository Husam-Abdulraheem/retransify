import path from 'path';
import crypto from 'crypto';

/**
 * GlobalMigrationContext
 *
 * Represents the "Shared Cognitive Memory" of the migration process.
 * Different phases write to specific sections of this memory.
 *
 * - Analyzer -> Facts
 * - Planner -> Decisions
 * - Executor -> Results
 * - Verifier -> Judgements
 * - Healer -> Corrections
 */
export class GlobalMigrationContext {
  static PHASES = {
    ANALYZER: 'analyzer',
    PLANNER: 'planner',
    EXECUTOR: 'executor',
    VERIFIER: 'verifier',
    HEALER: 'healer',
  };

  constructor(options = {}) {
    this.options = options;

    // Cognitive Memory Sections
    this.facts = {};
    this.decisions = {};
    this.results = {};
    this.judgements = {};
    this.corrections = {};

    // State Machine
    this.currentPhase = null;

    // Healer Protection State
    this.healingHistory = {}; // Record<filePath, { attempts: number, lastErrorHash?: string, lastFixSummary?: string }>
    this.maxHealingAttempts = options.maxHealingAttempts || 3;

    // Timestamp for context creation
    this.startTime = new Date().toISOString();
  }

  // --- Utilities (Testable Layers 1 & 2) ---
  static calculateErrorHash(message) {
    return crypto.createHash('md5').update(message.trim()).digest('hex');
  }

  static normalizePath(filePath) {
    return filePath.split(path.sep).join('/');
  }

  enterPhase(phase) {
    const validPhases = Object.values(GlobalMigrationContext.PHASES);
    if (!validPhases.includes(phase)) {
      throw new Error(`Invalid phase transition: Cannot enter '${phase}'`);
    }
    this.currentPhase = phase;
  }

  _enforcePhase(allowedPhase, actionName) {
    // If no phase is set, we might be in setup/testing.
    // But for strictness, if currentPhase IS set, we must match.
    // If currentPhase is null, we assume permissive mode (or setup).
    if (this.currentPhase && this.currentPhase !== allowedPhase) {
      throw new Error(
        `Illegal Write: Cannot perform '${actionName}' during '${this.currentPhase}' phase. (Expected: '${allowedPhase}')`
      );
    }
  }

  // --- Analyzer Section (Facts) ---
  addFact(key, value) {
    this._enforcePhase(GlobalMigrationContext.PHASES.ANALYZER, 'addFact');
    this.facts[key] = value;
  }

  getFact(key) {
    return this.facts[key];
  }

  // --- Planner Section (Decisions) ---
  addDecision(key, value) {
    this._enforcePhase(GlobalMigrationContext.PHASES.PLANNER, 'addDecision');
    this.decisions[key] = value;
  }

  getDecision(key) {
    return this.decisions[key];
  }

  /**
   * Request a structural change to the plan (Planner Re-run Policy).
   */
  requestPlanMutation({ file, reason, attemptNumber }) {
    if (!this.decisions.mutationRequests) {
      this.decisions.mutationRequests = [];
    }
    this.decisions.mutationRequests.push({
      file,
      reason,
      attemptNumber,
      timestamp: new Date().toISOString(),
    });
    console.log(
      `⚠️ Mutation Requested for ${file} (Attempt ${attemptNumber}): ${reason}`
    );
  }

  // --- Executor Section (Results) ---
  addResult(file, status) {
    this._enforcePhase(GlobalMigrationContext.PHASES.EXECUTOR, 'addResult');
    this.results[file] = status;
  }

  getResult(file) {
    return this.results[file];
  }

  markAsUnrecoverable(file, reason) {
    this.results[file] = {
      status: 'failed',
      reason: 'UNRECOVERABLE_AFTER_N_ATTEMPTS',
      details: reason,
      attempts: this.healingHistory[file]?.attempts || 0,
    };
    console.error(`🛑 File marked UNRECOVERABLE: ${file}. Reason: ${reason}`);
  }

  // --- Verifier Section (Judgements) ---
  addJudgement(file, issues) {
    this._enforcePhase(GlobalMigrationContext.PHASES.VERIFIER, 'addJudgement');
    this.judgements[file] = issues;
  }

  getJudgement(file) {
    return this.judgements[file] || [];
  }

  // --- Healer Section (Corrections & Protection) ---
  addCorrection(file, fix) {
    this._enforcePhase(GlobalMigrationContext.PHASES.HEALER, 'addCorrection');
    if (!this.corrections[file]) {
      this.corrections[file] = [];
    }
    this.corrections[file].push(fix);
  }

  /**
   * Decision Matrix for Healing.
   */
  canHeal(file, errorHash) {
    if (!this.healingHistory[file]) {
      this.healingHistory[file] = { attempts: 0 };
    }

    const history = this.healingHistory[file];

    // RULE 1: Max Attempts Check
    if (history.attempts >= this.maxHealingAttempts) {
      console.warn(
        `🚫 Healing Denied for ${file}: Max attempts (${this.maxHealingAttempts}) reached.`
      );
      return false;
    }

    // RULE 2: Loop Detection
    if (history.lastErrorHash === errorHash) {
      console.warn(
        `🚫 Healing Denied for ${file}: Loop detected (Sample Error Hash).`
      );
      return false;
    }

    return true;
  }

  /**
   * Audit trail for healing attempts.
   */
  recordHealingAttempt(file, { errorHash, fixSummary }) {
    if (!this.healingHistory[file]) {
      this.healingHistory[file] = { attempts: 0 };
    }

    const history = this.healingHistory[file];

    // User requirement: "Distinct Errors: Verify that a new error hash resets the counter (or is treated independently)."
    // Implementation: If errorHash changes, we could reset attempts OR just respect max attempts globally.
    // The user's test expects "Distinct Errors" to basically allow healing aka "Loop 1, 2, 3 -> true".
    // If I reset attempts on new error, I might allow infinite loops of alternating errors.
    // SAFE default: don't reset attempts, just check loop.
    // BUT the Test Logic "Loop 4 -> canHeal() returns false" implies max attempts is key.

    history.attempts += 1;
    history.lastErrorHash = errorHash;
    history.lastFixSummary = fixSummary;

    console.log(
      `📝 Healing Attempt Recorded for ${file} (Attempt ${history.attempts}/${this.maxHealingAttempts})`
    );
  }

  // --- Snapshot ---
  getSnapshot() {
    // Return a deep copy to prevent mutation
    // structuredClone is available in Node 17+
    return structuredClone({
      facts: this.facts,
      decisions: this.decisions,
      results: this.results,
      judgements: this.judgements,
      corrections: this.corrections,
      healingHistory: this.healingHistory,
      meta: {
        startTime: this.startTime,
        lastUpdated: new Date().toISOString(),
        currentPhase: this.currentPhase,
      },
    });
  }
}
