const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    EmbedBuilder, 
    ChannelType 
} = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

// --- 1. SERVEUR KEEP-ALIVE POUR RENDER WEB SERVICE ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🤖 n0mit SchoolBot est en ligne et opérationnel !');
});

app.listen(PORT, () => {
    console.log(`🌐 Serveur Web actif sur le port ${PORT}.`);
});

// --- 2. GESTION DE LA BASE DE DONNÉES LOCALE PERSISTANTE ---
const DB_FILE = path.join(__dirname, 'database.json');

// Structure initiale par défaut
let db = {
    configs: {},  // guildId: { logChannelId: "..." }
    bulletins: {} // guildId: { userId: "Appréciation..." }
};

// Charger les données au démarrage s'il existe
if (fs.existsSync(DB_FILE)) {
    try {
        const rawData = fs.readFileSync(DB_FILE, 'utf8');
        db = JSON.parse(rawData);
        console.log('💾 Base de données chargée avec succès !');
    } catch (e) {
        console.error('Erreur lors du chargement de database.json:', e);
    }
}

// Fonction pour sauvegarder les données dans database.json
function saveDatabase() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {
        console.error('Erreur lors de la sauvegarde dans database.json:', e);
    }
}

// --- 3. INITIALISATION DU BOT DISCORD ---
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

// Log privé pour la console Render
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

// Log public sur le serveur
async function logGuildPublic(guild, embed) {
    const logChannelId = db.configs[guild.id]?.logChannelId;
    if (!logChannelId) return;

    try {
        const channel = await guild.channels.fetch(logChannelId);
        if (channel && channel.isTextBased()) {
            await channel.send({ embeds: [embed] });
        }
    } catch (e) {
        console.error(`Impossible d'envoyer le log public sur ${guild.name}:`, e.message);
    }
}

