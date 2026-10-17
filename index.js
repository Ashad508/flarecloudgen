require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  Events,
  REST,
  Routes
} = require('discord.js');
const fs = require('fs-extra');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.User]
});

// ==== CONFIG ====
const configData = require('./config.json');
const config = {
  // === Owner ===
  ownerId: '1550540531665473699',
  ownerIds: ['1550540531665473699'],

  // === Channels (from your JSON) ===
  genChannelId: '1483029114825867367',
  boosterChannelId: '1483029113341218859',
  vipChannelId: '1483029112225402973',
  vouchChannelId: '1483029116629549169',
  logsChannelId: '1483029182652088350',
  genBansChannelId: '1483029174552756245',
  restockChannelId: '1483167512014225590',

  emojis: configData.emojis,

  statusText: ".gg/W9u8kr2yGc : Free MCFA Generator",
  statusRoleId: "1428026856917045311",

  services: {
    "minecraft":   { stockFile: "stock/Minecraft.txt",   emoji: "ice_cube", display: "Minecraft Java" },
    "steam":       { stockFile: "stock/Steam.txt",       emoji: "ice_cube", display: "Steam" },
    "crunchyroll": { stockFile: "stock/Crunchyroll.txt", emoji: "ice_cube", display: "Crunchyroll" },
    "mc_bedrock":  { stockFile: "stock/Mc_Bedrock.txt",  emoji: "globe",    display: "Minecraft Bedrock" },
    "xbox":        { stockFile: "stock/Xbox.txt",        emoji: "gold",     display: "Xbox" },
    "donut":       { stockFile: "booststock/Donut.txt",  emoji: "booster",  display: "donut" },
    "cape":        { stockFile: "stock/Cape.txt",        emoji: "booster",  display: "Cape" },
    "unbanned":    { stockFile: "booststock/Unbanned.txt", emoji: "booster", display: "Unbanned" },
    "mcfa":        { stockFile: "paidstock/Mcfa.txt",    emoji: "paid",     display: "MCFA Premium" }
  }
};

client.config = config;

// ==== OWNER CHECK ====
function isOwner(userId) {
  return config.ownerIds.includes(userId);
}
client.isOwner = isOwner;

// ==== STOCK SYSTEM ====
const STOCK_PATHS = {
  "Freemium Vault": {
    "Mc_Bedrock": "freestock/Mc_Bedrock.txt",
    "Xbox": "freestock/Xbox.txt",
    "Minecraft": "freestock/Minecraft.txt",
    "Steam": "freestock/Steam.txt"
  },
  "Booster Vault": {
    "Ranked": "booststock/Ranked.txt",
    "Cape": "booststock/Cape.txt",
    "Unbanned": "booststock/Unbanned.txt"
  },
  "Premium Vault": {
    "Mcfa": "premiumstock/Mcfa.txt"
  }
};

// ==== COMMAND LOADER ====
const commands = new Map();
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

let vouchSystem = null;
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  if (file === 'vouch.js') {
    vouchSystem = command;
  } else if (command.name) {
    commands.set(command.name, command);
  }
}

// ==== LOG COMMAND USAGE ====
async function logCommandUsage(message, commandName, args) {
  const logsChannel = message.guild?.channels.cache.get(config.logsChannelId);
  if (!logsChannel) return;

  const ownerFlag = isOwner(message.author.id) ? ' 👑' : '';

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📝 Command Executed')
    .addFields(
      { name: 'Command', value: `\`$${commandName}\``, inline: true },
      { name: 'User', value: `${message.author.tag}${ownerFlag}`, inline: true },
      { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
      { name: 'Arguments', value: args.length > 0 ? `\`${args.join(' ')}\`` : 'None', inline: false }
    )
    .setTimestamp();

  await logsChannel.send({ embeds: [embed] }).catch(() => {});
}

// ==== MESSAGE HANDLER ====
client.on('messageCreate', async (message) => {
  if (vouchSystem) await vouchSystem.handleMessage(message, client);
  if (message.author.bot || !message.content.startsWith('$')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();
  const command = commands.get(commandName);

  if (!command) return;

  // 🔒 Owner-only guard
  if (command.ownerOnly && !isOwner(message.author.id)) {
    return message.reply('❌ This command is owner-only.').catch(() => {});
  }

  try {
    await command.execute(message, args, client);
    await logCommandUsage(message, commandName, args);
  } catch (error) {
    console.error(error);
    message.reply('❌ There was an error executing that command!').catch(() => {});
  }
});

// ==== AUTO STATUS ROLE SYSTEM ====
client.on('presenceUpdate', async (oldPresence, newPresence) => {
  if (!newPresence || !newPresence.member) return;
  const member = newPresence.member;
  if (member.user.bot) return;

  const customStatus = newPresence.activities?.find(a => a.type === 4);
  const hasTargetStatus =
    customStatus && customStatus.state && customStatus.state.includes(config.statusText);

  const role = member.guild.roles.cache.get(config.statusRoleId);
  const logChannel = member.guild.channels.cache.get(config.logsChannelId);

  if (!role) return;

  try {
    if (hasTargetStatus && !member.roles.cache.has(role.id)) {
      await member.roles.add(role);
      console.log(`✅ Added role to ${member.user.tag}`);
      logChannel?.send(`✅ **${member.user.tag}** set correct status → role added`);
    } else if (!hasTargetStatus && member.roles.cache.has(role.id)) {
      await member.roles.remove(role);
      console.log(`❌ Removed role from ${member.user.tag}`);
      logChannel?.send(`❌ **${member.user.tag}** removed/changed status → role removed`);
    }
  } catch (err) {
    console.error(`⚠️ Role update failed for ${member.user.tag}:`, err.message);
  }
});

client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);

  // === BOT WATCHING STATUS ===
  client.user.setActivity('.gg/wardencore', { type: 3 });

  if (vouchSystem && vouchSystem.slashCommands) {
    try {
      const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
      await rest.put(Routes.applicationCommands(client.user.id), {
        body: vouchSystem.slashCommands
      });
      console.log('✅ [Vouch] Slash commands registered');
    } catch (err) {
      console.error('❌ [Vouch] Slash registration failed:', err);
    }
  }

  const cstatus = require('./commands/status.js');
  if (cstatus.startAutoCheck) {
    cstatus.startAutoCheck(client);
    console.log('🟢 Auto status checker started!');
  }
});

client.login(process.env.DISCORD_TOKEN);
