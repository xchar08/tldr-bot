import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  User,
} from 'discord.js';
import dotenv from 'dotenv';
import { aiService } from './lib/ai.ts';
import { sanitizeMessage, MessageHistorySchema, TwentyMinutesAgo } from './lib/utils.ts';
import { z } from 'zod';

dotenv.config();

const TokenSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN required in .env'),
  CLIENT_ID: z.string().min(1, 'CLIENT_ID required in .env'),
});

const env = TokenSchema.safeParse({
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  CLIENT_ID: process.env.CLIENT_ID,
});

if (!env.success) {
  console.error('❌ .env validation failed:');
  env.error.issues.forEach((issue: any) => {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

const { DISCORD_TOKEN, CLIENT_ID } = env.data;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const commands = [
  new SlashCommandBuilder()
    .setName('tldr')
    .setDescription("Summarize tagged user's messages from last 20 minutes")
    .addUserOption((option) =>
      option.setName('user').setDescription('User to summarize').setRequired(true)
    ),
].map((command) => command.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user?.tag}`);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ /tldr slash command registered!');
  } catch (error) {
    console.error('❌ Slash command registration failed:', error);
  }
});

const cooldowns = new Map<string, number>();

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const int = interaction as ChatInputCommandInteraction;

  if (int.commandName === 'tldr') {
    const channelId = int.channelId;
    const now = Date.now();
    const lastUsed = cooldowns.get(channelId) || 0;

    if (now - lastUsed < 30000) {
      return int.reply({ content: '⏳ TLDR on cooldown (30s). Try again soon!', ephemeral: true });
    }
    cooldowns.set(channelId, now);

    const targetUser = int.options.getUser('user', true) as User;
    if (targetUser.bot) {
      return int.reply({ content: '🤖 Cannot summarize bots!', ephemeral: true });
    }

    await int.deferReply();

    try {
      const twentyMinAgo = TwentyMinutesAgo();
      const recentMsgs = await int.channel!.messages.fetch({ limit: 100 });

      const userMsgsRaw = recentMsgs
        .filter((m) => 
          m.author.id === targetUser.id && 
          !m.author.bot && 
          m.createdTimestamp > twentyMinAgo
        )
        .map((m) => sanitizeMessage(`${m.author.username}: ${m.content}`))
        .reverse();

      const userMsgs = MessageHistorySchema.parse(userMsgsRaw);

      if (userMsgs.length === 0) {
        return int.editReply(`❌ No messages from <@${targetUser.id}> in last 20 minutes.`);
      }

      console.log(`📝 Summarizing ${userMsgs.length} messages for ${targetUser.username}`);
      
      const summary = await aiService.summarizeMessages(userMsgs);
      
      await int.editReply(
        `**📋 TLDR for ${targetUser.username}** (last 20min, ${userMsgs.length} msgs):\n\`\`\`\n${summary}\n\`\`\``
      );
    } catch (error) {
      console.error('❌ TLDR Error:', error);
      await int.editReply('⚠️ Summary failed—check console logs.');
    }
  }
});

client.login(DISCORD_TOKEN);
