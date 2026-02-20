/**
 * @typedef {Object} GlobalMigrationContext
 * @property {string} projectPath - Absolute path to the source project
 * @property {Object} tech - Detected tech stack (language, stateManagement, styling, routing, buildTool)
 * @property {Object} packageJson - The parsed package.json of the source project
 */

/**
 * @typedef {Object} MigrationPlan
 * @property {string[]} files - Array of file paths in topological order (execution sequence)
 * @property {string} strategyDescription - Description of the planning strategy used
 */

/**
 * @typedef {'PENDING' | 'COMPLETED' | 'ERROR' | 'SKIPPED'} MigrationStatus
 */

/**
 * @typedef {Object} MigrationState
 * @property {Object.<string, MigrationStatus>} fileStatus - Map of file paths to their migration status
 * @property {string} lastUpdated - ISO timestamp of the last update
 */

export {};
