import { ChannelType, ChatInputCommandInteraction, Colors, EmbedBuilder, Message } from "discord.js";
import { Vote } from "../utils/vote";
import { Command, CommandOptions } from "../discord";
import { deleteCollection, getGameByID, getGlobal, Global } from "../utils/main";
import { z } from "zod";
import { firebaseAdmin } from "../firebase";
import { getSetup, Setup } from "../utils/setup";
import { getUser, getUserByChannel, getUserByName, getUsersArray, User } from "../utils/user";
import { checkMod } from "../utils/mod";
import { getGameSetup, Signups } from "../utils/games";

const help = `This is the game specific extension for Gambling Mafia.

**?balance** Check your balance, cannot be run in main chat.

**?items** Check your bought items, cannot be run in main chat.

**?activated** See all activated items in main chat.

**?buy {item}** Buy an item that may be bought during the day. Items may only be bought with commands in DMs.

**?use {item} {nickname*}** Use an item during the day. Items may only be used with commands in DMs.

**?set {balance}** Mod command for setting balance.

**?give {item}** Mod command for giving items.
`

const items = [
    {
        name: "City Permit",
        cost: 60,
    },
    {
        name: "Common Vote",
        cost: 20,
        discount: 15,
    },
    {
        name: "Power Vote",
        cost: 40,
    }
]

