import { ZodObject, z } from "zod"

interface Command {
    name: string,
    arguments: (string | number | boolean)[]
}

export interface CommandOptions {
    name: string,
    arguments: ZodObject<any>[]
}