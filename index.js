const { Client, Intents, MessageEmbed, MessageActionRow, MessageButton } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const request = require('request');

const token = '...';
const clientId = '...';

const client = new Client({ intents: [Intents.FLAGS.GUILDS] });
const rest = new REST({ version: '9' }).setToken(token);

const userRole = 'Votemoji User';
const votemojiAdmin = 'Votemoji Admin';

const electionTimer = 1; // minute(s)
const quorum = 1;

const votemojiCommand = new SlashCommandBuilder()
    .setName('votemoji')
    .setDescription('Start a vote for a new server emoji.')
    .addSubcommand(subcommand => 
        subcommand.setName('veto')
            .setDescription('Vetos a Votemoji vote. For moderator use only.'))
    .addSubcommand(subcommand =>
        subcommand.setName('start')
            .setDescription('Starts a vote to add a server emoji. For nitro boosters only.')
            .addStringOption(option =>
                option.setName('img_url')
                    .setDescription('A link pointing to a PNG of the proposed emoji.')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('emoji_name')
                    .setDescription('The name of the emoji on the server (max 32 chars)')
                    .setRequired(true))
            );

rest.put(Routes.applicationCommands(clientId), { body: [votemojiCommand.toJSON()]}).catch(console.error);

var ongoingVotes = {};

client.on('interactionCreate', async interaction => {
    if(interaction.isCommand() && interaction.commandName === 'votemoji') {
        if(interaction.options.getSubcommand() === 'start') {
            let hasPerms = false;
            interaction.member.roles.cache.forEach(role => hasPerms = role.name === userRole || hasPerms);
            if(!hasPerms) 
                return await interaction.reply({content: `❌ You require the role ${userRole}`, ephemeral: true});
            if(ongoingVotes.hasOwnProperty(interaction.guild.id))
                return await interaction.reply({content: '❌ You cannot start an emoji election while one is in progress', ephemeral: true});
            let img = interaction.options.getString('img_url');
            let valid = await validImg(img);
            if(!valid)
                return await interaction.reply({content: '❌ The URL provided is not an image. Only PNG, JPG, and GIF are supported.', ephemeral: true});
            let emojiName = interaction.options.getString('emoji_name');
            if(emojiName.length > 32)
                return await interaction.reply({content: '❌ The name of the emoji must be at most 32 characters', ephemeral: true})
            
            let endDate = new Date();
            endDate.setMinutes(endDate.getMinutes()+electionTimer);
            
            let voteInfo = {status: 'ongoing', img: img, guild: interaction.guild, emojiName: emojiName, yeas: [], nays: [], proposer: interaction.user, endDate: endDate};
                    
            await interaction.reply({embeds: [makeEmbed(voteInfo)], components: [makeButtons()]});
            voteInfo.msg = msg = await interaction.fetchReply();
            ongoingVotes[interaction.guild.id] = voteInfo;
            
            setTimeout(() => {
                if(ongoingVotes.hasOwnProperty(interaction.guild.id) && ongoingVotes[interaction.guild.id].status === 'ongoing') {
                    let voteInfo = ongoingVotes[interaction.guild.id];
                    if(voteInfo.yeas.length + voteInfo.nays.length < quorum)
                        voteInfo.status = 'noquorum';
                    else if(voteInfo.yeas.length > voteInfo.nays.length)
                        voteInfo.status = 'success';
                    else
                        voteInfo.status = 'fail';
                    
                    if(voteInfo.status === 'success')
                        interaction.guild.emojis.create(voteInfo.img, voteInfo.emojiName)
                            .then(emoji => console.log(`Created new emoji with name ${emoji.name}!`))
                            .catch(emoji => voteInfo.msg.edit({content: `Error adding emoji. Num slots is ${numEmojiSlots}`}));
                    
                    voteInfo.msg.edit({ embeds: [makeEmbed(voteInfo)], components: []});
                    
                    delete ongoingVotes[interaction.guild.id];
                }
            }, electionTimer * 60 * 1000);
        }
        else if(interaction.options.getSubcommand() === 'veto') {    
            let hasPerms = false;
            interaction.member.roles.cache.forEach(role => hasPerms = role.name === votemojiAdmin || hasPerms);
            if(!hasPerms)
                return await interaction.reply({content: '❌ You do not have permission to execute that command.', ephemeral: true});
            
            if(!ongoingVotes.hasOwnProperty(interaction.guild.id))
                return await interaction.reply({content: '❌ There are no emoji elections in progress', ephemeral: true});
                
            let voteInfo = ongoingVotes[interaction.guild.id];
            voteInfo.status = 'vetoed';
            voteInfo.vetoer = interaction.user;
            voteInfo.endDate = new Date();
                
            await voteInfo.msg.edit({ embeds: [makeEmbed(voteInfo)], components: []});
            delete ongoingVotes[interaction.guild.id]
            await interaction.reply({content: '✅ Ongoing election vetoed', ephemeral: true});
        }
    }
    else if(interaction.isButton()) {
        let hasPerms = false;
        interaction.member.roles.cache.forEach(role => hasPerms = role.name === userRole || hasPerms);
        if(!hasPerms)
            return await interaction.reply({content: '❌ You don\'t have permission to participate in emoji elections', ephemeral: true});
        if(!ongoingVotes.hasOwnProperty(interaction.guild.id))
            return await interaction.reply({content: '❌ This emoji election has ended', ephemeral: true});
        var voteInfo = ongoingVotes[interaction.guild.id];
        if(voteInfo.yeas.includes(interaction.user.id)) {
            let i = voteInfo.yeas.indexOf(interaction.user.id);
            if(i > -1) voteInfo.yeas.splice(i, 1);
        }
        
        if(voteInfo.nays.includes(interaction.user.id)) {
            let i = voteInfo.nays.indexOf(interaction.user.id);
            if(i > -1) voteInfo.nays.splice(i, 1);
        }
        
        if(interaction.customId === 'yes')
            voteInfo.yeas.push(interaction.user.id);
        else if(interaction.customId === 'no')
            voteInfo.nays.push(interaction.user.id);
        
        await voteInfo.msg.edit({embeds: [makeEmbed(voteInfo)]});
        await interaction.deferUpdate();
    }
});

