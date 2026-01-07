import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const key = process.env.NEBIUS_API_KEY?.trim();
console.log(`Testing Key: ${key?.substring(0, 10)}... (Length: ${key?.length})`);

const client = new OpenAI({
  apiKey: key,
  baseURL: 'https://api.studio.nebius.ai/v1/',
});

(async () => {
  try {
    const completion = await client.chat.completions.create({
      model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-fast',
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 5
    });
    console.log('✅ Success:', completion.choices[0].message.content);
  } catch (e: any) {
    console.error('❌ Failed:', e.status, e.message);
  }
})();
