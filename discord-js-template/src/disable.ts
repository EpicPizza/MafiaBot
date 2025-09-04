//peak import shenanigans

//basically, discord.ts has the discord client which some commands need but importing it causes the bot the start since it is started in that file, which is undesireable when setting up commands, so this diasables that when setting up commands

let disabled = false;

export function isDisabled() {
    return disabled;
}

export function disable() {
    disabled = true;
}