// --- 4. DÉFINITION DES COMMANDES SLASH ---
const commandsData = [
    // Configuration
    new SlashCommandBuilder()
        .setName('setup_logs')
        .setDescription('Définir le salon où seront envoyés les logs du serveur.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => 
            opt.setName('salon')
                .setDescription('Le salon de logs')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)),

    // Convocation RP
    new SlashCommandBuilder()
        .setName('convocation')
        .setDescription('Envoyer une convocation officielle RP à un élève/membre.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addChannelOption(opt => opt.setName('salon').setDescription('Salon où afficher la convocation').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addUserOption(opt => opt.setName('cible').setDescription('La personne convoquée').setRequired(true))
        .addStringOption(opt => opt.setName('lieu').setDescription('Ex: Bureau du Proviseur, Salle 102...').setRequired(true))
        .addStringOption(opt => opt.setName('date').setDescription('Ex: Demain à 14h00, Lundi 12 Octobre...').setRequired(true))
        .addStringOption(opt => opt.setName('raison').setDescription('Raison de la convocation').setRequired(true)),

    // Annonce Importante RP
    new SlashCommandBuilder()
        .setName('annonce_importante')
        .setDescription('Publier une annonce officielle d’établissement.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addChannelOption(opt => opt.setName('salon').setDescription('Salon de destination').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addStringOption(opt => opt.setName('titre').setDescription('Titre de l’annonce').setRequired(true))
        .addStringOption(opt => opt.setName('message').setDescription('Contenu de l’annonce').setRequired(true)),

    // Bulletins RP
    new SlashCommandBuilder()
        .setName('bulletin_change')
        .setDescription('Modifier l’appréciation générale sur le bulletin d’un élève.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
        .addUserOption(opt => opt.setName('élève').setDescription('L’élève ciblé').setRequired(true))
        .addStringOption(opt => opt.setName('appréciation').setDescription('L’appréciation ou note générale').setRequired(true)),

    new SlashCommandBuilder()
        .setName('bulletin_view')
        .setDescription('Consulter le bulletin/appréciation d’un élève.')
        .addUserOption(opt => opt.setName('élève').setDescription('L’élève (laisser vide pour voir le vôtre)').setRequired(false)),

    // Informations
    new SlashCommandBuilder()
        .setName('info_server')
        .setDescription('Afficher les informations officielles de cet établissement.'),

    new SlashCommandBuilder()
        .setName('info_user')
        .setDescription('Afficher les informations détaillées d’un utilisateur.')
        .addUserOption(opt => opt.setName('cible').setDescription('Utilisateur ciblé').setRequired(false)),

    // Communications & Modération
    new SlashCommandBuilder()
        .setName('mp')
        .setDescription('Envoyer un MP officiel à un membre depuis ce serveur.')
        .addUserOption(opt => opt.setName('cible').setDescription('Le destinataire').setRequired(true))
        .addStringOption(opt => opt.setName('message').setDescription('Le contenu du message').setRequired(true)),

    new SlashCommandBuilder()
        .setName('say')
        .setDescription('Faire parler le bot dans le salon.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(opt => opt.setName('message').setDescription('Le message à afficher').setRequired(true)),

    new SlashCommandBuilder()
        .setName('rename_user')
        .setDescription('Changer le pseudo d’un membre.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
        .addUserOption(opt => opt.setName('cible').setDescription('Le membre').setRequired(true))
        .addStringOption(opt => opt.setName('pseudo').setDescription('Nouveau pseudo').setRequired(true)),

    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bannir un membre.')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption(opt => opt.setName('cible').setDescription('Le membre').setRequired(true))
        .addStringOption(opt => opt.setName('raison').setDescription('Raison').setRequired(false)),

    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Expulser un membre.')
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addUserOption(opt => opt.setName('cible').setDescription('Le membre').setRequired(true))
        .addStringOption(opt => opt.setName('raison').setDescription('Raison').setRequired(false)),

    new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mettre un membre en sourdine.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(opt => opt.setName('cible').setDescription('Le membre').setRequired(true))
        .addIntegerOption(opt => opt.setName('duree').setDescription('Durée en minutes').setRequired(true))
        .addStringOption(opt => opt.setName('raison').setDescription('Raison').setRequired(false))
];

// --- 5. ARRIVÉE DU BOT SUR UN SERVEUR ---
client.on('guildCreate', async (guild) => {
    const refugeChannel = guild.channels.cache.find(
        ch => ch.type === ChannelType.GuildText && (ch.name.toLowerCase().includes('n0mit-coresystems') || ch.name.toLowerCase().includes('n0mit'))
    );

    if (refugeChannel) {
        const welcomeEmbed = new EmbedBuilder()
            .setTitle('🏫 n0mit SchoolBot - Refuge Identifié')
            .setDescription('Bot autonome de gestion d’établissement scolaire connecté avec succès.')
            .addFields(
                { name: 'Développeur', value: 'n0mit CoreSystems' },
                { name: 'Configuration', value: 'Utilisez `/setup_logs` pour définir votre salon de modération.' }
            )
            .setColor(0x00FF7F)
            .setTimestamp()
            .setFooter({ text: 'Powered by n0mit CoreSystems • n0mit SchoolBot' });

        await refugeChannel.send({ embeds: [welcomeEmbed] }).catch(() => {});
    }
    logCreator('NOUVEAU SERVEUR', client.user, `Rejoint : ${guild.name} (${guild.id})`, guild.name);
});

// --- 6. EXECUTION DES COMMANDES ---
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, guild, user, channel } = interaction;

    try {
        // --- /SETUP_LOGS ---
        if (commandName === 'setup_logs') {
            const targetChannel = options.getChannel('salon');
            
            if (!db.configs[guild.id]) db.configs[guild.id] = {};
            db.configs[guild.id].logChannelId = targetChannel.id;
            saveDatabase();

            await interaction.reply({ content: `✅ Salon des logs configuré sur <#${targetChannel.id}> !`, ephemeral: true });

            const logEmbed = new EmbedBuilder()
                .setTitle('⚙️ Configuration Mise à Jour')
                .setDescription(`Le salon <#${targetChannel.id}> est maintenant le salon officiel de modération/logs.`)
                .setColor(0x3498DB)
                .setTimestamp()
                .setFooter({ text: 'Powered by n0mit CoreSystems • n0mit SchoolBot' });

            await logGuildPublic(guild, logEmbed);
            logCreator('SETUP_LOGS', user, `Salon de logs : #${targetChannel.name}`, guild.name);
        }

        // --- /CONVOCATION ---
        if (commandName === 'convocation') {
            const targetChannel = options.getChannel('salon');
            const targetUser = options.getUser('cible');
            const lieu = options.getString('lieu');
            const date = options.getString('date');
            const raison = options.getString('raison');

            const convoEmbed = new EmbedBuilder()
                .setTitle('📜 CONVOCATION OFFICIELLE DE L’ÉTABLISSEMENT')
                .setDescription(`**Attention ${targetUser}**, vous êtes convoqué(e) administrativement.`)
                .setColor(0xD35400) // Orange/Rouge administratif
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    { name: '👤 Personne convoquée', value: `${targetUser.tag}`, inline: true },
                    { name: '📍 Lieu du rendez-vous', value: lieu, inline: true },
                    { name: '⏰ Date & Heure', value: date, inline: true },
                    { name: '📋 Motifs de la convocation', value: raison, inline: false },
                    { name: '⚠️ Instruction', value: 'Votre présence est obligatoire. Merci de vous présenter à l’heure fixée.', inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'Powered by n0mit CoreSystems • n0mit SchoolBot' });

            await targetChannel.send({ content: `${targetUser}`, embeds: [convoEmbed] });
            await interaction.reply({ content: `✅ Convocation transmise avec succès dans <#${targetChannel.id}>.`, ephemeral: true });

            logCreator('CONVOCATION', user, `Convoqué: ${targetUser.tag} | Lieu: ${lieu} | Date: ${date}`, guild.name);
        }

        // --- /ANNONCE_IMPORTANTE ---
        if (commandName === 'annonce_importante') {
            const targetChannel = options.getChannel('salon');
            const titre = options.getString('titre');
            const message = options.getString('message');

            const annonceEmbed = new EmbedBuilder()
                .setTitle(`📢 ANNONCE OFFICIELLE : ${titre}`)
                .setDescription(message)
                .setColor(0x9B59B6) // Violet Institutionnel
                .setTimestamp()
                .setFooter({ text: 'Powered by n0mit CoreSystems • n0mit SchoolBot' });

            await targetChannel.send({ embeds: [annonceEmbed] });
            await interaction.reply({ content: `✅ Annonce publiée dans <#${targetChannel.id}>.`, ephemeral: true });

            logCreator('ANNONCE', user, `Titre: ${titre} | Dans #${targetChannel.name}`, guild.name);
        }

        // --- /BULLETIN_CHANGE ---
        if (commandName === 'bulletin_change') {
            const targetUser = options.getUser('élève');
            const appreciation = options.getString('appréciation');

            if (!db.bulletins[guild.id]) db.bulletins[guild.id] = {};
            db.bulletins[guild.id][targetUser.id] = appreciation;
            saveDatabase();

            await interaction.reply({ content: `✅ Bulletin mis à jour pour **${targetUser.tag}**.`, ephemeral: true });

            const logEmbed = new EmbedBuilder()
                .setTitle('📝 Modification de Bulletin School RP')
                .addFields(
                    { name: 'Élève', value: `${targetUser.tag}`, inline: true },
                    { name: 'Auteur', value: `${user.tag}`, inline: true },
                    { name: 'Nouvelle Appréciation', value: appreciation, inline: false }
                )
                .setColor(0x2ECC71)
                .setTimestamp()
                .setFooter({ text: 'Powered by n0mit CoreSystems • n0mit SchoolBot' });

            await logGuildPublic(guild, logEmbed);
            logCreator('BULLETIN_CHANGE', user, `Élève: ${targetUser.tag} | Note/Appréciation: ${appreciation}`, guild.name);
        }

        // --- /BULLETIN_VIEW ---
        if (commandName === 'bulletin_view') {
            const targetUser = options.getUser('élève') || user;
            const appreciation = db.bulletins[guild.id]?.[targetUser.id] || "Aucune appréciation enregistrée pour le moment dans cet établissement.";

            const embed = new EmbedBuilder()
                .setTitle(`📊 Bulletin Scolaire RP : ${targetUser.username}`)
                .setThumbnail(targetUser.displayAvatarURL())
                .setColor(0x34495E)
                .addFields(
                    { name: '👤 Élève', value: `${targetUser.tag}`, inline: true },
                    { name: '🏫 Établissement', value: `${guild.name}`, inline: true },
                    { name: '📝 Appréciation Générale', value: appreciation, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'Powered by n0mit CoreSystems • n0mit SchoolBot' });

            await interaction.reply({ embeds: [embed] });
        }

        // --- /INFO_SERVER ---
        if (commandName === 'info_server') {
            const owner = await guild.fetchOwner();

            const embed = new EmbedBuilder()
                .setTitle(`🏫 Fiche d’Établissement : ${guild.name}`)
                .setThumbnail(guild.iconURL({ dynamic: true }))
                .setColor(0x1ABC9C)
                .addFields(
                    { name: '👑 Direction (Fondateur)', value: `${owner.user.tag}`, inline: true },
                    { name: '👥 Effectif total', value: `${guild.memberCount} membres`, inline: true },
                    { name: '🆔 ID Établissement', value: `\`${guild.id}\``, inline: true },
                    { name: '📅 Date de création', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'Powered by n0mit CoreSystems • n0mit SchoolBot' });

            await interaction.reply({ embeds: [embed] });
        }

        // --- /MP ---
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
                .setTimestamp()
                .setFooter({ text: 'Powered by n0mit CoreSystems • n0mit SchoolBot' });

            try {
                await target.send({ embeds: [embedMP] });
                await interaction.reply({ content: `✅ Message privé envoyé à **${target.tag}**.`, ephemeral: true });

                const guildLog = new EmbedBuilder()
                    .setTitle('📩 Log : Envoi de MP')
                    .addFields(
                        { name: 'Auteur', value: `${user.tag}`, inline: true },
                        { name: 'Destinataire', value: `${target.tag}`, inline: true }
                    )
                    .setColor(0x0099FF)
                    .setTimestamp()
                    .setFooter({ text: 'Powered by n0mit CoreSystems • n0mit SchoolBot' });
                await logGuildPublic(guild, guildLog);

                logCreator('COMMANDE /MP', user, `À: ${target.tag} (${target.id}) | Message: "${msg}"`, guild.name);
            } catch (e) {
                await interaction.reply({ content: `❌ Impossible d'envoyer le MP (DMs fermés).`, ephemeral: true });
            }
        }

        // --- /SAY ---
        if (commandName === 'say') {
            const msg = options.getString('message');

            await channel.send({ content: msg });
            await interaction.reply({ content: '✅ Message publié.', ephemeral: true });

            const guildLog = new EmbedBuilder()
                .setTitle('📢 Log : Commande /say')
                .addFields(
                    { name: 'Auteur', value: `${user.tag}`, inline: true },
                    { name: 'Salon', value: `<#${channel.id}>`, inline: true }
                )
                .setColor(0x2ECC71)
                .setTimestamp()
                .setFooter({ text: 'Powered by n0mit CoreSystems • n0mit SchoolBot' });
            await logGuildPublic(guild, guildLog);

            logCreator('COMMANDE /SAY', user, `Dans #${channel.name} | Message: "${msg}"`, guild.name);
        }

        // --- /INFO_USER ---
        if (commandName === 'info_user') {
            const targetUser = options.getUser('cible') || user;
            const member = await guild.members.fetch(targetUser.id).catch(() => null);

            const roles = member 
                ? member.roles.cache.filter(r => r.id !== guild.id).map(r => r.toString()).join(', ') || 'Aucun rôle'
                : 'Hors du serveur';

            const embed = new EmbedBuilder()
                .setTitle(`👤 Profil : ${targetUser.username}`)
                .setThumbnail(targetUser.displayAvatarURL())
                .setColor(member ? member.displayColor : 0x7289DA)
                .addFields(
                    { name: 'Tag & ID', value: `${targetUser.tag}\n(\`${targetUser.id}\`)`, inline: true },
                    { name: 'Création du compte', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: true }
                )
                .setFooter({ text: 'Powered by n0mit CoreSystems • n0mit SchoolBot' });

            if (member) {
                embed.addFields(
                    { name: 'Arrivée sur le serveur', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: false },
                    { name: 'Rôles', value: roles, inline: false }
                );
            }

            await interaction.reply({ embeds: [embed] });
        }

        // --- /RENAME_USER ---
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
                .setTimestamp()
                .setFooter({ text: 'Powered by n0mit CoreSystems • n0mit SchoolBot' });
            await logGuildPublic(guild, guildLog);

            logCreator('MODERATION (RENAME)', user, `Target: ${targetMember.user.tag} | ${oldName} -> ${newName}`, guild.name);
        }

        // --- /BAN ---
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
                .setTimestamp()
                .setFooter({ text: 'Powered by n0mit CoreSystems • n0mit SchoolBot' });
            await logGuildPublic(guild, guildLog);

            logCreator('MODERATION (BAN)', user, `Target: ${targetUser.tag} | Raison: ${reason}`, guild.name);
        }

        // --- /KICK ---
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
                .setTimestamp()
                .setFooter({ text: 'Powered by n0mit CoreSystems • n0mit SchoolBot' });
            await logGuildPublic(guild, guildLog);

            logCreator('MODERATION (KICK)', user, `Target: ${targetMember.user.tag} | Raison: ${reason}`, guild.name);
        }

        // --- /MUTE ---
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
                .setTimestamp()
                .setFooter({ text: 'Powered by n0mit CoreSystems • n0mit SchoolBot' });
            await logGuildPublic(guild, guildLog);

            logCreator('MODERATION (MUTE)', user, `Target: ${targetMember.user.tag} | Durée: ${minutes}m | Raison: ${reason}`, guild.name);
        }

    } catch (err) {
        console.error('Erreur d’exécution :', err);
        await interaction.reply({ content: '❌ Une erreur interne est survenue.', ephemeral: true }).catch(() => {});
    }
});

// --- 7. CONNEXION ---
client.once('ready', async () => {
    console.log(`🤖 n0mit SchoolBot connecté en tant que ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commandsData }
        );
        console.log('✅ Nouvelles commandes Slash synchronisées sur Discord.');
    } catch (err) {
        console.error('Erreur de déploiement des commandes :', err);
    }
});

client.login(TOKEN);
