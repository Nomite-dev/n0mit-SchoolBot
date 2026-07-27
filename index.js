const { 
    Client, 
    GatewayIntentBits, 
    Collection, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    EmbedBuilder, 
    ChannelType 
} = require('discord.js');
const express = require('express');

// --- 1. CONFIGURATION DU SERVEUR KEEP-ALIVE POUR RENDER WEB SERVICE ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🤖 n0mit SchoolBot est en ligne et opérationnel !');
});

app.listen(PORT, () => {
    console.log(`🌐 Serveur Web en écoute sur le port ${PORT} (Anti-sommeil Render actif).`);
});

// --- 2. INITIALISATION DU BOT DISCORD ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const OWNER_ID = process.env.OWNER_ID; // Ton ID pour la console Render

// Base de données locale basique pour enregistrer le salon de logs de chaque serveur
const guildConfigs = new Map();

// --- LOGS CRÉATEUR (Console Render confidentielle) ---
function logCreator(type, author, detail, guild = 'N/A') {
    const timestamp = new Date().toISOString();
    console.log(`\n=================== [LOG CRÉATEUR] ===================`);
    console.log(`⏰ HEURE    : ${timestamp}`);
    console.log(`📌 TYPE     : ${type}`);
    console.log(`👤 AUTEUR   : ${author.tag} (ID: ${author.id})`);
    console.log(`🏰 SERVEUR  : ${guild}`);
    console.log(`💬 DETAILS  : ${detail}`);
    console.log(`======================================================\n`);
}

// --- LOGS PUBLICS DU SERVEUR (Pour les Chefs d'Établissement) ---
async function logGuildPublic(guild, embed) {
    const logChannelId = guildConfigs.get(guild.id)?.logChannelId;
    if (!logChannelId) return; // Aucun salon de log configuré sur ce serveur

    try {
        const channel = await guild.channels.fetch(logChannelId);
        if (channel && channel.isTextBased()) {
            await channel.send({ embeds: [embed] });
        }
    } catch (e) {
        console.error(`Impossible d'envoyer le log sur le serveur ${guild.name}:`, e.message);
    }
}

