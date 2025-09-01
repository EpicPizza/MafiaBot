import { InvalidArgumentError } from 'commander';
import { ZodType as ZodSchema } from 'zod';

export function fromZod<T extends ZodSchema>(zod: T): (value: string, prev: unknown) => T["_output"] {
    return (value: string, prev: unknown) => {
        const parsedValue = zod.safeParse(value);

        if (!parsedValue.success) {
            throw new InvalidArgumentError(parsedValue.error.message);
        }

        return parsedValue.data;
    };
}   
    
export const simpleJoin = (value: string, prev: string | undefined) => (prev ? prev + " " : "") + value;