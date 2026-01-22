// src/lib/scraper.ts
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function scrapeUrl(url: string): Promise<string | null> {
  try {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
      timeout: 5000 
    });

    const $ = cheerio.load(data);
    $('script, style, nav, footer, header, aside, .ads, .comments').remove();

    let content = '';
    $('p, h1, h2, h3, li').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 50) content += text + '\n';
    });

    return content.replace(/\s+/g, ' ').slice(0, 6000) || null;
  } catch (error) {
    console.error('Scrape error:', error);
    return null;
  }
}

export function findLink(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : null;
}
