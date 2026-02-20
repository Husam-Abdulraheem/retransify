
export async function promptModelSelection() {
  const models = [
    { name: "Gemini 3 Pro", value: "gemini-3-pro-preview", provider: "gemini" },
    { name: "Gemini 3 Flash", value: "gemini-3-flash-preview", provider: "gemini" },
    { name: "Gemini 2.5 Flash", value: "gemini-2.5-flash", provider: "gemini" },
    { name: "Gemini 2.5 Flash Lite", value: "gemini-2.5-flash-lite", provider: "gemini" },
    { name: "GPT OSS 120B", value: "openai/gpt-oss-120b", provider: "groq" },
    { name: "Llama 3.3 70B (Versatile)", value: "llama-3.3-70b-versatile", provider: "groq" },
    { name: "Llama 3.1 8B (Instant)", value: "llama-3.1-8b-instant", provider: "groq" },
    { name: "Mixtral 8x7b", value: "mixtral-8x7b-32768", provider: "groq" }
  ];

  console.log("\n🤖 Select AI Model:");
  models.forEach((m, i) => {
    console.log(`  ${i + 1}) ${m.name}`);
  });

  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('\n👉 Enter choice (1-5) [Default: 1]: ', (answer) => {
      rl.close();
      const choice = parseInt(answer.trim());
      let selected;
      
      if (isNaN(choice) || choice < 1 || choice > models.length) {
        selected = models[0]; // Default to first option
      } else {
        selected = models[choice - 1];
      }

      if (!selected.value) {
        // Fallback or error if value is missing (sanity check)
        console.warn("⚠️  Warning: Selected model value is missing. Defaulting to Gemini 3 Flash.");
        selected = models[0];
      }

      resolve(selected);
    });
  });
}