function makeEmbed(voteInfo) {
    console.log(voteInfo.img);
    let embed = new MessageEmbed()
        .addField('Tally', `Yeas: ${voteInfo.yeas.length} / Nays: ${voteInfo.nays.length}`, true)
        .addField('Emoji Slots', `${numEmojiSlots(voteInfo.guild)} Remaining`, true)
        .setThumbnail(voteInfo.img)
    if(voteInfo.status === 'ongoing') {
        let pingableRole = voteInfo.guild.roles.cache.find(role => role.name === userRole);
        embed.setColor('#0099ff');
        embed.setTitle('New Emoji Election');
        embed.setFooter({text: 'Election ends ' + voteInfo.endDate.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })});
        embed.setDescription(`${voteInfo.proposer.username} is proposing the emoji \'${voteInfo.emojiName}\' be added to the server. Users with the ${pingableRole ? `<@&${pingableRole.id}>` : userRole } role may vote below`);
    }
    else if(voteInfo.status === 'vetoed') {
        embed.setColor('#ff0000')
        embed.setTitle('New Emoji Election: VETOED');
        embed.setDescription(`The emoji \'${voteInfo.emojiName}\' proposed by ${voteInfo.proposer.username} has been vetoed by ${voteInfo.vetoer.username}`);
        embed.setFooter({text: 'Election ended at ' + voteInfo.endDate.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })});
    }
    else if(voteInfo.status === 'noquorum') {
        embed.setColor('#ffff00');
        embed.setTitle('New Emoji Election: NO QUORUM');
        embed.setDescription(`The proposed emoji \'${voteInfo.emojiName}\' did not receive enough votes to be added to the server, since not enough people participated. At least ${quorum} votes are needed for an emoji to be added.`);
        embed.setFooter({text: 'Election ended at ' + voteInfo.endDate.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })});
    }
    else if(voteInfo.status === 'fail') {
        embed.setColor('#ff0000');
        embed.setTitle('New Emoji Election: FAIL');
        embed.setDescription(`The proposed emoji \'${voteInfo.emojiName}\' did not receive enough votes to be added to the server. The election is now over.`);
        embed.setFooter({text: 'Election ended at ' + voteInfo.endDate.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })});
    }
    else if(voteInfo.status === 'success') {
        embed.setColor('#00ff00');
        embed.setTitle('New Emoji Election: SUCCESS');
        embed.setFooter({text: 'Election ended at ' + voteInfo.endDate.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })});
        embed.setDescription(`The proposed emoji \'${voteInfo.emojiName}\' has received enough votes and has been added to the server!`);    }
    return embed;
}

function numEmojiSlots(guild) {
    let serverTier = guild.premiumTier;
    let maxSize = 50;
    if(serverTier == "TIER_1") maxSize = 100;
    else if(serverTier == "TIER_2") maxSize = 150;
    else if(serverTier == "TIER_3") maxSize = 250;
    
    return maxSize - guild.emojis.cache.size;
}

async function validImg(url) {
    const hexIdentifiers = {
        jpg: 'ffd8ffe0',
        png: '89504e47',
        gif: '47494638'
    };
    let options = {method: 'GET', url: url, encoding: null};
    // literally aids switch to request package that natively supports Promises
    return await new Promise((resolve, reject) => request(options, async (err, res, body) => {
        if(!err  && res.statusCode === 200) {
            var magicNumber = body.toString('hex', 0, 4);
            if(Object.values(hexIdentifiers).includes(magicNumber))
                resolve(true);
        }
        resolve(false);
    }));
}

function makeButtons() {
    return new MessageActionRow()
        .addComponents(
            new MessageButton()
                .setCustomId('yes')
                .setLabel('Yes')
                .setStyle('SUCCESS')
        )
        .addComponents(
            new MessageButton()
                .setCustomId('no')
                .setLabel('No')
                .setStyle('DANGER')
        )
}



client.once('ready', () => {
    console.log('Votemoji v0.0.1 initialized');
});

client.login(token);
