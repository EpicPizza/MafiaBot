import { Events, ClientEvents, Colors, EmbedBuilder, ChannelType, AuditLogEvent } from 'discord.js';
import { getUser } from '../utils/mafia/user';
import { firebaseAdmin } from '../utils/firebase';
import { editOverwrites } from "../utils/mafia/main";
import { RoleQueue } from '../utils/mafia/invite';
import { getAuthority } from '../utils/instance';

export async function guildMemberUpdateHandler(...[oldMember, newMember]: ClientEvents[Events.GuildMemberUpdate]) {
    try {
        if (oldMember.pending && !newMember.pending) {
            return;
        }
    
        const instance = await getAuthority(newMember.guild.id, false);
        if(instance == undefined) {
            const oldRoles = oldMember.roles.cache;
            const newRoles = newMember.roles.cache;

            const addedRoles = newRoles.filter(role => !oldRoles.has(role.id));

            const hbd = addedRoles.find(role => role.id == "1465430470295818270");
            if(hbd && newMember.id == "989327366218215424") {
                await newMember.roles.remove(hbd);
            }

            return;
        }

        const global = instance.global;
        const setup = instance.setup;

        const name = Object.entries(setup).find(entry => entry[1].guild.id == newMember.guild.id)?.[0];
        if(name == undefined) return;

        if(name != 'primary' || (newMember.roles.cache.has(setup.primary.gang.id))) {
            const oldRoles = oldMember.roles.cache;
            const newRoles = newMember.roles.cache;

            const addedRoles = newRoles.filter(role => !oldRoles.has(role.id));
            const removedRoles = oldRoles.filter(role => !newRoles.has(role.id));

            let description = "";

            if(oldMember.nickname != newMember.nickname) {
                description += `**Nickname Change**: ${oldMember.nickname ?? "None"} -> ${newMember.nickname ?? "None"}\n`;
            }

            if(addedRoles.size > 0) {
                description += `**Roles Added**: ${addedRoles.map(role => role.name).join(", ")}\n`;
            }

            if(removedRoles.size > 0) {
                description += `**Roles Removed**: ${removedRoles.map(role => role.name).join(", ")}\n`;
            }

            if(description == "") return;

            await setup.secondary.logs.send({ embeds: [
                new EmbedBuilder()
                    .setTitle('Member Update')
                    .setColor(Colors.Blue)
                    .setDescription(`${name.substring(0, 1).toUpperCase() + name.substring(1)} Server - <@${newMember.id}> (${(await getUser(newMember.id, instance))?.nickname ?? "n/a"})\n\n${description}`)
            ]});
        }
    } catch(e) {
        console.log(e);
    }
}

export async function guildMemberAddHanlder(...[member]: ClientEvents[Events.GuildMemberAdd]) {
    try {
        const instance = await getAuthority(member.guild.id, false);
        if(instance == undefined) return;

        const global = instance.global;
        const setup = instance.setup;

        const db = firebaseAdmin.getFirestore();

        const name = Object.entries(setup).find(entry => entry[1].guild.id == member.guild.id)?.[0];
        if(name == undefined) return;

        if(name != 'primary') {
            await setup.secondary.logs.send({ embeds: [
                new EmbedBuilder()
                    .setTitle('Member Join')
                    .setColor(Colors.Green)
                    .setDescription(`${name.substring(0, 1).toUpperCase() + name.substring(1)} Server - <@${member.id}> (${(await getUser(member.id, instance))?.nickname ?? "n/a"})`)
            ]});
        }

        const ref = db.collection('instances').doc(instance.id).collection('roles').where('id', '==', member.id).where('server', '==', name);
        const docs = (await ref.get()).docs
        const roles = docs.map(doc => doc.data()) as RoleQueue[];

        for(let i = 0; i < roles.length; i++) {
            const queue: RoleQueue = roles[i];
            const guild = setup[queue.server].guild;

            let message = `${name.substring(0, 1).toUpperCase() + name.substring(1)} Server\n\n`;

            const addRoles = queue.roles.add?.map(role => guild.roles.cache.find(cachedRole => cachedRole.name == role)).filter(role => role != undefined) ?? [];
            const removeRoles = queue.roles.remove?.map(role => guild.roles.cache.find(cachedRole => cachedRole.name == role)).filter(role => role != undefined) ?? [];

            await Promise.allSettled(addRoles.map(role => member.roles.add(role)));
            await Promise.allSettled(removeRoles.map(role => member.roles.remove(role)));

            if(!global.started) {
                if(addRoles.length > 0) message += "Added roles: " + addRoles.map(role => role.name).join(", ") + "\n";
                if(removeRoles.length > 0) message += "Removed roles: " + removeRoles.map(role => role.name).join(", ") + "\n";
                if(addRoles.length > 0 || removeRoles.length > 0) message += "\n";
            }

            if(queue.permissions) {
                const permissionsChannel = guild.channels.cache.get(queue.permissions.channel);
                if(permissionsChannel && permissionsChannel.type == ChannelType.GuildText) await permissionsChannel.permissionOverwrites.create(member.id, editOverwrites());

                if(!global.started) {
                    message += "Read permissions for " + permissionsChannel?.url + "\n\n";
                }
            }

            if(queue.message) {
                const messageChannel = guild.channels.cache.get(queue.message.channel);
                if(messageChannel && messageChannel.isTextBased()) await messageChannel.send(queue.message.content);

                message += "Message sent in " + messageChannel?.url + "\n";
                message += "> " + queue.message.content;
            }

            await setup.secondary.logs.send({ embeds: [
                new EmbedBuilder()
                    .setTitle('Invite Entry')
                    .setColor(Colors.Yellow)
                    .setDescription(message)
            ]});
        }

        if(roles.length == 0 && (setup.secondary.guild.id == member.guild.id || setup.tertiary.guild.id == member.guild.id) && member.kickable && global.started) {
            await member.kick();

            await setup.secondary.logs.send({ embeds: [
                new EmbedBuilder()
                    .setTitle('Member Kick')
                    .setColor(Colors.Red)
                    .setDescription(`An invite entry for <@${member.id}> (${(await getUser(member.id, instance))?.nickname ?? "n/a"}) count not be found.`)
            ]});
        }

        await Promise.allSettled(docs.map(doc => doc.ref.delete()));
    } catch(e) {
        console.log(e);
    }
}

export async function guildMemberRemoveHandler(...[member]: ClientEvents[Events.GuildMemberRemove]) {
    try {
        const instance = await getAuthority(member.guild.id, false);
        if(instance == undefined) return;

        const global = instance.global;
        const setup = instance.setup;

        const name = Object.entries(setup).find(entry => entry[1].guild.id == member.guild.id)?.[0];
        if(name == undefined) return;

        const fetchedLogs = await member.guild.fetchAuditLogs({
            limit: 1,
            type: AuditLogEvent.MemberKick,
        });

        const kickLog = fetchedLogs.entries.first();

        if (!kickLog || kickLog.targetId !== member.id) return;

        const { executor } = kickLog;

        await setup.secondary.logs.send({ embeds: [
            new EmbedBuilder()
                .setTitle('Member Kick')
                .setColor(Colors.Red)
                .setDescription(`${name.substring(0, 1).toUpperCase() + name.substring(1)} Server - <@${member.id}> (${(await getUser(member.id, instance))?.nickname ?? "n/a"}) was kicked by ${executor ? `<@${executor.id}>` : 'Unknown'}`)
        ]});
    } catch(e) {
        console.log(e);
    }
}