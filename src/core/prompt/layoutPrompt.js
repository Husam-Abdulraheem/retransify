// src/core/prompt/layoutPrompt.js

/**
 * Builds the prompt for the Layout Agent to determine navigation structure.
 *
 * @param {Object} routeMap
 * @param {Object} routeMetadata
 * @returns {string} The prompt for the Layout Agent
 */
export function buildLayoutAgentPrompt(routeMap, routeMetadata) {
  return `
You are an expert Mobile UX Engineer architecting an Expo Router navigation structure.
Analyze the provided routes and their Extracted AST Metadata (inputs, forms, and navigation links counts).

Rules:
1. Identify the Main Navigation (type):
   - 'tabs': If a root or index route contains multiple navigation links (typically 2-5).
   - 'drawer': If there are many links (5+) or if a sidebar/hamburger menu is detected in the web UI.
   - 'stack' or 'none': If there is no clear groupable primary navigation.
2. Identify Modals:
   - If a specific route has a high count of inputs/forms and NO navigation links (like a Login, Signup, or Add Item form), add its Expo Path to the 'modals' array.
3. Organize the Screens:
   - Identify which screens are the "Main" destinations that should be directly accessible via the primary navigation (Tabs or Drawer). List their Expo paths (starting with 'app/') in the 'mainRoutes' array.

--- ROUTE MAP (Original -> Expo Path) ---
${JSON.stringify(routeMap, null, 2)}

--- ROUTE METADATA (Stats per Original File) ---
${JSON.stringify(routeMetadata, null, 2)}

Output strictly in JSON matching the schema.
`;
}
