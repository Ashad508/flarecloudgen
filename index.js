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
    GatewayIntentBits.GuildPresences // required for status tracking
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.User]
});

// ==== CONFIG ====
const configData = require('./config.json');
const config = {
  genChannelId: '1448293260308250684',
  boosterChannelId: '1448293261688045630',
  vipChannelId: '1448293263541801175',
  vouchChannelId: '1448293264951087247',
  logsChannelId: '1448293304138469516',
  genBansChannelId: '1448293258760556624',
  restockChannelId: '1449732006333120625',
  emojis: configData.emojis,

  statusText: ".gg/W9u8kr2yGc : Free MCFA Generator",
  statusRoleId: "1428026856917045311",

  services: {
    "minecraft": {
      stockFile: "stock/Minecraft.txt",
      emoji: "ice_cube",
      display: "Minecraft Java"
    },
    "steam": {
      stockFile: "stock/Steam.txt",
      emoji: "ice_cube",
      display: "Steam"
    },
    "crunchyroll": {
      stockFile: "stock/Crunchyroll.txt",
      emoji: "ice_cube",
      display: "Crunchyroll"
     },
    "mc_bedrock": {
      stockFile: "stock/Mc_Bedrock.txt",
      emoji: "globe",
      display: "Minecraft Bedrock"
    },
    "xbox": {
      stockFile: "stock/Xbox.txt",
      emoji: "gold",
      display: "Xbox"
    },
    "donut": {
      stockFile: "booststock/Donut.txt",
      emoji: "booster",
      display: "donut"
    },
    "cape": {
      stockFile: "stock/Cape.txt",
      emoji: "booster",
      display: "Cape"
    },
    "unbanned": {
      stockFile: "booststock/Unbanned.txt",
      emoji: "booster",
      display: "Unbanned"
    },
    "mcfa": {
      stockFile: "paidstock/Mcfa.txt",
      emoji: "paid",
      display: "MCFA Premium"
    }
  }
};

client.config = config;

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

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📝 Command Executed')
    .addFields(
      { name: 'Command', value: `\`$${commandName}\``, inline: true },
      { name: 'User', value: `${message.author.tag}`, inline: true },
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

  if (command) {
    try {
      await command.execute(message, args, client);
      await logCommandUsage(message, commandName, args);
    } catch (error) {
      console.error(error);
      message.reply('❌ There was an error executing that command!');
    }
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
  client.user.setActivity('.gg/wardencloud', {
    type: 3 // WATCHING
  });

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


client.login("MTQyODY2MDY2MjYwMjU2MzYyNg.G1-_fv.zGmIe68yHJVbsrRnt_jhTwwiymUD0SiIbtMvMU");

