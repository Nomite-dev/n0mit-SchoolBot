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
    ButtonStyle,
    ActivityType
} = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

// --- 0. CONSTANTES ET GESTION L'OWNER BOT ---
const OWNER_ID = process.env.OWNER_ID || "VOTRE_ID_DISCORD_ICI"; // L'owner a TOUS les droits absolus

// Helper pour vérifier si un membre est Admin ou Owner du bot
function checkAdminOrOwner(member, userId) {
    if (userId === OWNER_ID) return true;
    if (member && member.permissions) {
        return member.permissions.has(PermissionFlagsBits.Administrator);
    }
    return false;
}

// --- 1. SERVEUR KEEP-ALIVE ET PAGE STATUS POUR RENDER WEB SERVICE ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    const uptimeSeconds = Math.floor(process.uptime());
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;
    
    const botStatus = client.user ? '🟢 En Ligne' : '🔴 Connexion en cours...';
    const serverCount = client.guilds ? client.guilds.cache.size : 0;
    const userCount = client.guilds ? client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0) : 0;

    res.send(`
        <!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Status - n0mit SchoolBot</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .card { background-color: #1e293b; border-radius: 12px; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #334155; text-align: center; max-width: 400px; width: 100%; }
                h1 { color: #38bdf8; font-size: 24px; margin-bottom: 8px; }
                .status { display: inline-block; padding: 6px 12px; border-radius: 20px; background-color: #064e3b; color: #34d399; font-weight: bold; margin-bottom: 20px; }
                .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
                .stat-box { background-color: #0f172a; padding: 12px; border-radius: 8px; border: 1px solid #1e293b; }
                .stat-title { font-size: 12px; color: #94a3b8; text-transform: uppercase; }
                .stat-value { font-size: 18px; font-weight: bold; color: #f1f5f9; margin-top: 4px; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>🤖 n0mit SchoolBot</h1>
                <div class="status">${botStatus}</div>
                <p style="color: #94a3b8; font-size: 14px;">Système de gestion scolaire opérationnel</p>
                <div class="stat-grid">
                    <div class="stat-box">
                        <div class="stat-title">Serveurs</div>
                        <div class="stat-value">${serverCount}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-title">Utilisateurs</div>
                        <div class="stat-value">${userCount}</div>
                    </div>
                </div>
                <div class="stat-box" style="margin-top: 12px;">
                    <div class="stat-title">Temps d'activité</div>
                    <div class="stat-value">${hours}h ${minutes}m ${seconds}s</div>
                </div>
            </div>
        </body>
        </html>
    `);
});

app.listen(PORT, () => {
    console.log(`🌐 Serveur Web actif sur le port ${PORT}.`);
});

// --- 2. GESTION DE LA BASE DE DONNÉES LOCALE PERSISTANTE ---
const DB_FILE = path.join(__dirname, 'database.json');

let db = {
    configs: {},         // guildId: { logChannelId: "...", retenueRoleId: "...", refugeWelcomeSent: true, customEdt: "..." }
    bulletins: {},       // guildId: { userId: "Appréciation..." }
    pendingCodes: {},    // codeId: { targetUserId: "...", identifiant: "...", mdp: "...", platform: "..." }
    restrictedUsers: {}  // userId: { reason: "...", restrictedAt: "ISO Date" }
};