module.exports = {
    name: "Gambling",
    emoji: "💸",
    commandName: ["balance", "buy", "use", "items", "activated", "set", "give"],
    description: "For gambling of course! Game specific extension.",
    priority: [ "onVote", "onVotes" ], //events that need a return can only have one extensions modifying it, this prevents multiple extensions from modifying the same event
    help: help,
    commands: [
        {
            name: "balance",
            arguments: {
                required: [],
                optional: []
            }
        }, {
            name: "buy",
            arguments: {
                required: [ z.string(), z.string() ],
                optional: [],
            }
        }, {
            name: "items",
            arguments: {
                required: [],
                optional: [],
            }
        }, {
            name: "set",
            arguments: {
                required: [ z.coerce.number() ],
                optional: []
            }
        }, {
            name: "give",
            arguments: {
                required: [ z.string(), z.string() ],
                optional: []
            }
        }, {
            name: "use",
            arguments: {
                required: [ z.string(), z.string() ],
                optional: [ z.string() ]
            }
        }, {
            name: "activated",
            arguments: {
                required: [],
                optional: []
            }
        }
    ] satisfies CommandOptions[],
    onStart: async (global, setup, game) => {
        /**
         * Runs during game start processes.
         */

        const db = firebaseAdmin.getFirestore();

        await deleteCollection(db, db.collection('gambling'), 20);
        await deleteCollection(db, db.collection('items'), 20);

        return;

        /**
         * Nothing to return.
         */
    },
    onLock: async (global, setup, game) => {
        /**
         * Runs after game has locked.
         */

        console.log("Extension Lock");
    },
    onUnlock: async (global, setup, game, incremented: boolean) => {
        /**
         * Runa after game has unlocked.
         * 
         * incremented: boolean - Whether day has advanced or not.
         */

        console.log("Extension Unlock", incremented);

        if(incremented) {
            const db = firebaseAdmin.getFirestore();
            const activatedItems = await db.collection('items').where('activated', '==', true).get();

            const batch = db.batch();
            activatedItems.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
        }

        return;

        /**
         * Nothing to return.
         */
    },
    onCommand: async (command: Command) => {
        /**
         * Text commands only for the forseeable future.
         * 
         * command: Command
         */

        const setup = await getSetup();
        const global = await getGlobal();
        const member = await setup.primary.guild.members.fetch(command.user.id);
        const player = await getUser(member.id);
        const game = await getGameByID(global.game ?? "");
        const dm = await getUserByChannel(command.message.channelId);

        const db = firebaseAdmin.getFirestore();

        console.log(command);

        if(dm && global.players.find(player => player.id == dm.id) != null && dm.channel == command.message.channelId) {
            if(command.name == "balance") {
                const ref = db.collection('gambling').doc(dm.id);
    
                const data = (await ref.get()).data();
    
                if(data) {
                    const embed = new EmbedBuilder()
                        .setTitle("Balance")
                        .setDescription("Your balance is " + data.balance + " nilla dollar" + (data.balance == 1 ? "" : "s") + ".")
                        .setColor(Colors.Green);
    
                    return await command.reply({ embeds: [ embed ] });
                } else {
                    await ref.set({ balance: 0 });
    
                    const embed = new EmbedBuilder()
                        .setTitle("Balance")
                        .setDescription("Your balance is 0 nilla dollars.")
                        .setColor(Colors.Green);
    
                    return await command.reply({ embeds: [ embed ] });
                }
            } else if(command.name == "buy") {
                const name = command.arguments[0] as string + " " + command.arguments[1] as string;

                const item = items.find(item => item.name.toLowerCase() == name.toLowerCase());

                if(item == undefined) return await command.reply("Item not found.");

                const ref = db.collection('gambling').doc(dm.id);

                const data = (await ref.get()).data();

                if(data == undefined) return await command.reply("You have no balance.");
                
                if(data.balance < 0) return await command.reply("You have no balance.");

                let cost = item.cost;

                if(data.discount == true) cost == item.discount; 

                if(data.balance < item.cost) return await command.reply("You do not have enough nilla dollars.");

                const result = await db.runTransaction(async (transaction) => {
                    const doc = await transaction.get(ref);

                    const data = doc.data();

                    if(!doc.exists || !data) return false;

                    const balance = data.balance;

                    if(balance < item.cost) return false;

                    transaction.update(ref, { balance: balance - item.cost });

                    return true;
                });

                if(!result) return await command.reply("Transaction failed.");

                await db.collection('items').add({ name: item.name, activated: false, id: dm.id });

                await ref.update({ balance: data.balance - item.cost });

                await command.message.react("✅");
            } else if(command.name == "items") {
                const items = (await db.collection('items').where('id', '==', dm.id).get()).docs;

                let message = "";

                for(let i = 0; i < items.length; i++) {
                    const data = items[i].data();

                    message += data.name + (data.activated ? " (Activated)" : "") + "\n";
                }

                const embed = new EmbedBuilder()
                    .setTitle("Items")
                    .setDescription(message == "" ? "No items." : message)
                    .setColor(Colors.Green);

                return await command.reply({ embeds: [ embed ] });
            } else if(command.name == "set") {
                checkMod(setup, command.user.id);

                const user = dm;

                if(user == null) throw new Error("User not found.");

                const balance = command.arguments[0] as number;

                const ref = db.collection('gambling').doc(user.id);

                await ref.set({ balance: balance });

                await command.message.react("✅");
            } else if(command.name == "give") {
                checkMod(setup, command.user.id);

                const name = command.arguments[0] as string + " " + command.arguments[1] as string;

                const item = items.find(item => item.name.toLowerCase() == name.toLowerCase());

                if(item == undefined) return await command.reply("Item not found.");

                await db.collection('items').add({ name: item.name, activated: false, id: dm.id });

                await command.message.react("✅");
                
            } else if(command.name == "use") {
                const name = command.arguments[0] as string + " " + command.arguments[1] as string;

                const item = items.find(item => item.name.toLowerCase() == name.toLowerCase());

                if(item == undefined) return await command.reply("Item not found.");

                const owned = (await db.collection('items').where('id', '==', dm.id).get()).docs;

                let target: User | undefined = undefined;

                if(item.name == "City Permit" && command.arguments[2] == undefined) {
                    return await command.reply("You must specify a nickname.");
                } else if(item.name == "City Permit") {
                    const nickname = (command.arguments[2] as string);

                    target = await getUserByName(nickname.substring(0, 1).toUpperCase() + nickname.substring(1).toLowerCase());

                    if(target == undefined || global.players.find(player => player.id == (target as User).id) == null) return await command.reply("User not found.");
                }

                const doc = owned.find(doc => doc.data().name.toLowerCase() == item.name.toLowerCase() && !doc.data().activated);

                if(doc == undefined) return await command.reply("You do not have an unactivated item.");

                const result = await db.runTransaction(async (transaction) => {
                    const owned = (await transaction.get(db.collection('items').where('id', '==', dm.id))).docs;

                    const doc = owned.find(doc => doc.data().name.toLowerCase() == item.name.toLowerCase() && !doc.data().activated);

                    if(doc == undefined) {
                        return false;
                    } else {
                       if(target == undefined) {
                          transaction.update(doc.ref, { activated: true });
                       } else {
                          transaction.update(doc.ref, { activated: true, target: target.id });
                       }
                    }

                    return true;
                });

                if(!result) return await command.reply("Activation failed.");

                if(target == undefined) {
                    await setup.primary.chat.send("# " + dm.nickname + " has activated a " + item.name + ".");
                } else {
                    await setup.primary.chat.send("# Someone has activated a City Permit on " + target.nickname + ".");
                }

                await command.message.react("✅");
            }
        } else if(command.message.channelId == game.channels.spec) {
            if(command.name == "balance") {
                const players = await getUsersArray(global.players.map(player => player.id));
                const balances = (await db.collection('gambling').get()).docs;

                let message = "";

                let total = 0;

                for(let i = 0; i < players.length; i++) {
                    const data = balances.find(doc => doc.id == players[i].id)?.data();
                    const balance = data ? data.balance : 0;

                    message += players[i].nickname + " - $" + balance + "\n";
                    total += balance;
                }

                message += "\nTotal: $" + total;

                const embed = new EmbedBuilder()
                    .setTitle("Balances")
                    .setDescription(message)
                    .setColor(Colors.Green);

                return await command.reply({ embeds: [ embed ] });
            } else if(command.name == "items") {
                const docs = (await db.collection('items').get()).docs;
                const players = await getUsersArray(global.players.map(player => player.id));

                let final = "";

                for(let i = 0; i < players.length; i++) {
                    const items = docs.filter(doc => doc.data().id == players[i].id);

                    let message = "";

                    for(let i = 0; i < items.length; i++) {
                        const data = items[i].data();

                        if(!data) continue;
    
                        message += data.name + (data.activated ? " (Activated)" : "") + ", ";
                    }

                    final += players[i].nickname + " - " + (message == "" ? "None" : message.substring(0, message.length - 2)) + "\n";
                }
                
                const embed = new EmbedBuilder()
                    .setTitle("Items")
                    .setDescription(final)
                    .setColor(Colors.Green);

                return await command.reply({ embeds: [ embed ] });
            }
        } else if(command.message.channelId == game.channels.mafia) {
            if(command.name == "balance") {
                const players = await getUsersArray(global.players.filter(player => player.alignment == 'mafia').map(player => player.id));
                const balances = (await db.collection('gambling').get()).docs;

                let message = "";

                for(let i = 0; i < players.length; i++) {
                    const data = balances.find(doc => doc.id == players[i].id)?.data();
                    const balance = data ? data.balance : 0;

                    message += players[i].nickname + " - $" + balance + "\n";
                }

                const embed = new EmbedBuilder()
                    .setTitle("Balances")
                    .setDescription(message == "" ? "No mafia players." : message)
                    .setColor(Colors.Green);
                    
                return await command.reply({ embeds: [ embed ] });
            } else if(command.name == "items") {
                const docs = (await db.collection('items').get()).docs;
                const players = await getUsersArray(global.players.filter(player => player.alignment == 'mafia').map(player => player.id));

                let final = "";

                for(let i = 0; i < players.length; i++) {
                    const items = docs.filter(doc => doc.data().id == players[i].id);

                    let message = "";

                    for(let i = 0; i < items.length; i++) {
                        const data = items[i].data();

                        if(!data) continue;
    
                        message += data.name + (data.activated ? " (Activated)" : "") + ", ";
                    }

                    final += players[i].nickname + " - " + (message == "" ? "None" : message.substring(0, message.length - 2)) + "\n";
                }
                
                const embed = new EmbedBuilder()
                    .setTitle("Items")
                    .setDescription(final == "" ? "No mafia players." : final)
                    .setColor(Colors.Green);

                return await command.reply({ embeds: [ embed ] });
            }
        } else if(command.message.channelId == setup.primary.chat.id) {
            if(command.name == "balance") {
                return await command.reply("You cannot check your balance in main chat.");
            } else if(command.name == "buy") {
                return await command.reply("You cannot buy items in main chat.");
            } else if(command.name == "set") {
                return await command.reply("You cannot set balance in main chat.");
            } else if(command.name == "give") {
                return await command.reply("You cannot give items in main chat.");
            } else if(command.name == "use") {
                return await command.reply("You cannot use items in main chat.");
            }

            if(command.name == "activated") {
                const docs = (await db.collection('items').where('activated', '==', true).get()).docs;
                const players = await getUsersArray(global.players.map(player => player.id));

                let final = "";

                const permits = new Array<string>()

                for(let i = 0; i < players.length; i++) {
                    const items = docs.filter(doc => doc.data().id == players[i].id);

                    let message = "";

                    for(let i = 0; i < items.length; i++) {
                        const data = items[i].data();

                        if(!data) continue;

                        if(data.name != "City Permit") {
                            message += data.name + ", ";
                        } else {
                            permits.push(data.target);
                        }
                    }

                    if(message != "") {
                        final += players[i].nickname + " - " + message.substring(0, message.length - 2) + "\n";
                    }
                }

                if(permits.length > 0) {
                    final += "\n";

                    for(let i = 0; i < permits.length; i++) {
                        const target = await getUser(permits[i]);

                        if(target == undefined) continue;

                        final += "City Permit on " + target.nickname + "\n";
                    }
                }

                const embed = new EmbedBuilder()
                    .setTitle("Activated Items")
                    .setDescription(final == "" ? "No activated items." : final)
                    .setColor(Colors.Green);

                return await command.reply({ embeds: [ embed ]});
            }
        }

        return;

        /**
         * Nothing to return.
         */
    },
    onMessage: async (message: Message, cache: Cache) => {
        /*
         * Keep fetches to a minimum, these can add up. For this reason, only cache is given, only use helper functions when necessary.
         * 
         * cache: { day: number, started: boolean, channel: null | TextChannel } - TextChannel may or may not be fetched depending if bot has fully intialized
         */

        console.log("Extension", message);

        return;

        /**
         * Nothing to return.
         */
    },
    onEnd: async (global, setup, game) => {
        /**
         * Runs during game end processes.
         */

        console.log("Extension End");

        return;

        /**
         * Nothing to return.
         */
    },
    onVote: async (votes: Vote[], vote: Vote | undefined, voted: boolean, users: User[], global, setup, game) => {
            /**
             * Runs after vote is counted, before vote/hammer is annouced.
             * 
             * vote: { id: string, for: string, timestamp: number }[]
             */
    
            console.log("votes", votes);
            console.log("vote", vote);
            console.log("voted", voted);
            console.log("users", users);

            if(!voted || vote == undefined) return { hammer: false, message: null };
    
            const user = users.find(user => user.id == vote.id);
            const target = users.find(user => user.id == vote.for);
    
            if(user == undefined) throw new Error("User not found.");
            if(target == undefined) throw new Error("User not found.");

            const db = firebaseAdmin.getFirestore();
    
            let docs = (await db.collection('items').get()).docs ?? [];
    
            let votesForHammer = votes.filter(v => v.for == vote.for).reduce((prev, vote) => {
                const items = docs.filter(item => item.data().id == vote.id && item.data().name != "City Permit" && item.data().activated) ?? new Array();
    
                let total = 0;

                for(let i = 0; i < items.length; i++) {
                    total++;
                }

                return prev + total + 1;
            }, 0);

            const added = docs.filter(item => item.data().name == "Common Vote" && item.data().activated).length;
    
            let half = (users.length + added) / 2;
            if(half % 1 == 0) half += 0.5;

            let toHammer = votesForHammer >= half;

            if(toHammer) {
                const items = docs.filter(item => item.data().target == target.id && item.data().name == "City Permit" && item.data().activated) ?? new Array();
        
                console.log(items);

                if(items.length > 0) {
                    toHammer = false;
                }
            }
    
            return { hammer: toHammer, message: toHammer ? target.nickname + " has been hammered!" : null, hammered: target.id };
    
            /**
             * hammer: boolean - Tells to hammer or not.
             * message: string | null - Message to append to vote/hammer, null will return default.
             */
        },
    onVotes: async (voting: string[], votes: Map<string, Vote[]>, day: number, users: Map<string, User>, global: Global, setup: Setup, game: Signups, command: ChatInputCommandInteraction | Command) => {
        /**
         * Runs while processing votes command.
         * 
         * voting: string[] - array of each voted person's id
         * votes: Map<string, Vote[]> - array of votes for each voted person, key is person's id
         */

        const db = firebaseAdmin.getFirestore();

        let docs = (await db.collection('items').get()).docs ?? [];

        const message = { description: "", footer: "" };

        const gameSetup = await getGameSetup(game, setup);

        const checking = command.type == 'text' ? command.message : command;

        const deadChat = !(checking.channel?.type != ChannelType.GuildText || checking?.channel.guildId != gameSetup.spec.guildId || checking?.channel.id != gameSetup.spec.id);

        for(let i = 0; i < voting.length; i++) {
            const voted = votes.get(voting[i]) ?? [];

            let count = 0;

            const voters = voted.reduce((previous, current) => {
                const items = docs.filter(item => item.data().id == current.id && item.data().name != "City Permit" && item.data().activated) ?? new Array();

                count += 1 + items.length;

                const indicator = (() => {
                    if(items.length == 0) {
                        return ""
                    } else {
                        let indicator = " (";

                        for(let i = 0; i < items.length; i++) {
                            indicator += items[i].data().name.substring(0, 1) + ", ";
                        }

                        return indicator.substring(0, indicator.length - 2) + ")";
                    }
        
                })();

                return previous += (users.get(current.id)?.nickname ?? "<@" + current + ">") + indicator + ", "
            }, "");

            message.description += count + " - " + (users.get(voting[i])?.nickname ?? "<@" + voting[i] + ">") + " « " + voters;

            message.description = message.description.substring(0, message.description.length - 2);

            message.description += "\n";
        }

        if(message.description == "") {
            message.description = "No votes recorded.";
        }

        const added = docs.filter(item => item.data().name == "Common Vote" && item.data().activated).length;
    
        let half = (global.players.length + added) / 2;
        if(half % 1 == 0) half += 0.5;
        half = Math.ceil(half);

        message.footer = "Hammer is at " + half + " vote" + (half == 1 ? "" : "s") + "."
        
        return message;

        /**
         * A string that will replace the votes list in votes command.
         */
    },
    onHammer: async (global, setup, game, hammered: string) => {},
    onRemove: async (global, setup, game, removed: string) => {}
}