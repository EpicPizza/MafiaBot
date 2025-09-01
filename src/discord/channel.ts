import { ChannelType, ClientEvents, Colors, EmbedBuilder, Events } from "discord.js";
import { getGlobal } from "../utils/global";
import { getSetup } from "../utils/setup";

export async function channelCreateHandler(...[channel]: ClientEvents[Events.ChannelCreate]) {
    try {
        const global = await getGlobal();
        if (!global.started) return;

        const setup = await getSetup();
        const name = Object.entries(setup).find(entry => entry[1].guild.id == channel.guild.id)?.[0];
        if (name == undefined) return;

        let description = `Channel <#${channel.id}> (${channel.name}) of type ${ChannelType[channel.type]} was created.\n\n`;

        const overwrites = channel.permissionOverwrites.cache;
        if (overwrites.size > 0) {
            description += "**Permission Overwrites**:\n";
            overwrites.forEach(overwrite => {
                const target = overwrite.type === 0 ? channel.guild.roles.cache.get(overwrite.id) : channel.guild.members.cache.get(overwrite.id);
                if (target == undefined) return;
                description += `For ${('name' in target ? target.name : target?.displayName) + ` <${overwrite.type === 0 ? "@&" : "@"}${overwrite.id}>`}:\n`;
                description += `> Allowed: ${overwrite.allow.toArray().join(', ')}\n`;
                description += `> Denied: ${overwrite.deny.toArray().join(', ')}\n`;
            });
        }

        await setup.secondary.logs.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle('Channel Created')
                    .setColor(Colors.Green)
                    .setDescription(`${name.substring(0, 1).toUpperCase() + name.substring(1)} Server\n\n${description}`)
            ]
        });
    } catch (e) {
        console.log(e);
    }
}

export async function channelUpdateHandler(...[oldChannel, newChannel]: ClientEvents[Events.ChannelUpdate]) {
     try {
        if (newChannel.type === ChannelType.DM) return;

        const global = await getGlobal();
        if (!global.started) return;

        const setup = await getSetup();
        const name = Object.entries(setup).find(entry => entry[1].guild.id == newChannel.guild.id)?.[0];
        if (name == undefined) return;

        let description = "";

        if (oldChannel.type == ChannelType.DM) return;

        if (oldChannel.name !== newChannel.name) {
            description += `**Name Change**: ${oldChannel.name} -> ${newChannel.name}\n`;
        }

        if ('topic' in oldChannel && 'topic' in newChannel && oldChannel.topic !== newChannel.topic) {
            description += `**Topic Change**: \n`;
            description += `> Old: ${oldChannel.topic ?? 'None'}\n`;
            description += `> New: ${newChannel.topic ?? 'None'}\n`;
        }

        const oldPerms = oldChannel.permissionOverwrites.cache;
        const newPerms = newChannel.permissionOverwrites.cache;

        const changedPerms: string[] = [];

        newPerms.forEach((newOverwrite, id) => {
            const oldOverwrite = oldPerms.get(id);

            if (!oldOverwrite || !oldOverwrite.allow.equals(newOverwrite.allow) || !oldOverwrite.deny.equals(newOverwrite.deny)) {
                const target = newOverwrite.type === 0 ? newChannel.guild.roles.cache.get(id) : newChannel.guild.members.cache.get(id);
                if (target == undefined) return;

                let permChanges = `For ${('name' in target ? target.name : target?.displayName) ?? ` <${newOverwrite.type === 0 ? "@&" : "@"}${id}>`}:\n`;

                if (!oldOverwrite) {
                    permChanges += `> Added with Allow: ${newOverwrite.allow.toArray().join(', ') || 'None'}, Deny: ${newOverwrite.deny.toArray().join(', ') || 'None'}\n`;
                } else {
                    const addedAllow = newOverwrite.allow.remove(oldOverwrite.allow).toArray();
                    const removedAllow = oldOverwrite.allow.remove(newOverwrite.allow).toArray();
                    const addedDeny = newOverwrite.deny.remove(oldOverwrite.deny).toArray();
                    const removedDeny = oldOverwrite.deny.remove(newOverwrite.deny).toArray();

                    if (addedAllow.length > 0) permChanges += `> Allowed Added: ${addedAllow.join(', ')}\n`;
                    if (removedAllow.length > 0) permChanges += `> Allowed Removed: ${removedAllow.join(', ')}\n`;
                    if (addedDeny.length > 0) permChanges += `> Denied Added: ${addedDeny.join(', ')}\n`;
                    if (removedDeny.length > 0) permChanges += `> Denied Removed: ${removedDeny.join(', ')}\n`;
                }

                changedPerms.push(permChanges);
            }
        });

        oldPerms.forEach((oldOverwrite, id) => {
            if (!newPerms.has(id)) {
                const target = oldOverwrite.type === 0 ? newChannel.guild.roles.cache.get(id) : newChannel.guild.members.cache.get(id);
                if (target == undefined) return;

                changedPerms.push(`For ${('name' in target ? target.name : target?.displayName) ?? `<@${id}>`}: Overwrite removed\n`);
            }
        });

        if (changedPerms.length > 0) {
            description += `**Permission Overwrites Changed**:\n${changedPerms.join('')}`;
        }

        if (description === "") return;

        await setup.secondary.logs.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle('Channel Update')
                    .setColor(Colors.Blue)
                    .setDescription(`${name.substring(0, 1).toUpperCase() + name.substring(1)} Server - <#${newChannel.id}>\n\n${description}`)
            ]
        });
    } catch (e) {
        console.log(e);
    }
}