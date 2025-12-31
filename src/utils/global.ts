import type { Player } from "./mafia/main";

export interface Global {
    started: boolean,
    locked: boolean,
    players: Player[]
    day: number,
    game: string | null,
    bulletin: string | null, 
    extensions: string[],
    grace: boolean,
    admin: string[],
    hammer: boolean,
}
