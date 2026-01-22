import OpenAI from 'openai';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// Debugging: Check for conflicting env vars
console.log('[DEBUG] Env Vars Check:', {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'Set (Might conflict)' : 'Unset',
  NEBIUS_KEY_LEN: process.env.NEBIUS_API_KEY?.length
});

const ConfigSchema = z.object({
  NEBIUS_API_KEY: z.string().min(1, 'NEBIUS_API_KEY required'),
  NEBIUS_MODEL: z.string().default('meta-llama/Meta-Llama-3.1-8B-Instruct-fast'),
});

const config = ConfigSchema.parse({
  NEBIUS_API_KEY: process.env.NEBIUS_API_KEY?.trim(),
  NEBIUS_MODEL: process.env.NEBIUS_MODEL?.trim() || 'meta-llama/Meta-Llama-3.1-8B-Instruct-fast',
});

export class AiService {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: config.NEBIUS_API_KEY,
      baseURL: 'https://api.studio.nebius.ai/v1/',
      dangerouslyAllowBrowser: true,
    });
  }

  // 1. Original: Summarize User Messages
  async summarizeMessages(messages: string[], maxTokens = 250): Promise<string> {
    const prompt = `Summarize these messages (TLDR):\n\n${messages.slice(0, 15).join('\n')}\n\nTLDR:`;
    
    try {
      console.log(`[DEBUG] Requesting ${config.NEBIUS_MODEL}...`);
      
      const response = await this.client.chat.completions.create({
        model: config.NEBIUS_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.3,
      });
      return response.choices[0]?.message?.content?.trim() || 'No summary.';
    } catch (error: any) {
      console.error('❌ Nebius API Error:', error.status, error.message);
      
      if (error.status === 401) {
        return this.rawFetchFallback(messages, maxTokens);
      }
      return '⚠️ AI Summary unavailable.';
    }
  }

  // 2. New: Summarize Web Page Content (Helper for summarizeLink)
  async summarizeText(text: string): Promise<string> {
    const prompt = `Analyze the following webpage content and provide a concise summary (3-5 bullet points). Focus on the main topic and key takeaways.\n\nCONTENT:\n${text}\n\nSUMMARY:`;

    try {
      const response = await this.client.chat.completions.create({
        model: config.NEBIUS_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 400,
        temperature: 0.3,
      });
      return response.choices[0]?.message?.content?.trim() || 'No summary generated.';
    } catch (error) {
      console.error('AI Error:', error);
      return '⚠️ Failed to summarize content.';
    }
  }

  // 3. New: Summarize Link (Fetch + Summarize)
  async summarizeLink(url: string): Promise<string> {
    try {
      // 1. Fetch the page content
      // Note: 'node-fetch' import might need to be at top if using ESM, 
      // but dynamic import works for CommonJS/mixed envs.
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(url);
      
      if (!response.ok) return `⚠️ Failed to fetch URL: ${response.statusText}`;
      
      const html = await response.text();
      
      // 2. Clean HTML (Remove scripts, styles, tags)
      const textContent = html
        .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, "")
        .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 8000); // Limit length for LLM context
        
      if (textContent.length < 50) return "⚠️ Could not extract meaningful text from this link.";

      console.log(`[DEBUG] Extracted ${textContent.length} chars from ${url}`);

      // 3. Send to AI
      return this.summarizeText(textContent);

    } catch (error) {
      console.error('❌ Link Fetch Error:', error);
      return '⚠️ Error fetching or analyzing the link (Is it a public URL?).';
    }
  }

  // 4. New: Chat Command
  async chat(message: string, maxTokens = 1000): Promise<string> {
    const systemPrompt = `You are a helpful, concise Discord bot assistant. Answer directly without unnecessary fluff or greetings.`;

    try {
      console.log(`[DEBUG] Chat request: ${message.substring(0, 50)}...`);
      
      const response = await this.client.chat.completions.create({
        model: config.NEBIUS_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        max_tokens: maxTokens,
        temperature: 0.7,
      });
      
      return response.choices[0]?.message?.content?.trim() || 'No response.';
    } catch (error: any) {
      console.error('❌ Chat API Error:', error.status, error.message);
      if (error.status === 401) return this.rawChatFallback(message);
      return '⚠️ Chat unavailable.';
    }
  }

  // 5. New: Def Command
  async def(term: string, maxTokens = 400): Promise<string> {
    const systemPrompt = `You are a technical dictionary. For each term respond with:
    1. **Definition**: 1 clear sentence
    2. **Example**: 1 brief real-world use  
    3. **Key Fact**: 1 important distinction/note
    
    Format cleanly. Be precise and concise.`;

    try {
      console.log(`[DEBUG] Def request: ${term}`);
      
      const response = await this.client.chat.completions.create({
        model: config.NEBIUS_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: term }
        ],
        max_tokens: maxTokens,
        temperature: 0.2,
      });
      
      return response.choices[0]?.message?.content?.trim() || `No definition for "${term}".`;
    } catch (error: any) {
      console.error('❌ Def API Error:', error.status, error.message);
      if (error.status === 401) return this.rawDefFallback(term);
      return `⚠️ Definition unavailable for "${term}".`;
    }
  }

  // Fallbacks
  private async rawFetchFallback(messages: string[], maxTokens: number): Promise<string> {
    return this.genericRawFallback([{ role: 'user', content: `Summarize:\n${messages.slice(0, 10).join('\n')}` }], maxTokens, 0.3);
  }

  private async rawChatFallback(message: string): Promise<string> {
    return this.genericRawFallback([
      { role: 'system', content: 'Helpful concise assistant.' },
      { role: 'user', content: message }
    ], 1000, 0.7);
  }

  private async rawDefFallback(term: string): Promise<string> {
    return this.genericRawFallback([
      { role: 'system', content: 'Technical dictionary.' },
      { role: 'user', content: term }
    ], 400, 0.2);
  }

  private async genericRawFallback(messages: any[], maxTokens: number, temp: number): Promise<string> {
    try {
      const fetch = (await import('node-fetch')).default;
      const response = await fetch('https://api.studio.nebius.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.NEBIUS_API_KEY}`
        },
        body: JSON.stringify({
          model: config.NEBIUS_MODEL,
          messages: messages,
          max_tokens: maxTokens,
          temperature: temp
        })
      });

      if (!response.ok) return `⚠️ API Error (Fallback): ${response.status}`;
      
      const data: any = await response.json();
      return data.choices[0]?.message?.content?.trim() || 'No response.';
    } catch (err) {
      console.error('[Fallback] Fetch Error:', err);
      return '⚠️ AI Service completely unreachable.';
    }
  }
}

export const aiService = new AiService();
