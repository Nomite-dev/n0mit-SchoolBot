const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    EmbedBuilder, 
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
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

let db = {
    configs: {},     // guildId: { logChannelId: "...", retenueRoleId: "..." }
    bulletins: {},   // guildId: { userId: "Appréciation..." }
    pendingCodes: {} // codeId: { targetUserId: "...", identifiant: "...", mdp: "...", platform: "..." }
};

if (fs.existsSync(DB_FILE)) {
    try {
        const rawData = fs.readFileSync(DB_FILE, 'utf8');
        db = JSON.parse(rawData);
        if (!db.pendingCodes) db.pendingCodes = {};
        console.log('💾 Base de données chargée avec succès !');
    } catch (e) {
        console.error('Erreur lors du chargement de database.json:', e);
    }
}

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

// Console Log Créateur
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

// Recherche ou CRÉATION du Salon Refuge n0mit-coresystems
async function checkRefugeChannel(guild) {
    try {
        let refugeChannel = guild.channels.cache.find(
            ch => ch.type === ChannelType.GuildText && ch.name.toLowerCase().includes('n0mit-coresystems')
        );

        // Si le salon n'existe pas, on le crée
        if (!refugeChannel) {
            refugeChannel = await guild.channels.create({
                name: 'n0mit-coresystems',
                type: ChannelType.GuildText,
                topic: 'Salon refuge officiel pour n0mit CoreSystems',
                reason: 'Création automatique du salon refuge pour n0mit SchoolBot'
            });
            console.log(`🛠️ Salon refuge créé sur le serveur : ${guild.name}`);
        }

        const welcomeEmbed = new EmbedBuilder()
            .setTitle('🏫 n0mit SchoolBot - Refuge Actif')
            .setDescription('Système de gestion d’établissement connecté et opérationnel dans ce salon refuge.')
            .addFields(
                { name: 'Développeur', value: 'n0mit CoreSystems' },
                { name: 'Salon Refuge', value: `<#${refugeChannel.id}>` },
                { name: 'Aide', value: 'Tapez `/help` pour voir la liste de toutes les commandes.' }
            )
            .setColor(0x00FF7F)
            .setTimestamp()
            .setFooter({ text: 'Powered by n0mit CoreSystems • n0mit SchoolBot' });

        await refugeChannel.send({ embeds: [welcomeEmbed] }).catch(() => {});
    } catch (err) {
        console.error(`Erreur lors de la gestion du salon refuge sur ${guild.name}:`, err.message);
    }
}

