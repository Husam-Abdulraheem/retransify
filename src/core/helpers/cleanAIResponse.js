export function cleanAIResponse(text = "") {
  if (!text) return "";

  let output = text.trim();

  // إزالة ```js أو ``` أو أي Markdown
  output = output.replace(/```[\s\S]*?```/g, "");
  output = output.replace(/```/g, "");

  // إزالة "Here is the code:" أو "Converted file:"
  output = output.replace(/^Here.*?:/gi, "");
  output = output.replace(/^Converted.*?:/gi, "");

  // إزالة تعليقات غير مرغوب فيها
  output = output.replace(/\/\/.*$/gm, "");

  return output.trim();
}