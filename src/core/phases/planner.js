/**
 * @typedef {import('../../types').MigrationPlan} MigrationPlan
 * @typedef {import('../../types').GlobalMigrationContext} GlobalMigrationContext
 */

export class Planner {
  constructor(globalContext, dependencyGraph) {
    this.globalContext = globalContext;
    this.dependencyGraph = dependencyGraph;
  }

  /**
   * @returns {Promise<MigrationPlan>}
   */
  async plan(files) {
    console.log('🗺️  Planning migration strategy...');
    
    // 1. Generate Start Pathing Map
    // We need the full file list here. If not passed in constructor, we might need to pass it to plan()
    // NOTE: The current Planner constructor only takes globalContext and dependencyGraph. 
    // We should probably pass 'files' to the plan() method or constructor.
    // For now, let's assume 'files' are passed to plan() or available in context.
    
    // Let's rely on the caller passing 'files' to plan().
    // If files is undefined, we can't map. 
    
    let pathMap = {};
    if (files) {
        const { PathMapper } = await import('../helpers/pathMapper.js');
        pathMap = PathMapper.generateMap(files);
        console.log(`📍 Generated Smart Paths for ${Object.keys(pathMap).length} files.`);
    }

    const sortedFiles = this._topologicalSort(this.dependencyGraph);

    return {
      files: sortedFiles,
      pathMap, // <--- Add this
      strategyDescription: 'Topological Sort (Leaf Nodes First) + Smart Pathing'
    };
  }

  /**
   * Provides a valid topological sort (or closest approximation if cycles exist).
   * Files with 0 dependencies come first.
   * 
   * @param {Object} graph - Adjacency list { file: [dependencies] }
   * @returns {string[]} - Ordered file paths
   */
  _topologicalSort(graph) {
    const visited = new Set();
    const sorted = [];
    const tempVisited = new Set(); // For cycle detection

    const visit = (node) => {
      if (tempVisited.has(node)) return; // Cycle detected, skip or handle
      if (visited.has(node)) return;

      tempVisited.add(node);

      const dependencies = graph[node] || [];
      for (const dep of dependencies) {
        visit(dep);
      }

      tempVisited.delete(node);
      visited.add(node);
      sorted.push(node);
    };

    for (const node of Object.keys(graph)) {
      visit(node);
    }

    return sorted; // Note: In standard toposort for "compile order" (deps first), we usually want this order.
  }
}
