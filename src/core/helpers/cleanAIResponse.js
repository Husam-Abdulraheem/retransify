export function cleanAIResponse(text = '') {
  if (!text) return '';

  let output = text.trim();

  // 1. Remove <think> blocks (internal monologue)
  output = output.replace(/<think>[\s\S]*?<\/think>/g, '');

  // 2. Try to extract content from Markdown code blocks
  // Priority: ```json -> ```js/jsx/ts/tsx -> ```

  // A. Check for JSON block
  const jsonMatch = output.match(/```json([\s\S]*?)```/i);
  if (jsonMatch && jsonMatch[1]) {
    return jsonMatch[1].trim();
  }

  // B. Check for Code block (js, jsx, ts, tsx)
  const codeMatch = output.match(/```(?:js|jsx|ts|tsx)([\s\S]*?)```/i);
  if (codeMatch && codeMatch[1]) {
    return codeMatch[1].trim();
  }

  // C. Check for Generic block
  const genericMatch = output.match(/```([\s\S]*?)```/);
  if (genericMatch && genericMatch[1]) {
    return genericMatch[1].trim();
  }

  // 3. Fallback: Clean up conversational text (if no blocks found)
  // Remove "Here is the code:", "Converted file:", etc.
  output = output.replace(/^Here.*?:/gim, '');
  output = output.replace(/^Converted.*?:/gim, '');
  output = output.replace(/^Sure.*?:/gim, '');

  // Remove trailing comments that might be added by AI
  // output = output.replace(/\/\/.*$/gm, ""); // Be careful, this removes valid code comments too!

  return output.trim();
}
