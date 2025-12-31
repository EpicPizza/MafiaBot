export class SafeError {
    code: number;
    access: number;
    message: string | undefined;
    safe = true;

    constructor(code: number, access: number, message?: string) {
        this.code = code;
        this.access = access;
        this.message = message;
    }
}

export const Access = {
    Player: 0,
    Mod: 1
}

export const Code = {
    SetupIncomplete: 0,
    PlayerNotFound: 1,
    GameNotFound: 2,
    GuildMemberNotFound: 3,
    ChannelNotFound: 4,
    ArgumentTooLong: 5,
    GameNotStarted: 6,
    ChannelLocked: 7,
    ChannelUnlocked: 8,

    Custom: 99,
}

export interface SafeException {
    type: 'safe'
    exception: SafeError,
}

export interface UncaughtException {
    type: 'uncaught'
    exception: Error,
}

export async function safeTry(calling: () => unknown | Promise<unknown>, callback: (exception: SafeException | UncaughtException) => unknown | Promise<unknown>) {
    try {
        await calling();
    } catch(e) {
        if (e instanceof SafeError) {
            await callback({ type: 'safe', exception: e });
        } else {
            const error = e instanceof Error ? e : new Error(String(e));
            await callback({ type: 'uncaught', exception: error });
        }
    }
}