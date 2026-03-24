import { select } from '@inquirer/prompts';

const MODELS = [
  {
    name: 'Gemini 2.5 Flash  (Recommended)',
    value: 'gemini-2.5-flash',
    provider: 'gemini',
  },
  {
    name: 'Gemini 2.5 Flash Lite',
    value: 'gemini-2.5-flash-lite',
    provider: 'gemini',
  },
  {
    name: 'Gemini 3 Flash',
    value: 'gemini-3-flash-preview',
    provider: 'gemini',
  },
  { name: 'Gemini 3 Pro', value: 'gemini-3-pro-preview', provider: 'gemini' },
  {
    name: 'Llama 3.3 70B (Versatile)',
    value: 'llama-3.3-70b-versatile',
    provider: 'groq',
  },
  {
    name: 'Llama 3.1 8B (Instant)',
    value: 'llama-3.1-8b-instant',
    provider: 'groq',
  },
  { name: 'Mixtral 8x7b', value: 'mixtral-8x7b-32768', provider: 'groq' },
  { name: 'GPT OSS 120B', value: 'openai/gpt-oss-120b', provider: 'groq' },
];

/**
 * Prompts the user to select an AI model using arrow-key navigation.
 * @returns {Promise<{ name: string, value: string, provider: string }>}
 */
export async function promptModelSelection() {
  const value = await select({
    message: 'Select AI model',
    choices: MODELS.map((m) => ({ name: m.name, value: m.value })),
    default: MODELS[0].value,
  });

  const selected = MODELS.find((m) => m.value === value) ?? MODELS[0];
  return selected;
}
