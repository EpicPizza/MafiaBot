import dotenv from 'dotenv';
dotenv.config();

import { Events } from "discord.js";
import { initCommands } from './discord';
import { channelCreateHandler, channelUpdateHandler } from './discord/channel';
import client from './discord/client';
import { interactionCreateHandler } from './discord/interaction';
import { guildMemberAddHanlder, guildMemberRemoveHandler, guildMemberUpdateHandler } from './discord/member';
import { messageCreateHandler, messageDeleteHandler, messageReactionAddHandler, messageUpdateHandler } from './discord/message';
import { clientReadyHandler } from './discord/ready';

initCommands();

client.on(Events.ClientReady, clientReadyHandler);

client.on(Events.MessageCreate, messageCreateHandler);
client.on(Events.MessageUpdate, messageUpdateHandler);
client.on(Events.MessageDelete, messageDeleteHandler);
client.on(Events.MessageReactionAdd, messageReactionAddHandler);

client.on(Events.GuildMemberAdd, guildMemberAddHanlder);
client.on(Events.GuildMemberUpdate, guildMemberUpdateHandler);
client.on(Events.GuildMemberRemove, guildMemberRemoveHandler);

client.on(Events.ChannelCreate, channelCreateHandler);
client.on(Events.ChannelUpdate, channelUpdateHandler);

client.on(Events.InteractionCreate, interactionCreateHandler);