if (fs.existsSync(DB_FILE)) {
    try {
        const rawData = fs.readFileSync(DB_FILE, 'utf8');
        db = JSON.parse(rawData);
        if (!db.pendingCodes) db.pendingCodes = {};
        if (!db.configs) db.configs = {};
        if (!db.bulletins) db.bulletins = {};
        if (!db.restrictedUsers) db.restrictedUsers = {};
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
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const STAFF_KEY = process.env.BOT_STAFF_KEY || "ADMIN_SECRET_KEY";

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

// Gestion du Salon Refuge
async function checkRefugeChannel(guild, isNewJoin = false) {
    try {
        if (!db.configs[guild.id]) db.configs[guild.id] = {};

        let refugeChannel = guild.channels.cache.find(
            ch => ch.type === ChannelType.GuildText && ch.name.toLowerCase().includes('n0mit-coresystems')
        );

        if (!refugeChannel) {
            refugeChannel = await guild.channels.create({
                name: 'n0mit-coresystems',
                type: ChannelType.GuildText,
                topic: 'Salon refuge officiel pour n0mit CoreSystems',
                reason: 'Création automatique du salon refuge pour n0mit SchoolBot'
            });
            console.log(`🛠️ Salon refuge créé sur : ${guild.name}`);
        }

        if (isNewJoin) {
            const welcomeEmbed = new EmbedBuilder()
                .setTitle('🏫 n0mit SchoolBot - Bienvenue !')
                .setDescription('Merci d\'avoir ajouté **n0mit SchoolBot** à votre serveur ! Le système autonome de gestion scolaire est prêt à l\'emploi.')
                .addFields(
                    { name: 'Développeur', value: 'n0mit CoreSystems' },
                    { name: 'Salon Refuge', value: `<#${refugeChannel.id}>` },
                    { name: 'Support / Serveur', value: '[Rejoindre Discord](https://discord.gg/44erEhr8V2)' },
                    { name: 'Premières commandes', value: '• `/setup_logs` pour configurer le salon des logs.\n• `/setup_retenue` pour définir le rôle de gestion des retenues.\n• `/setup_edt` pour personnaliser l\'emploi du temps.\n• `/help` pour afficher toutes les commandes.' }
                )
                .setColor(0x00FF7F)
                .setTimestamp()
                .setFooter({ text: 'Powered by n0mit CoreSystems • n0mit SchoolBot' });

            await refugeChannel.send({ embeds: [welcomeEmbed] }).catch(() => {});
            
            db.configs[guild.id].refugeWelcomeSent = true;
            saveDatabase();
        }
    } catch (err) {
        console.error(`Erreur salon refuge sur ${guild.name}:`, err.message);
    }
}

// --- 4. DÉFINITION DES COMMANDES SLASH ---
const commandsData = [
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Affiche le manuel complet des commandes du bot.'),

    new SlashCommandBuilder()
        .setName('setup_logs')
        .setDescription('Définir le salon des logs de modération et de vie scolaire.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('salon').setDescription('Salon de logs').addChannelTypes(ChannelType.GuildText).setRequired(true)),

    new SlashCommandBuilder()
        .setName('setup_retenue')
        .setDescription('Définir le rôle autorisé à coller/mettre en retenue des élèves.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addRoleOption(opt => opt.setName('rôle').setDescription('Rôle autorisé (ex: Professeurs, Staff)').setRequired(true)),

    new SlashCommandBuilder()
        .setName('setup_edt')
        .setDescription('Personnaliser le texte de l’emploi du temps du serveur.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('contenu').setDescription('Le texte ou planning personnalisé à afficher').setRequired(true)),

    new SlashCommandBuilder()
        .setName('create_embed')
        .setDescription('Créer et envoyer un Embed personnalisé dans un salon.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addChannelOption(opt => opt.setName('salon').setDescription('Salon de destination').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addStringOption(opt => opt.setName('titre').setDescription('Titre de l\'embed').setRequired(true))
        .addStringOption(opt => opt.setName('description').setDescription('Contenu / texte de l\'embed').setRequired(true))
        .addStringOption(opt => opt.setName('couleur').setDescription('Code Couleur HEX (ex: #3498db ou Rouge)').setRequired(false))
        .addStringOption(opt => opt.setName('image').setDescription('Lien URL d\'une grande image').setRequired(false))
        .addStringOption(opt => opt.setName('thumbnail').setDescription('Lien URL d\'une miniature (en haut à droite)').setRequired(false))
        .addStringOption(opt => opt.setName('footer').setDescription('Texte de bas de page').setRequired(false)),

    new SlashCommandBuilder()
        .setName('restreindre')
        .setDescription('Restreindre un utilisateur globalement (Staff Bot uniquement).')
        .addUserOption(opt => opt.setName('cible').setDescription('L’utilisateur à restreindre').setRequired(true))
        .addStringOption(opt => opt.setName('cle_secrete').setDescription('Clé secrète du Staff').setRequired(true))
        .addStringOption(opt => opt.setName('raison').setDescription('Motif de la restriction').setRequired(false)),

    new SlashCommandBuilder()
        .setName('debloquer')
        .setDescription('Lever la restriction d’un utilisateur (Staff Bot uniquement).')
        .addUserOption(opt => opt.setName('cible').setDescription('L’utilisateur à débannir du bot').setRequired(true))
        .addStringOption(opt => opt.setName('cle_secrete').setDescription('Clé secrète du Staff').setRequired(true)),

    new SlashCommandBuilder()
        .setName('avertissement')
        .setDescription('Donner un avertissement disciplinaire RP à un élève.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addUserOption(opt => opt.setName('élève').setDescription('L’élève visé').setRequired(true))
        .addStringOption(opt => opt.setName('motif').setDescription('Raison de l’avertissement').setRequired(true)),

    new SlashCommandBuilder()
        .setName('emploi_du_temps')
        .setDescription('Afficher la grille des cours de l’établissement.'),

    new SlashCommandBuilder()
        .setName('retenue')
        .setDescription('Attribuer une retenue/colle administrative à un élève.')
        .addUserOption(opt => opt.setName('élève').setDescription('L’élève sanctionné').setRequired(true))
        .addStringOption(opt => opt.setName('raison').setDescription('Motif de la sanction').setRequired(true))
        .addStringOption(opt => opt.setName('date_heure').setDescription('Ex: Mardi 14h-16h').setRequired(true))
        .addStringOption(opt => opt.setName('lieu').setDescription('Ex: Salle de permanence, Salle 104').setRequired(true)),

    new SlashCommandBuilder()
        .setName('absence')
        .setDescription('Signaler le retard ou l’absence d’un élève.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addUserOption(opt => opt.setName('élève').setDescription('L’élève concerné').setRequired(true))
        .addStringOption(opt => opt.setName('type')
            .setDescription('Type de signalement')
            .setRequired(true)
            .addChoices(
                { name: '❌ Absence Injustifiée', value: 'Absence Injustifiée' },
                { name: '⏰ Retard en cours', value: 'Retard' }
            ))
        .addStringOption(opt => opt.setName('motif').setDescription('Durée ou raison de l’absence/retard').setRequired(true)),

    new SlashCommandBuilder()
        .setName('convocation')
        .setDescription('Envoyer une convocation officielle RP.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addChannelOption(opt => opt.setName('salon').setDescription('Salon où publier la convocation').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addUserOption(opt => opt.setName('cible').setDescription('La personne convoquée').setRequired(true))
        .addStringOption(opt => opt.setName('lieu').setDescription('Ex: Bureau du Proviseur').setRequired(true))
        .addStringOption(opt => opt.setName('date').setDescription('Ex: Demain à 14h00').setRequired(true))
        .addStringOption(opt => opt.setName('raison').setDescription('Raison de la convocation').setRequired(true)),

    new SlashCommandBuilder()
        .setName('annonce_importante')
        .setDescription('Publier une annonce officielle d’établissement.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addChannelOption(opt => opt.setName('salon').setDescription('Salon de destination').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addStringOption(opt => opt.setName('titre').setDescription('Titre de l’annonce').setRequired(true))
        .addStringOption(opt => opt.setName('message').setDescription('Contenu de l’annonce').setRequired(true)),

    new SlashCommandBuilder()
        .setName('sondage')
        .setDescription('Créer une consultation ou un vote officiel de l’établissement.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addChannelOption(opt => opt.setName('salon').setDescription('Salon où poster le sondage').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addStringOption(opt => opt.setName('titre').setDescription('Sujet du sondage').setRequired(true))
        .addStringOption(opt => opt.setName('description').setDescription('Explications ou question posée').setRequired(true)),

    new SlashCommandBuilder()
        .setName('send_codes')
        .setDescription('Transmettre les accès sécurisés d’un élève (Pronote, ENT...).')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
        .addUserOption(opt => opt.setName('élève').setDescription('L’élève destinataire').setRequired(true))
        .addStringOption(opt => opt.setName('identifiant').setDescription('Identifiant de connexion').setRequired(true))
        .addStringOption(opt => opt.setName('mot_de_passe').setDescription('Mot de passe provisoire').setRequired(true))
        .addStringOption(opt => opt.setName('plateforme').setDescription('Ex: PRONOTE, ENT...').setRequired(true))
        .addStringOption(opt => opt.setName('mode')
            .setDescription('Mode de distribution')
            .setRequired(true)
            .addChoices(
                { name: '📩 Message Privé Direct (MP)', value: 'mp' },
                { name: '🔘 Bouton sécurisé dans un salon', value: 'bouton' }
            ))
        .addChannelOption(opt => opt.setName('salon').setDescription('Salon de destination (Mode Bouton)').addChannelTypes(ChannelType.GuildText).setRequired(false)),

    new SlashCommandBuilder()
        .setName('pronote_info')
        .setDescription('Publier les paramètres de connexion au serveur PRONOTE.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addChannelOption(opt => opt.setName('salon').setDescription('Salon de destination').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addStringOption(opt => opt.setName('adresse_ip').setDescription('Adresse IP ou Nom de la machine').setRequired(true))
        .addStringOption(opt => opt.setName('port_tcp').setDescription('Port TCP (ex: 443)').setRequired(true))
        .addStringOption(opt => opt.setName('designation').setDescription('Nom de l’établissement / Serveur').setRequired(true))
        .addStringOption(opt => opt.setName('lien_web').setDescription('Lien accès Web PRONOTE').setRequired(true)),

    new SlashCommandBuilder()
        .setName('bulletin_change')
        .setDescription('Modifier l’appréciation générale d’un élève.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
        .addUserOption(opt => opt.setName('élève').setDescription('L’élève ciblé').setRequired(true))
        .addStringOption(opt => opt.setName('appréciation').setDescription('Contenu de l’appréciation').setRequired(true)),

    new SlashCommandBuilder()
        .setName('bulletin_view')
        .setDescription('Consulter le bulletin RP d’un élève.')
        .addUserOption(opt => opt.setName('élève').setDescription('L’élève ciblé (laisser vide pour soi)').setRequired(false)),

    new SlashCommandBuilder().setName('info_server').setDescription('Informations sur l’établissement actuel.'),
    new SlashCommandBuilder().setName('info_user').setDescription('Informations détaillées sur un utilisateur.').addUserOption(opt => opt.setName('cible').setDescription('Utilisateur').setRequired(false)),

    new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Purger un nombre de messages dans ce salon.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addIntegerOption(opt => opt.setName('nombre').setDescription('Nombre de messages à supprimer (1 à 100)').setMinValue(1).setMaxValue(100).setRequired(true)),

    new SlashCommandBuilder()
        .setName('mp')
        .setDescription('Envoyer un message privé simple à un membre via le bot.')
        .addUserOption(opt => opt.setName('cible').setDescription('Le destinataire').setRequired(true))
        .addStringOption(opt => opt.setName('message').setDescription('Le contenu du message').setRequired(true)),

    new SlashCommandBuilder()
        .setName('say')
        .setDescription('Publier un message via le bot.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(opt => opt.setName('message').setDescription('Le texte à envoyer').setRequired(true)),

    new SlashCommandBuilder()
        .setName('rename_user')
        .setDescription('Modifier le pseudonyme d’un membre.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
        .addUserOption(opt => opt.setName('cible').setDescription('Le membre ciblé').setRequired(true))
        .addStringOption(opt => opt.setName('pseudo').setDescription('Le nouveau nom').setRequired(true)),

    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bannir un membre du serveur.')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption(opt => opt.setName('cible').setDescription('Le membre à bannir').setRequired(true))
        .addStringOption(opt => opt.setName('raison').setDescription('Motif').setRequired(false)),

    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Expulser un membre du serveur.')
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addUserOption(opt => opt.setName('cible').setDescription('Le membre à expulser').setRequired(true))
        .addStringOption(opt => opt.setName('raison').setDescription('Motif').setRequired(false)),

    new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mettre temporairement un membre en sourdine.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(opt => opt.setName('cible').setDescription('Le membre à baillonner').setRequired(true))
        .addIntegerOption(opt => opt.setName('duree').setDescription('Durée en minutes').setRequired(true))
        .addStringOption(opt => opt.setName('raison').setDescription('Motif').setRequired(false))
];

// --- 5. ARRIVÉE DU BOT SUR UN SERVEUR ---
client.on('guildCreate', async (guild) => {
    await checkRefugeChannel(guild, true);
    logCreator('NOUVEAU SERVEUR', client.user, `Rejoint : ${guild.name} (${guild.id})`, guild.name);
});

// --- 6. EXECUTION DES COMMANDES & BOUTONS ---
client.on('interactionCreate', async (interaction) => {

    if (interaction.isButton()) {
        const customId = interaction.customId;

        if (customId.startsWith('get_codes_')) {
            const codeId = customId.replace('get_codes_', '');
            const codeData = db.pendingCodes[codeId];

            if (!codeData) {
                return interaction.reply({ content: '❌ Ces identifiants ont expiré ou ne sont plus disponibles.', ephemeral: true });
            }

            if (interaction.user.id !== codeData.targetUserId) {
                return interaction.reply({ content: '⛔ Ces accès sont personnels et ne vous sont pas destinés.', ephemeral: true });
            }

            const codeEmbed = new EmbedBuilder()
                .setTitle('🌐 CODES PERSONNELS')
                .setDescription(`Voici vos accès sécurisés pour rejoindre **${codeData.platform}**.\n*Ne partagez jamais ces informations.*`)
                .setColor(0xFFC807)
                .setAuthor({ name: `ID serveur : ${interaction.guild.id}` })
                .addFields(
                    { name: '👤 Identifiant', value: `\`${codeData.identifiant}\``, inline: true },
                    { name: '🔒 Mot de passe provisoire', value: `\`${codeData.mdp}\``, inline: true },
                    { name: '📌 Première connexion', value: 'Modifiez votre mot de passe dès votre première connexion.', inline: false }
                )
                .setFooter({ text: 'Service Informatique - n0mit SchoolBot • Powered by n0mit CoreSystems' })
                .setTimestamp();

            return interaction.reply({ embeds: [codeEmbed], ephemeral: true });
        }
    }

    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, guild, user, channel, member } = interaction;

    // --- VÉRIFICATION DE RESTRICTION (Sauf si c'est l'Owner du Bot) ---
    const isOwner = (user.id === OWNER_ID);
    const restrictedActions = ['mp', 'say', 'retenue', 'convocation', 'absence', 'send_codes', 'bulletin_change', 'annonce_importante', 'sondage', 'avertissement', 'create_embed'];
    
    if (!isOwner && db.restrictedUsers[user.id] && restrictedActions.includes(commandName)) {
        const restriction = db.restrictedUsers[user.id];
        return interaction.reply({
            content: `🚫 **Accès refusé** : Votre compte a été restreint par l'équipe n0mit CoreSystems.\n*Motif : ${restriction.reason}*`,
            ephemeral: true
        });
    }

    try {
        if (commandName === 'restreindre') {
            const key = options.getString('cle_secrete');
            if (key !== STAFF_KEY && !isOwner) {
                return interaction.reply({ content: '⛔ Clé secrète invalide.', ephemeral: true });
            }

            const target = options.getUser('cible');
            const reason = options.getString('raison') || 'Abus ou non-respect des règles du bot';

            db.restrictedUsers[target.id] = {
                reason,
                restrictedAt: new Date().toISOString()
            };
            saveDatabase();

            await interaction.reply({ content: `🚫 **${target.tag}** est désormais restreint sur toutes les fonctions sensibles du bot.`, ephemeral: true });
            logCreator('RESTRICTION_BOT', user, `Utilisateur restreint : ${target.tag} | Motif : ${reason}`, guild?.name || 'DM');
        }

        if (commandName === 'debloquer') {
            const key = options.getString('cle_secrete');
            if (key !== STAFF_KEY && !isOwner) {
                return interaction.reply({ content: '⛔ Clé secrète invalide.', ephemeral: true });
            }

            const target = options.getUser('cible');
            if (!db.restrictedUsers[target.id]) {
                return interaction.reply({ content: '⚠️ Cet utilisateur n’est pas restreint.', ephemeral: true });
            }

            delete db.restrictedUsers[target.id];
            saveDatabase();

            await interaction.reply({ content: `✅ La restriction sur **${target.tag}** a été levée.`, ephemeral: true });
            logCreator('RESTRICTION_LIFTED', user, `Restriction levée pour : ${target.tag}`, guild?.name || 'DM');
        }

        if (commandName === 'help') {
            const helpEmbed = new EmbedBuilder()
                .setTitle('📚 Manuel des Commandes - n0mit SchoolBot')
                .setDescription('Système complet d’administration et de gestion scolaire RP.')
                .setColor(0x3498DB)
                .addFields(
                    { name: '⚙️ Configuration', value: '`/setup_logs` • `/setup_retenue` • `/setup_edt`', inline: false },
                    { name: '📜 Vie Scolaire RP', value: '`/convocation` • `/retenue` • `/absence` • `/avertissement` • `/emploi_du_temps` • `/sondage` • `/annonce_importante` • `/bulletin_change` • `/bulletin_view`', inline: false },
                    { name: '🔑 Accès & Pronote', value: '`/send_codes` • `/pronote_info`', inline: false },
                    { name: '🛡️ Modération & Création', value: '`/create_embed` • `/clear` • `/rename_user` • `/mute` • `/kick` • `/ban` • `/mp` • `/say`', inline: false },
                    { name: 'ℹ️ Informations', value: '`/info_server` • `/info_user` • `/help`', inline: false },
                    { name: '🌐 Communauté & Support', value: '[Rejoindre Discord n0mit CoreSystems](https://discord.gg/44erEhr8V2)', inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'Powered by n0mit CoreSystems • n0mit SchoolBot' });

            return interaction.reply({ embeds: [helpEmbed] });
        }

        if (commandName === 'avertissement') {
            const eleve = options.getUser('élève');
            const motif = options.getString('motif');

            const warnEmbed = new EmbedBuilder()
                .setTitle('⚠️ AVERTISSEMENT DISCIPLINAIRE RP')
                .setDescription(`Un avertissement a été inscrit au dossier de ${eleve}.`)
                .setColor(0xE67E22)
                .setThumbnail(eleve.displayAvatarURL())
                .addFields(
                    { name: '👤 Élève', value: `${eleve.tag}`, inline: true },
                    { name: '✍️ Émetteur', value: `${user.tag}`, inline: true },
                    { name: '📋 Motif', value: motif, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'Vie Scolaire • Powered by n0mit CoreSystems' });

            await channel.send({ content: `${eleve}`, embeds: [warnEmbed] });
            await interaction.reply({ content: `✅ Avertissement notifié à **${eleve.tag}**.`, ephemeral: true });
            await eleve.send({ content: `⚠️ **Notification Disciplinaire** : Vous avez reçu un avertissement sur **${guild.name}** pour : *${motif}*.` }).catch(() => {});
            await logGuildPublic(guild, warnEmbed);
            logCreator('AVERTISSEMENT', user, `Élève: ${eleve.tag} | Motif: ${motif}`, guild.name);
        }

        // --- OPTION PAR DÉFAUT / PERSONNALISÉE : EMPLOI DU TEMPS ---
        if (commandName === 'setup_edt') {
            if (!checkAdminOrOwner(member, user.id)) {
                return interaction.reply({ content: '⛔ Vous devez être administrateur pour configurer l\'emploi du temps.', ephemeral: true });
            }

            const contenu = options.getString('contenu');
            if (!db.configs[guild.id]) db.configs[guild.id] = {};
            db.configs[guild.id].customEdt = contenu;
            saveDatabase();

            await interaction.reply({ content: `✅ L'emploi du temps personnalisé de l'établissement a été mis à jour !`, ephemeral: true });
            logCreator('SETUP_EDT', user, `Contenu mis à jour pour ${guild.name}`, guild.name);
        }

        if (commandName === 'emploi_du_temps') {
            const customEdt = db.configs[guild.id]?.customEdt;

            const edtEmbed = new EmbedBuilder()
                .setTitle(`📅 Emploi du Temps Général - ${guild.name}`)
                .setColor(0x9B59B6)
                .setFooter({ text: 'Administration Scolaire • Powered by n0mit CoreSystems' })
                .setTimestamp();

            if (customEdt) {
                edtEmbed.setDescription(customEdt);
            } else {
                edtEmbed.setDescription('Horaires généraux des cours de l’établissement :')
                    .addFields(
                        { name: '🌅 Matinée', value: '• **08h00 - 09h55** : Cours M1/M2\n• **10h10 - 12h05** : Cours M3/M4', inline: false },
                        { name: '☀️ Pause Déjeuner', value: '• **12h05 - 13h30** : Restauration scolaire & Activités', inline: false },
                        { name: '🌆 Après-Midi', value: '• **13h30 - 15h25** : Cours S1/S2\n• **15h40 - 17h35** : Cours S3/S4', inline: false }
                    );
            }

            return interaction.reply({ embeds: [edtEmbed] });
        }

        // --- CRÉATION EMBED PERSONNALISÉ POUR MODÉRATEURS / ADMINS / OWNER ---
        if (commandName === 'create_embed') {
            const targetChannel = options.getChannel('salon');
            const titre = options.getString('titre');
            const desc = options.getString('description');
            const colorInput = options.getString('couleur');
            const imageUrl = options.getString('image');
            const thumbnailUrl = options.getString('thumbnail');
            const footerText = options.getString('footer');

            const embed = new EmbedBuilder()
                .setTitle(titre)
                .setDescription(desc);

            if (colorInput) {
                try {
                    embed.setColor(colorInput.startsWith('#') ? colorInput : `#${colorInput}`);
                } catch {
                    embed.setColor(0x3498DB);
                }
            } else {
                embed.setColor(0x3498DB);
            }

            if (imageUrl) embed.setImage(imageUrl);
            if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
            if (footerText) embed.setFooter({ text: footerText });

            await targetChannel.send({ embeds: [embed] });
            await interaction.reply({ content: `✅ Embed personnalisé publié avec succès dans <#${targetChannel.id}> !`, ephemeral: true });
            logCreator('CREATE_EMBED', user, `Titre: "${titre}" dans #${targetChannel.name}`, guild.name);
        }

        if (commandName === 'setup_logs') {
            if (!checkAdminOrOwner(member, user.id)) {
                return interaction.reply({ content: '⛔ Vous devez être administrateur pour utiliser cette commande.', ephemeral: true });
            }
            const targetChannel = options.getChannel('salon');
            if (!db.configs[guild.id]) db.configs[guild.id] = {};
            db.configs[guild.id].logChannelId = targetChannel.id;
            saveDatabase();

            await interaction.reply({ content: `✅ Salon des logs configuré sur <#${targetChannel.id}> !`, ephemeral: true });
            logCreator('SETUP_LOGS', user, `Salon : #${targetChannel.name}`, guild.name);
        }

        if (commandName === 'setup_retenue') {
            if (!checkAdminOrOwner(member, user.id)) {
                return interaction.reply({ content: '⛔ Vous devez être administrateur pour utiliser cette commande.', ephemeral: true });
            }
            const targetRole = options.getRole('rôle');
            if (!db.configs[guild.id]) db.configs[guild.id] = {};
            db.configs[guild.id].retenueRoleId = targetRole.id;
            saveDatabase();

            await interaction.reply({ content: `✅ Le rôle ${targetRole} est désormais autorisé à attribuer des retenues.`, ephemeral: true });
            logCreator('SETUP_RETENUE', user, `Rôle autorisé : ${targetRole.name}`, guild.name);
        }

        if (commandName === 'retenue') {
            const allowedRoleId = db.configs[guild.id]?.retenueRoleId;
            const hasRole = allowedRoleId ? member.roles.cache.has(allowedRoleId) : false;
            const isAdminOrOwner = checkAdminOrOwner(member, user.id);

            if (!allowedRoleId && !isAdminOrOwner) {
                return interaction.reply({ content: '⚠️ **Configuration requise** : Un administrateur doit d’abord exécuter `/setup_retenue`.', ephemeral: true });
            }

            if (!hasRole && !isAdminOrOwner) {
                return interaction.reply({ content: '⛔ Vous n’avez pas le rôle requis pour appliquer des retenues.', ephemeral: true });
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

        if (commandName === 'absence') {
            const eleve = options.getUser('élève');
            const typeSig = options.getString('type');
            const motif = options.getString('motif');

            const absEmbed = new EmbedBuilder()
                .setTitle(`📋 SIGNALEMENT : ${typeSig.toUpperCase()}`)
                .setDescription(`Un événement de vie scolaire concernant ${eleve} a été consigné.`)
                .setColor(typeSig === 'Retard' ? 0xF39C12 : 0xC0392B)
                .setThumbnail(eleve.displayAvatarURL())
                .addFields(
                    { name: '👤 Élève concerné', value: `${eleve.tag}`, inline: true },
                    { name: '📌 Nature', value: typeSig, inline: true },
                    { name: '📋 Motif / Durée', value: motif, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'Vie Scolaire • Powered by n0mit CoreSystems' });

            await channel.send({ embeds: [absEmbed] });
            await interaction.reply({ content: `✅ ${typeSig} notifié(e) pour **${eleve.tag}**.`, ephemeral: true });

            await eleve.send({ content: `📌 **Notification Vie Scolaire** : Un signalement de type **${typeSig}** a été inscrit à votre dossier. (Motif: ${motif})` }).catch(() => {});
            await logGuildPublic(guild, absEmbed);
            logCreator('ABSENCE', user, `Élève: ${eleve.tag} | Type: ${typeSig}`, guild.name);
        }

        if (commandName === 'sondage') {
            const targetChannel = options.getChannel('salon');
            const titre = options.getString('titre');
            const desc = options.getString('description');

            const sondageEmbed = new EmbedBuilder()
                .setTitle(`📊 CONSULTATION OFFICIELLE : ${titre}`)
                .setDescription(`${desc}\n\n*Votez à l’aide des réactions ci-dessous :*\n🟢 **Pour / D’accord**\n🔴 **Contre / Pas d’accord**`)
                .setColor(0x3498DB)
                .setTimestamp()
                .setFooter({ text: 'Administration Scolaire • Powered by n0mit CoreSystems' });

            const pollMsg = await targetChannel.send({ embeds: [sondageEmbed] });
            await pollMsg.react('🟢');
            await pollMsg.react('🔴');

            await interaction.reply({ content: `✅ Sondage publié dans <#${targetChannel.id}>.`, ephemeral: true });
            logCreator('SONDAGE', user, `Titre: ${titre}`, guild.name);
        }

        if (commandName === 'send_codes') {
            const targetUser = options.getUser('élève');
            const idVal = options.getString('identifiant');
            const mdpVal = options.getString('mot_de_passe');
            const platform = options.getString('plateforme');
            const mode = options.getString('mode');
            const targetChannel = options.getChannel('salon') || channel;

            const codeEmbed = new EmbedBuilder()
                .setTitle('🌐 CODES PERSONNELS')
                .setDescription(`Voici vos accès sécurisés pour rejoindre **${platform}**.\n*Ne partagez jamais ces informations.*`)
                .setColor(0xFFC807)
                .setAuthor({ name: `ID serveur : ${guild.id}` })
                .addFields(
                    { name: '👤 Identifiant', value: `\`${idVal}\``, inline: true },
                    { name: '🔒 Mot de passe provisoire', value: `\`${mdpVal}\``, inline: true },
                    { name: '📌 Première connexion', value: 'Modifiez votre mot de passe dès votre première connexion.', inline: false }
                )
                .setFooter({ text: 'Service Informatique - n0mit SchoolBot • Powered by n0mit CoreSystems' })
                .setTimestamp();

            if (mode === 'mp') {
                try {
                    await targetUser.send({ embeds: [codeEmbed] });
                    await interaction.reply({ content: `🔑 Identifiants transmis en MP à **${targetUser.tag}**.`, ephemeral: true });
                } catch (e) {
                    await interaction.reply({ content: `❌ MP impossible pour **${targetUser.tag}** (DMs fermés).`, ephemeral: true });
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
                    .setTitle('🔑 Génération d’identifiants de connexion')
                    .setDescription(`Les accès de **${targetUser}** pour **${platform}** sont prêts.\nCliquez ci-dessous pour les afficher.`)
                    .setColor(0xFFC807)
                    .setFooter({ text: 'Service Informatique • Powered by n0mit CoreSystems' });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`get_codes_${codeId}`)
                        .setLabel('🔑 Recevoir mes identifiants')
                        .setStyle(ButtonStyle.Primary)
                );

                await targetChannel.send({ embeds: [announceEmbed], components: [row] });
                await interaction.reply({ content: `✅ Bouton généré dans <#${targetChannel.id}> pour **${targetUser.tag}**.`, ephemeral: true });
            }

            logCreator('SEND_CODES', user, `Cible: ${targetUser.tag} | Mode: ${mode}`, guild.name);
        }

        if (commandName === 'pronote_info') {
            const targetChannel = options.getChannel('salon');
            const ip = options.getString('adresse_ip');
            const port = options.getString('port_tcp');
            const designation = options.getString('designation');
            const lien = options.getString('lien_web');

            const embed1 = new EmbedBuilder()
                .setTitle('🟢 Connexion Directe au Serveur PRONOTE')
                .setDescription('Paramètres requis pour configurer votre client Pronote et vous connecter au réseau de l’établissement.')
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

        if (commandName === 'bulletin_change') {
            const targetUser = options.getUser('élève');
            const appreciation = options.getString('appréciation');

            if (!db.bulletins[guild.id]) db.bulletins[guild.id] = {};
            db.bulletins[guild.id][targetUser.id] = appreciation;
            saveDatabase();

            await interaction.reply({ content: `✅ Bulletin mis à jour pour **${targetUser.tag}**.`, ephemeral: true });
            logCreator('BULLETIN_CHANGE', user, `Élève: ${targetUser.tag}`, guild.name);
        }

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

        if (commandName === 'clear') {
            const amount = options.getInteger('nombre');
            await channel.bulkDelete(amount, true);
            await interaction.reply({ content: `🧹 **${amount}** messages supprimés avec succès.`, ephemeral: true });
            logCreator('CLEAR', user, `${amount} messages supprimés dans #${channel.name}`, guild.name);
        }

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

        // --- OPTION PERSONNALISÉE : CONDITION MP (OFFICIEL SI ADMIN/OWNER) ---
        if (commandName === 'mp') {
            const target = options.getUser('cible');
            const msg = options.getString('message');

            const isAdminOrOwner = checkAdminOrOwner(member, user.id);

            const footerText = isAdminOrOwner 
                ? '📌 Message Officiel de la Direction / Administration.' 
                : 'Ce message n\'a pas de valeur administrative officielle.';

            const embedMP = new EmbedBuilder()
                .setTitle(`💬 Message reçu via n0mit SchoolBot`)
                .setDescription(msg)
                .setColor(isAdminOrOwner ? 0x2ECC71 : 0x3498DB)
                .addFields(
                    { name: '👤 Expéditeur', value: `${user.tag} (\`${user.id}\`)`, inline: true },
                    { name: '🏰 Serveur d\'origine', value: `${guild.name}`, inline: true },
                    { name: '📜 Statut', value: isAdminOrOwner ? '✅ **OFFICIEL**' : 'ℹ️ **NON-OFFICIEL**', inline: true }
                )
                .setTimestamp()
                .setFooter({ text: footerText });

            try {
                await target.send({ embeds: [embedMP] });
                await interaction.reply({ content: `💬 Message transmis en privé à **${target.tag}** (${isAdminOrOwner ? 'Statut: Officiel' : 'Statut: Non-officiel'}).`, ephemeral: true });
                logCreator('COMMANDE /MP', user, `À: ${target.tag} | Message: "${msg}" | Officiel: ${isAdminOrOwner}`, guild.name);
            } catch (e) {
                await interaction.reply({ content: `❌ Impossible d’envoyer le MP (DMs fermés).`, ephemeral: true });
            }
        }

        if (commandName === 'say') {
            const msg = options.getString('message');
            await channel.send({ content: msg });
            await interaction.reply({ content: '✅ Message publié.', ephemeral: true });
            logCreator('COMMANDE /SAY', user, `Dans #${channel.name} | Message: "${msg}"`, guild.name);
        }

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

        if (commandName === 'rename_user') {
            const targetMember = options.getMember('cible');
            const newName = options.getString('pseudo');
            if (!targetMember) return interaction.reply({ content: 'Membre introuvable.', ephemeral: true });

            const oldName = targetMember.displayName;
            await targetMember.setNickname(newName);
            await interaction.reply({ content: `✅ Pseudo de **${oldName}** modifié en **${newName}**.` });
            logCreator('MODERATION (RENAME)', user, `Target: ${targetMember.user.tag} | ${oldName} -> ${newName}`, guild.name);
        }

        if (commandName === 'ban') {
            const targetUser = options.getUser('cible');
            const reason = options.getString('raison') || 'Aucune raison';
            await guild.members.ban(targetUser, { reason });
            await interaction.reply({ content: `🚫 **${targetUser.tag}** banni.` });
            logCreator('MODERATION (BAN)', user, `Target: ${targetUser.tag} | Raison: ${reason}`, guild.name);
        }

        if (commandName === 'kick') {
            const targetMember = options.getMember('cible');
            const reason = options.getString('raison') || 'Aucune raison';
            if (!targetMember) return interaction.reply({ content: 'Membre introuvable.', ephemeral: true });
            await targetMember.kick(reason);
            await interaction.reply({ content: `👢 **${targetMember.user.tag}** expulsé.` });
            logCreator('MODERATION (KICK)', user, `Target: ${targetMember.user.tag} | Raison: ${reason}`, guild.name);
        }

        if (commandName === 'mute') {
            const targetMember = options.getMember('cible');
            const minutes = options.getInteger('duree');
            const reason = options.getString('raison') || 'Aucune raison';
            if (!targetMember) return interaction.reply({ content: 'Membre introuvable.', ephemeral: true });
            await targetMember.timeout(minutes * 60 * 1000, reason);
            await interaction.reply({ content: `🔇 **${targetMember.user.tag}** réduit au silence pour ${minutes} min.` });
            logCreator('MODERATION (MUTE)', user, `Target: ${targetMember.user.tag} | Durée: ${minutes}m`, guild.name);
        }

    } catch (err) {
        console.error('Erreur d’exécution :', err);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: '❌ Une erreur interne est survenue.', ephemeral: true }).catch(() => {});
        } else {
            await interaction.reply({ content: '❌ Une erreur interne est survenue.', ephemeral: true }).catch(() => {});
        }
    }
});

// --- 7. CONNEXION DU BOT ET PRÉSENCE ---
client.once('ready', async () => {
    console.log(`🤖 n0mit SchoolBot connecté en tant que ${client.user.tag}`);

    client.user.setPresence({
        activities: [{
            name: 'n0mit CoreSystems | /help',
            type: ActivityType.Streaming,
            url: 'https://discord.gg/44erEhr8V2'
        }],
        status: 'online'
    });

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

    client.guilds.cache.forEach(guild => checkRefugeChannel(guild, false));
});

client.login(TOKEN);