// --- 3. DÉFINITION DES COMMANDES SLASH ---
const commandsData = [
    // /setup_logs (Configuration du salon de log par l'admin)
    new SlashCommandBuilder()
        .setName('setup_logs')
        .setDescription('Définir le salon où seront envoyés les logs du serveur.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => 
            opt.setName('salon')
                .setDescription('Le salon de logs')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)),

    // /mp
    new SlashCommandBuilder()
        .setName('mp')
        .setDescription('Envoyer un MP officiel à un membre depuis ce serveur.')
        .addUserOption(opt => opt.setName('cible').setDescription('Le destinataire').setRequired(true))
        .addStringOption(opt => opt.setName('message').setDescription('Le contenu du message').setRequired(true)),

    // /say
    new SlashCommandBuilder()
        .setName('say')
        .setDescription('Faire parler le bot dans le salon.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(opt => opt.setName('message').setDescription('Le message à afficher').setRequired(true)),

    // /info_user
    new SlashCommandBuilder()
        .setName('info_user')
        .setDescription('Afficher les informations détaillées d’un utilisateur.')
        .addUserOption(opt => opt.setName('cible').setDescription('Utilisateur ciblé').setRequired(false)),

    // /rename_user
    new SlashCommandBuilder()
        .setName('rename_user')
        .setDescription('Changer le pseudo d’un membre.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
        .addUserOption(opt => opt.setName('cible').setDescription('Le membre').setRequired(true))
        .addStringOption(opt => opt.setName('pseudo').setDescription('Nouveau pseudo').setRequired(true)),

    // /ban
    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bannir un membre.')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption(opt => opt.setName('cible').setDescription('Le membre').setRequired(true))
        .addStringOption(opt => opt.setName('raison').setDescription('Raison').setRequired(false)),

    // /kick
    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Expulser un membre.')
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addUserOption(opt => opt.setName('cible').setDescription('Le membre').setRequired(true))
        .addStringOption(opt => opt.setName('raison').setDescription('Raison').setRequired(false)),

    // /mute
    new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mettre un membre en sourdine.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(opt => opt.setName('cible').setDescription('Le membre').setRequired(true))
        .addIntegerOption(opt => opt.setName('duree').setDescription('Durée en minutes').setRequired(true))
        .addStringOption(opt => opt.setName('raison').setDescription('Raison').setRequired(false))
];

// --- 4. GESTION DES REFUGE & ACCUEIL ---
client.on('guildCreate', async (guild) => {
    const refugeChannel = guild.channels.cache.find(
        ch => ch.type === ChannelType.GuildText && (ch.name.toLowerCase().includes('n0mit-coresystems') || ch.name.toLowerCase().includes('n0mit'))
    );

    if (refugeChannel) {
        const welcomeEmbed = new EmbedBuilder()
            .setTitle('🏫 n0mit SchoolBot - Refuge Identifié')
            .setDescription('Bot autonome de gestion d’établissement connecté avec succès.')
            .addFields(
                { name: 'Développeur', value: 'n0mit CoreSystems' },
                { name: 'Configuration', value: 'Utilisez `/setup_logs` pour définir votre salon de modération.' }
            )
            .setColor(0x00FF7F)
            .setTimestamp();

        await refugeChannel.send({ embeds: [welcomeEmbed] }).catch(() => {});
    }
    logCreator('NOUVEAU SERVEUR', client.user, `Le bot a été ajouté sur le serveur : ${guild.name} (${guild.id})`, guild.name);
});

// --- 5. EXECUTION DES COMMANDES ---
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, guild, user, channel } = interaction;

    try {
        // --- COMMANDE /SETUP_LOGS ---
        if (commandName === 'setup_logs') {
            const targetChannel = options.getChannel('salon');
            
            // Sauvegarde de la configuration
            guildConfigs.set(guild.id, { logChannelId: targetChannel.id });

            await interaction.reply({ 
                content: `✅ Salon des logs du serveur configuré sur <#${targetChannel.id}> !`, 
                ephemeral: true 
            });

            const logEmbed = new EmbedBuilder()
                .setTitle('⚙️ Configuration Mise à Jour')
                .setDescription(`Le salon <#${targetChannel.id}> a été défini comme salon officiel des logs du serveur.`)
                .setColor(0x3498DB)
                .setTimestamp();

            await logGuildPublic(guild, logEmbed);
            logCreator('SETUP_LOGS', user, `Salon de logs défini sur #${targetChannel.name}`, guild.name);
        }

        // --- COMMANDE /MP ---
        if (commandName === 'mp') {
            const target = options.getUser('cible');
            const msg = options.getString('message');

            const embedMP = new EmbedBuilder()
                .setTitle(`📩 Communication Officielle - ${guild.name}`)
                .setDescription(msg)
                .setColor(0x0099FF)
                .addFields(
                    { name: 'Expéditeur', value: `${user.tag}`, inline: true },
                    { name: 'Établissement', value: `${guild.name}`, inline: true }
                )
                .setFooter({ text: 'n0mit SchoolBot Services' })
                .setTimestamp();

            try {
                await target.send({ embeds: [embedMP] });
                await interaction.reply({ content: `✅ Message privé envoyé à **${target.tag}**.`, ephemeral: true });

                // Log public pour l'admin
                const guildLog = new EmbedBuilder()
                    .setTitle('📩 Log : Envoi de MP')
                    .addFields(
                        { name: 'Auteur', value: `${user.tag}`, inline: true },
                        { name: 'Destinataire', value: `${target.tag}`, inline: true }
                    )
                    .setColor(0x0099FF)
                    .setTimestamp();
                await logGuildPublic(guild, guildLog);

                // Log confidentiel créateur
                logCreator('COMMANDE /MP', user, `À: ${target.tag} (${target.id}) | Message: "${msg}"`, guild.name);
            } catch (e) {
                await interaction.reply({ content: `❌ Impossible d'envoyer le MP (DMs fermés).`, ephemeral: true });
            }
        }

        // --- COMMANDE /SAY ---
        if (commandName === 'say') {
            const msg = options.getString('message');

            await channel.send({ content: msg });
            await interaction.reply({ content: '✅ Message publié.', ephemeral: true });

            // Log public du serveur
            const guildLog = new EmbedBuilder()
                .setTitle('📢 Log : Commande /say')
                .addFields(
                    { name: 'Auteur', value: `${user.tag}`, inline: true },
                    { name: 'Salon', value: `<#${channel.id}>`, inline: true }
                )
                .setColor(0x2ECC71)
                .setTimestamp();
            await logGuildPublic(guild, guildLog);

            // Log confidentiel créateur sur Render
            logCreator('COMMANDE /SAY', user, `Dans #${channel.name} | Message: "${msg}"`, guild.name);
        }

        // --- COMMANDE /INFO_USER ---
        if (commandName === 'info_user') {
            const targetUser = options.getUser('cible') || user;
            const member = await guild.members.fetch(targetUser.id).catch(() => null);

            const roles = member 
                ? member.roles.cache.filter(r => r.id !== guild.id).map(r => r.toString()).join(', ') || 'Aucun rôle'
                : 'Hors du serveur';

            const embed = new EmbedBuilder()
                .setTitle(`👤 Informations : ${targetUser.username}`)
                .setThumbnail(targetUser.displayAvatarURL())
                .setColor(member ? member.displayColor : 0x7289DA)
                .addFields(
                    { name: 'Tag & ID', value: `${targetUser.tag}\n(\`${targetUser.id}\`)`, inline: true },
                    { name: 'Création du compte', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: true }
                );

            if (member) {
                embed.addFields(
                    { name: 'Arrivée sur le serveur', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: false },
                    { name: 'Rôles', value: roles, inline: false }
                );
            }

            await interaction.reply({ embeds: [embed] });
        }

        // --- COMMANDE /RENAME_USER ---
        if (commandName === 'rename_user') {
            const targetMember = options.getMember('cible');
            const newName = options.getString('pseudo');

            if (!targetMember) return interaction.reply({ content: 'Membre introuvable.', ephemeral: true });

            const oldName = targetMember.displayName;
            await targetMember.setNickname(newName);
            await interaction.reply({ content: `✅ Pseudo de **${oldName}** renommé en **${newName}**.` });

            const guildLog = new EmbedBuilder()
                .setTitle('✏️ Log : Pseudo Modifié')
                .addFields(
                    { name: 'Modérateur', value: `${user.tag}`, inline: true },
                    { name: 'Membre', value: `${targetMember.user.tag}`, inline: true },
                    { name: 'Changement', value: `${oldName} ➔ ${newName}` }
                )
                .setColor(0xF1C40F)
                .setTimestamp();
            await logGuildPublic(guild, guildLog);

            logCreator('MODERATION (RENAME)', user, `Target: ${targetMember.user.tag} | ${oldName} -> ${newName}`, guild.name);
        }

        // --- COMMANDE /BAN ---
        if (commandName === 'ban') {
            const targetUser = options.getUser('cible');
            const reason = options.getString('raison') || 'Aucune raison';

            await guild.members.ban(targetUser, { reason });
            await interaction.reply({ content: `🚫 **${targetUser.tag}** banni. Raison: ${reason}` });

            const guildLog = new EmbedBuilder()
                .setTitle('🚫 Log : Bannissement')
                .addFields(
                    { name: 'Modérateur', value: `${user.tag}`, inline: true },
                    { name: 'Membre Banni', value: `${targetUser.tag}`, inline: true },
                    { name: 'Raison', value: reason }
                )
                .setColor(0xE74C3C)
                .setTimestamp();
            await logGuildPublic(guild, guildLog);

            logCreator('MODERATION (BAN)', user, `Target: ${targetUser.tag} | Raison: ${reason}`, guild.name);
        }

        // --- COMMANDE /KICK ---
        if (commandName === 'kick') {
            const targetMember = options.getMember('cible');
            const reason = options.getString('raison') || 'Aucune raison';

            if (!targetMember) return interaction.reply({ content: 'Membre introuvable.', ephemeral: true });

            await targetMember.kick(reason);
            await interaction.reply({ content: `👢 **${targetMember.user.tag}** expulsé. Raison: ${reason}` });

            const guildLog = new EmbedBuilder()
                .setTitle('👢 Log : Expulsion')
                .addFields(
                    { name: 'Modérateur', value: `${user.tag}`, inline: true },
                    { name: 'Membre Expulsé', value: `${targetMember.user.tag}`, inline: true },
                    { name: 'Raison', value: reason }
                )
                .setColor(0xE67E22)
                .setTimestamp();
            await logGuildPublic(guild, guildLog);

            logCreator('MODERATION (KICK)', user, `Target: ${targetMember.user.tag} | Raison: ${reason}`, guild.name);
        }

        // --- COMMANDE /MUTE ---
        if (commandName === 'mute') {
            const targetMember = options.getMember('cible');
            const minutes = options.getInteger('duree');
            const reason = options.getString('raison') || 'Aucune raison';

            if (!targetMember) return interaction.reply({ content: 'Membre introuvable.', ephemeral: true });

            await targetMember.timeout(minutes * 60 * 1000, reason);
            await interaction.reply({ content: `🔇 **${targetMember.user.tag}** en sourdine pour ${minutes} min. Raison: ${reason}` });

            const guildLog = new EmbedBuilder()
                .setTitle('🔇 Log : Sourdine (Mute)')
                .addFields(
                    { name: 'Modérateur', value: `${user.tag}`, inline: true },
                    { name: 'Membre', value: `${targetMember.user.tag}`, inline: true },
                    { name: 'Durée', value: `${minutes} minutes`, inline: true },
                    { name: 'Raison', value: reason }
                )
                .setColor(0x95A5A6)
                .setTimestamp();
            await logGuildPublic(guild, guildLog);

            logCreator('MODERATION (MUTE)', user, `Target: ${targetMember.user.tag} | Durée: ${minutes}m | Raison: ${reason}`, guild.name);
        }

    } catch (err) {
        console.error('Erreur lors de l’exécution :', err);
        await interaction.reply({ content: '❌ Une erreur interne est survenue.', ephemeral: true }).catch(() => {});
    }
});

// --- 6. CONNEXION ---
client.once('ready', async () => {
    console.log(`🤖 n0mit SchoolBot connecté en tant que ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commandsData }
        );
        console.log('✅ Commandes Slash déployées avec succès.');
    } catch (err) {
        console.error('Erreur de déploiement des commandes :', err);
    }
});

client.login(TOKEN);
