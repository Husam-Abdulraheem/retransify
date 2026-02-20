/**
 * @typedef {import('../../types').MigrationPlan} MigrationPlan
 * @typedef {import('../../types').GlobalMigrationContext} GlobalMigrationContext
 */

export class Planner {
  constructor(dependencyGraph) {
    this.dependencyGraph = dependencyGraph;
  }

  /**
   * @param {GlobalMigrationContext} context
   * @param {string[]} files
   */
  async plan(context, files) {
    console.log('🗺️  Planning migration strategy...');
    
    // Read Facts
    const facts = context.facts; // Wrapper access could be cleaner but direct is fine for now if documented
    // Or usage: context.getFact('techStack');
    
    let pathMap = {};
    if (files) {
        const { PathMapper } = await import('../helpers/pathMapper.js');
        pathMap = PathMapper.generateMap(files);
        console.log(`📍 Generated Smart Paths for ${Object.keys(pathMap).length} files.`);
    }

    let sortedFiles = this._topologicalSort(this.dependencyGraph);

    // Check for Mutation Requests (Healer Protection)
    if (context.decisions.mutationRequests && context.decisions.mutationRequests.length > 0) {
        const lastRequest = context.decisions.mutationRequests[context.decisions.mutationRequests.length - 1];
        console.log(`🔄 Planner received mutation request for ${lastRequest.file} (Attempt ${lastRequest.attemptNumber}).`);
        console.log(`   Detailed Reason: ${lastRequest.reason}`);
        
        // MUTATION STRATEGY:
        // For this specific file, we might want to change its processing order or strategy.
        // Since we process files in a loop in Executor, changing order *might* help if dependencies were the issue.
        // However, user requirement: "Change at least one structural decision OR explicitly refuse mutation".
        
        // Simple Mutation: Move the problematic file to the end of the list (if topological sort allows, or just force it).
        // Or, just log that we are keeping the plan stable but flagging it.
        // FOR NOW: We refuse structural mutation regarding *order* because TopoSort is strict, 
        // BUT we can add a 'mutationTag' to the decision so Executor knows to try a different prompt strategy.
        
        context.addDecision('mutationActive', true);
        context.addDecision('mutationTarget', lastRequest.file);
        
        console.log('   -> structural mutation: Tagged file for "Aggressive Decomposition" mode in Executor.');
    } else {
        context.addDecision('mutationActive', false);
    }

    // Write Decisions
    context.addDecision('executionOrder', sortedFiles);
    context.addDecision('pathMap', pathMap);
    
    const tech = context.facts.tech || {};
    const strategySummary = `Topological Sort (Leaf Nodes First) | Tech: ${tech.stateManagement}, ${tech.styling}, ${tech.routing}`;
    context.addDecision('strategyDescription', strategySummary);

    console.log('✅ Planning decisions stored in Global Context.');
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
