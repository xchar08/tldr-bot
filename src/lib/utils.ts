import { z } from 'zod';

export const sanitizeMessage = (content: string): string => {
  return content
    .replace(/<@&?\d+>/g, '[mention]')
    .replace(/https?:\/\/[^\s]+/g, '[link]')
    .slice(0, 2000);
};

export const MessageHistorySchema = z.array(z.string()).max(20);
export const TwentyMinutesAgo = () => Date.now() - 20 * 60 * 1000;