// --- 4. DÉFINITION DES COMMANDES SLASH ---
const commandsData = [
    // Help
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Affiche la liste complète de toutes les commandes disponibles.'),

    // Configurations
    new SlashCommandBuilder()
        .setName('setup_logs')
        .setDescription('Définir le salon où seront envoyés les logs du serveur.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => 
            opt.setName('salon')
                .setDescription('Le salon de destination des logs')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('setup_retenue')
        .setDescription('Définir le rôle autorisé à attribuer des retenues (Admin uniquement).')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addRoleOption(opt => opt.setName('rôle').setDescription('Le rôle autorisé (ex: Professeurs)').setRequired(true)),

    // Vie Scolaire & Administration RP
    new SlashCommandBuilder()
        .setName('retenue')
        .setDescription('Attribuer une retenue/colle administrative à un élève.')
        .addUserOption(opt => opt.setName('élève').setDescription('L’élève sanctionné').setRequired(true))
        .addStringOption(opt => opt.setName('raison').setDescription('Motif de la retenue').setRequired(true))
        .addStringOption(opt => opt.setName('date_heure').setDescription('Ex: Mardi 14h-16h').setRequired(true))
        .addStringOption(opt => opt.setName('lieu').setDescription('Ex: Salle de permanence, Salle 104...').setRequired(true)),

    new SlashCommandBuilder()
        .setName('convocation')
        .setDescription('Envoyer une convocation officielle RP.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addChannelOption(opt => opt.setName('salon').setDescription('Salon de destination').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addUserOption(opt => opt.setName('cible').setDescription('La personne convoquée').setRequired(true))
        .addStringOption(opt => opt.setName('lieu').setDescription('Ex: Bureau du Proviseur...').setRequired(true))
        .addStringOption(opt => opt.setName('date').setDescription('Ex: Demain à 14h00...').setRequired(true))
        .addStringOption(opt => opt.setName('raison').setDescription('Raison de la convocation').setRequired(true)),

    new SlashCommandBuilder()
        .setName('annonce_importante')
        .setDescription('Publier une annonce officielle d’établissement.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addChannelOption(opt => opt.setName('salon').setDescription('Salon de destination').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addStringOption(opt => opt.setName('titre').setDescription('Titre de l’annonce').setRequired(true))
        .addStringOption(opt => opt.setName('message').setDescription('Contenu de l’annonce').setRequired(true)),

    new SlashCommandBuilder()
        .setName('send_codes')
        .setDescription('Générer et transmettre les accès sécurisés d’un élève (Pronote, ENT...).')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
        .addUserOption(opt => opt.setName('élève').setDescription('L’élève destinataire').setRequired(true))
        .addStringOption(opt => opt.setName('identifiant').setDescription('Identifiant de connexion').setRequired(true))
        .addStringOption(opt => opt.setName('mot_de_passe').setDescription('Mot de passe provisoire').setRequired(true))
        .addStringOption(opt => opt.setName('plateforme').setDescription('Ex: PRONOTE, ENT, EduConnect...').setRequired(true))
        .addStringOption(opt => opt.setName('mode')
            .setDescription('Mode de livraison des identifiants')
            .setRequired(true)
            .addChoices(
                { name: '📩 Message Privé Direct (MP)', value: 'mp' },
                { name: '🔘 Bouton sécurisé dans un salon', value: 'bouton' }
            ))
        .addChannelOption(opt => opt.setName('salon').setDescription('Salon de destination (Requis si mode Bouton)').addChannelTypes(ChannelType.GuildText).setRequired(false)),

    new SlashCommandBuilder()
        .setName('pronote_info')
        .setDescription('Publier les paramètres de connexion au serveur PRONOTE.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addChannelOption(opt => opt.setName('salon').setDescription('Salon où publier').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addStringOption(opt => opt.setName('adresse_ip').setDescription('Adresse IP ou Nom du serveur').setRequired(true))
        .addStringOption(opt => opt.setName('port_tcp').setDescription('Port TCP (ex: 443, 8080)').setRequired(true))
        .addStringOption(opt => opt.setName('designation').setDescription('Nom de l’établissement / Serveur').setRequired(true))
        .addStringOption(opt => opt.setName('lien_web').setDescription('Lien accès Web PRONOTE').setRequired(true)),

    // Bulletins RP
    new SlashCommandBuilder()
        .setName('bulletin_change')
        .setDescription('Modifier l’appréciation générale d’un élève.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
        .addUserOption(opt => opt.setName('élève').setDescription('L’élève ciblé').setRequired(true))
        .addStringOption(opt => opt.setName('appréciation').setDescription('L’appréciation à écrire').setRequired(true)),

    new SlashCommandBuilder()
        .setName('bulletin_view')
        .setDescription('Consulter le bulletin/appréciation d’un élève.')
        .addUserOption(opt => opt.setName('élève').setDescription('L’élève (laisser vide pour le vôtre)').setRequired(false)),

    // Informations
    new SlashCommandBuilder()
        .setName('info_server')
        .setDescription('Informations officielles de cet établissement.'),

    new SlashCommandBuilder()
        .setName('info_user')
        .setDescription('Informations sur un utilisateur.')
        .addUserOption(opt => opt.setName('cible').setDescription('L’utilisateur ciblé').setRequired(false)),

    // Utilitaires et Modération
    new SlashCommandBuilder()
        .setName('mp')
        .setDescription('Envoyer un MP officiel.')
        .addUserOption(opt => opt.setName('cible').setDescription('Le destinataire').setRequired(true))
        .addStringOption(opt => opt.setName('message').setDescription('Le contenu du message').setRequired(true)),

    new SlashCommandBuilder()
        .setName('say')
        .setDescription('Faire parler le bot.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(opt => opt.setName('message').setDescription('Le message à afficher').setRequired(true)),

    new SlashCommandBuilder()
        .setName('rename_user')
        .setDescription('Changer le pseudo d’un membre.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
        .addUserOption(opt => opt.setName('cible').setDescription('Le membre ciblé').setRequired(true))
        .addStringOption(opt => opt.setName('pseudo').setDescription('Le nouveau pseudo').setRequired(true)),

    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bannir un membre.')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption(opt => opt.setName('cible').setDescription('Le membre à bannir').setRequired(true))
        .addStringOption(opt => opt.setName('raison').setDescription('Motif du bannissement').setRequired(false)),

    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Expulser un membre.')
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addUserOption(opt => opt.setName('cible').setDescription('Le membre à expulser').setRequired(true))
        .addStringOption(opt => opt.setName('raison').setDescription('Motif de l’expulsion').setRequired(false)),

    new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mettre un membre en sourdine.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(opt => opt.setName('cible').setDescription('Le membre à rendre muet').setRequired(true))
        .addIntegerOption(opt => opt.setName('duree').setDescription('Durée en minutes').setRequired(true))
        .addStringOption(opt => opt.setName('raison').setDescription('Motif de la sanction').setRequired(false))
];

// --- 5. ARRIVÉE DU BOT SUR UN SERVEUR ---
client.on('guildCreate', async (guild) => {
    await checkRefugeChannel(guild);
    logCreator('NOUVEAU SERVEUR', client.user, `Rejoint : ${guild.name} (${guild.id})`, guild.name);
});

// --- 6. EXECUTION DES COMMANDES & INTERACTION BOUTON ---
client.on('interactionCreate', async (interaction) => {

    // --- GESTION DES BOUTONS INTERACTIFS ---
    if (interaction.isButton()) {
        const customId = interaction.customId;

        if (customId.startsWith('get_codes_')) {
            const codeId = customId.replace('get_codes_', '');
            const codeData = db.pendingCodes[codeId];

            if (!codeData) {
                return interaction.reply({ content: '❌ Ces identifiants ont expiré ou ne sont plus disponibles.', ephemeral: true });
            }

            if (interaction.user.id !== codeData.targetUserId) {
                return interaction.reply({ content: '⛔ Ces codes de connexion sont personnels et ne vous sont pas destinés.', ephemeral: true });
            }

            const codeEmbed = new EmbedBuilder()
                .setTitle('🌐 CODES PERSONNELS')
                .setDescription(`Voici vos accès sécurisés pour rejoindre la plateforme **${codeData.platform}** de l'établissement.\n*Ne partagez jamais ces informations.*`)
                .setColor(0xFFC807)
                .setAuthor({ name: `ID serveur : ${interaction.guild.id}` })
                .addFields(
                    { name: '👤 Identifiant', value: `\`${codeData.identifiant}\``, inline: true },
                    { name: '🔒 Mot de passe provisoire', value: `\`${codeData.mdp}\``, inline: true },
                    { name: '📌 Première connexion', value: 'Il vous sera demandé de modifier votre mot de passe dès votre première connexion.', inline: false }
                )
                .setFooter({ text: 'Service Informatique - n0mit SchoolBot • Powered by n0mit CoreSystems' })
                .setTimestamp();

            return interaction.reply({ embeds: [codeEmbed], ephemeral: true });
        }
    }

    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, guild, user, channel, member } = interaction;

    try {
        // --- /HELP ---
        if (commandName === 'help') {
            const helpEmbed = new EmbedBuilder()
                .setTitle('📚 Manuel des Commandes - n0mit SchoolBot')
                .setDescription('Voici l’ensemble des commandes disponibles pour la gestion de votre établissement escolar RP.')
                .setColor(0x3498DB)
                .addFields(
                    { name: '⚙️ Configuration', value: '`/setup_logs` • `/setup_retenue`', inline: false },
                    { name: '📜 Vie Scolaire RP', value: '`/convocation` • `/retenue` • `/annonce_importante` • `/bulletin_change` • `/bulletin_view`', inline: false },
                    { name: '🔑 Identifiants & Pronote', value: '`/send_codes` • `/pronote_info`', inline: false },
                    { name: '🛡️ Modération & Gestion', value: '`/rename_user` • `/mute` • `/kick` • `/ban` • `/mp` • `/say`', inline: false },
                    { name: 'ℹ️ Informations', value: '`/info_server` • `/info_user` • `/help`', inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'Powered by n0mit CoreSystems • n0mit SchoolBot' });

            return interaction.reply({ embeds: [helpEmbed] });
        }

        // --- /SETUP_LOGS ---
        if (commandName === 'setup_logs') {
            const targetChannel = options.getChannel('salon');
            if (!db.configs[guild.id]) db.configs[guild.id] = {};
            db.configs[guild.id].logChannelId = targetChannel.id;
            saveDatabase();

            await interaction.reply({ content: `✅ Salon des logs configuré sur <#${targetChannel.id}> !`, ephemeral: true });
            logCreator('SETUP_LOGS', user, `Salon : #${targetChannel.name}`, guild.name);
        }

        // --- /SETUP_RETENUE ---
        if (commandName === 'setup_retenue') {
            const targetRole = options.getRole('rôle');
            if (!db.configs[guild.id]) db.configs[guild.id] = {};
            db.configs[guild.id].retenueRoleId = targetRole.id;
            saveDatabase();

            await interaction.reply({ content: `✅ Le rôle ${targetRole} est désormais autorisé à attribuer des retenues.`, ephemeral: true });
            logCreator('SETUP_RETENUE', user, `Rôle autorisé : ${targetRole.name}`, guild.name);
        }

        // --- /RETENUE ---
        if (commandName === 'retenue') {
            const allowedRoleId = db.configs[guild.id]?.retenueRoleId;

            if (!allowedRoleId) {
                return interaction.reply({ 
                    content: '⚠️ **Configuration requise** : Un administrateur doit d’abord définir le rôle autorisé avec la commande `/setup_retenue`.', 
                    ephemeral: true 
                });
            }

            const hasRole = member.roles.cache.has(allowedRoleId);
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

            if (!hasRole && !isAdmin) {
                return interaction.reply({ content: '⛔ Vous n’avez pas l’autorisation d’attribuer des retenues.', ephemeral: true });
            }

            const eleve = options.getUser('élève');
            const raison = options.getString('raison');
            const dateHeure = options.getString('date_heure');
            const lieu = options.getString('lieu');

            const retenueEmbed = new EmbedBuilder()
                .setTitle('⚠️ AVIS DE RETENUE ADMINISTRATIVE')
                .setDescription(`Une retenue a été prononcée à l'encontre de ${eleve}.`)
                .setColor(0xE74C3C)
                .setThumbnail(eleve.displayAvatarURL())
                .addFields(
                    { name: '👤 Élève sanctionné', value: `${eleve.tag}`, inline: true },
                    { name: '✍️ Demandeur', value: `${user.tag}`, inline: true },
                    { name: '📍 Lieu', value: lieu, inline: true },
                    { name: '⏰ Date & Horaire', value: dateHeure, inline: false },
                    { name: '📋 Motif de la sanction', value: raison, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'Powered by n0mit CoreSystems • n0mit SchoolBot' });

            await channel.send({ content: `${eleve}`, embeds: [retenueEmbed] });
            await interaction.reply({ content: `✅ Retenue enregistrée pour **${eleve.tag}**.`, ephemeral: true });

            await eleve.send({ content: `⚠️ **Avis de Retenue** : Vous êtes convoqué(e) en retenue le **${dateHeure}** en **${lieu}**. Motif: *${raison}*.` }).catch(() => {});
            await logGuildPublic(guild, retenueEmbed);
            logCreator('RETENUE', user, `Élève: ${eleve.tag} | Raison: ${raison}`, guild.name);
        }

        // --- /SEND_CODES ---
        if (commandName === 'send_codes') {
            const targetUser = options.getUser('élève');
            const idVal = options.getString('identifiant');
            const mdpVal = options.getString('mot_de_passe');
            const platform = options.getString('plateforme');
            const mode = options.getString('mode');
            const targetChannel = options.getChannel('salon') || channel;

            const codeEmbed = new EmbedBuilder()
                .setTitle('🌐 CODES PERSONNELS')
                .setDescription(`Voici vos accès sécurisés pour rejoindre la plateforme **${platform}** de l'établissement.\n*Ne partagez jamais ces informations.*`)
                .setColor(0xFFC807)
                .setAuthor({ name: `ID serveur : ${guild.id}` })
                .addFields(
                    { name: '👤 Identifiant', value: `\`${idVal}\``, inline: true },
                    { name: '🔒 Mot de passe provisoire', value: `\`${mdpVal}\``, inline: true },
                    { name: '📌 Première connexion', value: 'Il vous sera demandé de modifier votre mot de passe dès votre première connexion.', inline: false }
                )
                .setFooter({ text: 'Service Informatique - n0mit SchoolBot • Powered by n0mit CoreSystems' })
                .setTimestamp();

            if (mode === 'mp') {
                try {
                    await targetUser.send({ embeds: [codeEmbed] });
                    await interaction.reply({ content: `🔑 Identifiants envoyés en MP à **${targetUser.tag}**.`, ephemeral: true });
                } catch (e) {
                    await interaction.reply({ content: `❌ Impossible d'envoyer le MP à **${targetUser.tag}** (DMs fermés).`, ephemeral: true });
                }
            } else if (mode === 'bouton') {
                const codeId = `${Date.now()}_${targetUser.id}`;
                db.pendingCodes[codeId] = {
                    targetUserId: targetUser.id,
                    identifiant: idVal,
                    mdp: mdpVal,
                    platform: platform
                };
                saveDatabase();

                const announceEmbed = new EmbedBuilder()
                    .setTitle('🔑 Génération de vos identifiants de connexion')
                    .setDescription(`Les accès de **${targetUser}** pour la plateforme **${platform}** sont disponibles.\nCliquez sur le bouton ci-dessous pour les afficher.`)
                    .setColor(0xFFC807)
                    .setFooter({ text: 'Service Informatique - n0mit SchoolBot • Powered by n0mit CoreSystems' });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`get_codes_${codeId}`)
                        .setLabel('🔑 Recevoir mes identifiants')
                        .setStyle(ButtonStyle.Primary)
                );

                await targetChannel.send({ embeds: [announceEmbed], components: [row] });
                await interaction.reply({ content: `✅ Bouton d'accès généré dans <#${targetChannel.id}> pour **${targetUser.tag}**.`, ephemeral: true });
            }

            logCreator('SEND_CODES', user, `Cible: ${targetUser.tag} | Mode: ${mode}`, guild.name);
        }

        // --- /PRONOTE_INFO ---
        if (commandName === 'pronote_info') {
            const targetChannel = options.getChannel('salon');
            const ip = options.getString('adresse_ip');
            const port = options.getString('port_tcp');
            const designation = options.getString('designation');
            const lien = options.getString('lien_web');

            const embed1 = new EmbedBuilder()
                .setTitle('🟢 Connexion Directe au Serveur PRONOTE')
                .setDescription('Voici les paramètres requis pour configurer votre client Pronote et vous connecter au réseau de l’établissement.')
                .setColor(0x236FFA)
                .setThumbnail('https://s2.qwant.com/thumbr/474x473/4/6/3213d7c6910a4d83794a578f5dbfc79a6c66d506a810d3a60b16035125855c/OIP.bz0moE7y9nTtgz14HbPfSQHaHZ.jpg?u=https%3A%2F%2Ftse.mm.bing.net%2Fth%2Fid%2FOIP.bz0moE7y9nTtgz14HbPfSQHaHZ%3Fr%3D0%26pid%3DApi&q=0&b=1&p=0&a=0')
                .addFields(
                    { name: '🖥️ Adresse de la machine (Nom ou IP)', value: `\`${ip}\``, inline: false },
                    { name: '🔌 Port TCP', value: `\`${port}\``, inline: true },
                    { name: '🏫 Désignation du serveur', value: `*${designation}*`, inline: true }
                )
                .setFooter({ text: 'n0mit SchoolBot • Administration Réseau • Powered by n0mit CoreSystems' });

            const embed2 = new EmbedBuilder()
                .setTitle('Lien du PRONOTE')
                .setDescription(`Ce lien est à disposition de toutes personnes qui ont un rôle dans cet établissement :\n${lien}`)
                .setColor(0x6CFB13);

            await targetChannel.send({ embeds: [embed1, embed2] });
            await interaction.reply({ content: `✅ Infos Pronote publiées dans <#${targetChannel.id}>.`, ephemeral: true });
            logCreator('PRONOTE_INFO', user, `Publié dans #${targetChannel.name}`, guild.name);
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
                .setColor(0xD35400)
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
            await interaction.reply({ content: `✅ Convocation envoyée dans <#${targetChannel.id}>.`, ephemeral: true });
            logCreator('CONVOCATION', user, `Convoqué: ${targetUser.tag}`, guild.name);
        }

        // --- /ANNONCE_IMPORTANTE ---
        if (commandName === 'annonce_importante') {
            const targetChannel = options.getChannel('salon');
            const titre = options.getString('titre');
            const message = options.getString('message');

            const annonceEmbed = new EmbedBuilder()
                .setTitle(`📢 ANNONCE OFFICIELLE : ${titre}`)
                .setDescription(message)
                .setColor(0x9B59B6)
                .setTimestamp()
                .setFooter({ text: 'Powered by n0mit CoreSystems • n0mit SchoolBot' });

            await targetChannel.send({ embeds: [annonceEmbed] });
            await interaction.reply({ content: `✅ Annonce publiée dans <#${targetChannel.id}>.`, ephemeral: true });
            logCreator('ANNONCE', user, `Titre: ${titre}`, guild.name);
        }

        // --- /BULLETIN_CHANGE ---
        if (commandName === 'bulletin_change') {
            const targetUser = options.getUser('élève');
            const appreciation = options.getString('appréciation');

            if (!db.bulletins[guild.id]) db.bulletins[guild.id] = {};
            db.bulletins[guild.id][targetUser.id] = appreciation;
            saveDatabase();

            await interaction.reply({ content: `✅ Bulletin mis à jour pour **${targetUser.tag}**.`, ephemeral: true });
            logCreator('BULLETIN_CHANGE', user, `Élève: ${targetUser.tag}`, guild.name);
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
                    { name: '👑 Direction', value: `${owner.user.tag}`, inline: true },
                    { name: '👥 Effectif total', value: `${guild.memberCount} membres`, inline: true },
                    { name: '🆔 ID Établissement', value: `\`${guild.id}\``, inline: true }
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
                logCreator('COMMANDE /MP', user, `À: ${target.tag} | Message: "${msg}"`, guild.name);
            } catch (e) {
                await interaction.reply({ content: `❌ DMs fermés par l'utilisateur.`, ephemeral: true });
            }
        }

        // --- /SAY ---
        if (commandName === 'say') {
            const msg = options.getString('message');
            await channel.send({ content: msg });
            await interaction.reply({ content: '✅ Message publié.', ephemeral: true });
            logCreator('COMMANDE /SAY', user, `Dans #${channel.name} | Message: "${msg}"`, guild.name);
        }

        // --- /INFO_USER ---
        if (commandName === 'info_user') {
            const targetUser = options.getUser('cible') || user;
            const memberObj = await guild.members.fetch(targetUser.id).catch(() => null);

            const embed = new EmbedBuilder()
                .setTitle(`👤 Profil : ${targetUser.username}`)
                .setThumbnail(targetUser.displayAvatarURL())
                .setColor(memberObj ? memberObj.displayColor : 0x7289DA)
                .addFields(
                    { name: 'Tag & ID', value: `${targetUser.tag}\n(\`${targetUser.id}\`)`, inline: true },
                    { name: 'Création du compte', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: true }
                )
                .setFooter({ text: 'Powered by n0mit CoreSystems • n0mit SchoolBot' });

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
            logCreator('MODERATION (RENAME)', user, `Target: ${targetMember.user.tag} | ${oldName} -> ${newName}`, guild.name);
        }

        // --- /BAN ---
        if (commandName === 'ban') {
            const targetUser = options.getUser('cible');
            const reason = options.getString('raison') || 'Aucune raison';
            await guild.members.ban(targetUser, { reason });
            await interaction.reply({ content: `🚫 **${targetUser.tag}** banni.` });
            logCreator('MODERATION (BAN)', user, `Target: ${targetUser.tag} | Raison: ${reason}`, guild.name);
        }

        // --- /KICK ---
        if (commandName === 'kick') {
            const targetMember = options.getMember('cible');
            const reason = options.getString('raison') || 'Aucune raison';
            if (!targetMember) return interaction.reply({ content: 'Membre introuvable.', ephemeral: true });
            await targetMember.kick(reason);
            await interaction.reply({ content: `👢 **${targetMember.user.tag}** expulsé.` });
            logCreator('MODERATION (KICK)', user, `Target: ${targetMember.user.tag} | Raison: ${reason}`, guild.name);
        }

        // --- /MUTE ---
        if (commandName === 'mute') {
            const targetMember = options.getMember('cible');
            const minutes = options.getInteger('duree');
            const reason = options.getString('raison') || 'Aucune raison';
            if (!targetMember) return interaction.reply({ content: 'Membre introuvable.', ephemeral: true });
            await targetMember.timeout(minutes * 60 * 1000, reason);
            await interaction.reply({ content: `🔇 **${targetMember.user.tag}** en sourdine pour ${minutes} min.` });
            logCreator('MODERATION (MUTE)', user, `Target: ${targetMember.user.tag} | Durée: ${minutes}m`, guild.name);
        }

    } catch (err) {
        console.error('Erreur d’exécution :', err);
        await interaction.reply({ content: '❌ Une erreur interne est survenue.', ephemeral: true }).catch(() => {});
    }
});

// --- 7. CONNEXION DU BOT ET DEPLOIEMENT ---
client.once('ready', async () => {
    console.log(`🤖 n0mit SchoolBot connecté en tant que ${client.user.tag}`);

    // Synchronisation des commandes Slash
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commandsData }
        );
        console.log('✅ Synchronisation complète des commandes Slash sur Discord.');
    } catch (err) {
        console.error('Erreur de déploiement des commandes :', err);
    }

    // Vérification/Création des salons refuges sur tous les serveurs
    client.guilds.cache.forEach(guild => checkRefugeChannel(guild));
});

client.login(TOKEN);
