import OpenAI from 'openai';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const ConfigSchema = z.object({
  NEBIUS_API_KEY: z.string().min(1, 'NEBIUS_API_KEY required'),
  NEBIUS_MODEL: z.string().default('meta-llama/Meta-Llama-3.1-70B-Instruct'),
});

const rawConfig = {
  NEBIUS_API_KEY: process.env.NEBIUS_API_KEY,
  NEBIUS_MODEL: process.env.NEBIUS_MODEL || 'meta-llama/Meta-Llama-3.1-70B-Instruct',
};

const config: z.infer<typeof ConfigSchema> = ConfigSchema.parse(rawConfig);

console.log('✅ Nebius config loaded:', { model: config.NEBIUS_MODEL, keySet: !!config.NEBIUS_API_KEY });

export class AiService {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: config.NEBIUS_API_KEY,
      baseURL: 'https://api.studio.nebius.ai/v1/',
    });
  }

  async summarizeMessages(messages: string[], maxTokens = 250): Promise<string> {
    const prompt = `Concise TLDR (2-4 bullets):\n\n${messages.slice(0, 15).join('\n')}\n\nTLDR:`;
    
    try {
      const response = await this.client.chat.completions.create({
        model: config.NEBIUS_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.3,
      });
      return response.choices[0]?.message?.content?.trim() || 'No summary.';
    } catch (error: any) {
      console.error('Nebius error:', error.message);
      return 'AI unavailable.';
    }
  }
}

export const aiService = new AiService();
