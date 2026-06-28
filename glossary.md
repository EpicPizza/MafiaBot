# glossary

what things are from my experience coding with alej's mafiabot, because alej doesn't comment things very much unfortunately. i hope this helps!

&mdash; cy aka snek aka s-gobo

## disclaimer

i guarentee that at least one thing here is not fully accurate. **this glossary is meant to supplement, not replace bothering alej**

i refuse the right to reserve service.

## ts pmo

this entire library is coded in ts; thus, it pmo.

## command

`module.exports` is where the entire command goes, basically treats the file as a module

### data

how to run this command

can take text, slash commands, and/or buttons

the actual structure is better explained [here](README.md#command-structure)

note that [`execute`](#execute) doesn't differentiate between how you run the command, you must explicitly [check](#differentiate) somehow

### execute

an async fn that takes an [interaction](#interaction) and returns void

runs when the command is triggered

## interaction

what triggered the command, can be text, slash, or button

### differentiate

#### button

to check if it's a button, see if the object has a `customId`. all `customId`s must be JSON with a name string field as specified by the [`customId` rules](README.md#interactions-with-customid)

```js
let isButton = "customId" in interaction;
```

#### text

to check if it's text, just check the `type` field of the interaction

```js
let isText = interaction.type == 'text';
```

for some reason, `interaction.type` is either the word "text" for text interactions or a crazy object otherwise

#### slash

if it's not a text or button interaction, it's a slash interaction

```js
let isSlash = !isText && !isButton;
```

### whodonit

use `interaction.name` to get the name of the person who interacted

use `interaction.user` to get more stuff about them, like their `id` (which is what discord refers to them as, and what you should use to ping them)

## instance

this is the server group in which mafia is run

for example, ucsc, bag, etc.

<s style="font-size:75%">personally, i think instance should be renamed universe</s>

`interaction.instance` is the **instance** in which the interaction was in made

### setup

this has the stuff about the instance, such as the actual servers

they are badly named

the **main** server is `instance.setup.primary`

- where the people chat

the **dms** server is `instance.setup.secondary`

- where you send role info

the **mafia** server is `instance.setup.tertiary`

- where the mafia discuss who to kill

### feedback

#### send a message

```js
instance.setup.primary.chat.send("hello, world!");
```

#### reply to an interaction

```js
interaction.reply(new EmbedBuilder()
    .setTitle("title") 
    .setColor(Colors.Purple)
    .setDescription("hello!")
    .setFooter("made by snek!");
);
```

#### react to an interaction

```js
interaction.message.react("🐍");
```

# thanks :D

thanks for reading!

maybe this ends up helping no one but me, but oh well

sunk cost or smth :/

₍^._.^₎ 𐒡