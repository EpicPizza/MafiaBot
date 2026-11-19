import { Events, ClientEvents, Colors, EmbedBuilder, ChannelType, AuditLogEvent } from 'discord.js';
import { getUser } from '../utils/mafia/user';
import { firebaseAdmin } from '../utils/firebase';
import { editOverwrites } from "../utils/mafia/main";
import { RoleQueue } from '../utils/mafia/invite';
import { getAuthority } from '../utils/instance';
import { findRunningGame } from '../utils/mafia/context';
import { isAliveAnywhere } from "../utils/mafia/state";
import { getGameByID } from "../utils/mafia/games";

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

        const runningGame = await findRunningGame(instance);
        const started = runningGame != undefined;
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
        const queued = docs.map(doc => doc.data()) as RoleQueue[];

        // Only apply entries queued for the game that's running (or, between games, for the last game/pregame).
        // Untagged entries predate game tagging and entries for another game are stale, e.g. a spectator invite from a
        // game the player died in long ago, which would otherwise make them a spectator in the game they're playing now.
        const running = runningGame?.game.id ?? null;
        const isCurrent = (queue: RoleQueue) => queue.game !== undefined && (running == null || queue.game == running);
        const roles = queued.filter(isCurrent);
        const stale = queued.length - roles.length;

        // Never make someone a spectator while they're alive in a game.
        const alive = roles.some(queue => queue.roles.add?.includes("spectator")) && await isAliveAnywhere(member.id, instance);

        for(let i = 0; i < roles.length; i++) {
            const queue: RoleQueue = roles[i];
            const guild = setup[queue.server].guild;

            let message = `${name.substring(0, 1).toUpperCase() + name.substring(1)} Server\n\n`;

            if(queue.game) {
                const game = await getGameByID(queue.game, instance, true).catch(() => undefined);

                message += "Game: " + (game?.name ?? queue.game) + "\n\n";
            }

            const addNames = alive ? queue.roles.add?.filter(role => role != "spectator") : queue.roles.add;

            const addRoles = addNames?.map(role => guild.roles.cache.find(cachedRole => cachedRole.name == role)).filter(role => role != undefined) ?? [];
            const removeRoles = queue.roles.remove?.map(role => guild.roles.cache.find(cachedRole => cachedRole.name == role)).filter(role => role != undefined) ?? [];

            await Promise.allSettled(addRoles.map(role => member.roles.add(role)));
            await Promise.allSettled(removeRoles.map(role => member.roles.remove(role)));

            if(!started) {
                if(addRoles.length > 0) message += "Added roles: " + addRoles.map(role => role.name).join(", ") + "\n";
                if(removeRoles.length > 0) message += "Removed roles: " + removeRoles.map(role => role.name).join(", ") + "\n";
                if(addRoles.length > 0 || removeRoles.length > 0) message += "\n";
            }

            if(queue.permissions) {
                const permissionsChannel = guild.channels.cache.get(queue.permissions.channel);
                if(permissionsChannel && (permissionsChannel.type == ChannelType.GuildText || permissionsChannel.type == ChannelType.GuildCategory)) await permissionsChannel.permissionOverwrites.create(member.id, editOverwrites());

                if(!started) {
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

        if(stale > 0 || alive) {
            await setup.secondary.logs.send({ embeds: [
                new EmbedBuilder()
                    .setTitle('Invite Entry Skipped')
                    .setColor(Colors.Orange)
                    .setDescription(`${name.substring(0, 1).toUpperCase() + name.substring(1)} Server - <@${member.id}>\n\n`
                        + (stale > 0 ? `Ignored ${stale} stale entr${stale == 1 ? "y" : "ies"} from another or an older game.\n` : "")
                        + (alive ? "Did not add spectator role, they're alive in a game." : ""))
            ]});
        }

        // mafia server no longer kicks during games, access to mafia chat is handled by category permission overwrites
        if(roles.length == 0 && setup.secondary.guild.id == member.guild.id && member.kickable && started) {
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