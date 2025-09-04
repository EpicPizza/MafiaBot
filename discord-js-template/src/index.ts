import { Events } from "discord.js";
import { initCommands } from './discord';
import client from './discord/client';
import { interactionCreateHandler } from './discord/interaction';
import { messageCreateHandler, messageReactionAddHandler } from './discord/message';
import { clientReadyHandler } from './discord/ready';

initCommands();

client.on(Events.ClientReady, clientReadyHandler);
client.on(Events.MessageCreate, messageCreateHandler);
client.on(Events.MessageReactionAdd, messageReactionAddHandler);
client.on(Events.InteractionCreate, interactionCreateHandler);
