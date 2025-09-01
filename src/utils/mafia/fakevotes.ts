import { firebaseAdmin } from "../firebase";
import { getAllUsers } from "./user";

interface FakeVote {
    name: string,
    timestamp: number,
    id: string,
}

interface Placed {
    name: string,
    votes: FakeVote[],
}

export function placeVote(vote: FakeVote, votes: Map<string, FakeVote[]>) {
    removeVote(vote.id, votes);

    const placed = votes.get(vote.name);

    if(placed == undefined) {
        votes.set(vote.name, [ vote ]);
    } else {
        placed.push(vote);
    }
}

export function capitalize(input: string): string {
    return input.length == 0 ? "" : input.substring(0, 1).toUpperCase() + input.substring(1);
}

export async function retrieveVotes(channel: string) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('fakevotes').doc(channel);

    const doc = await ref.get();
    
    const data = doc.data();

    if(data == undefined) {
        return new Map<string, FakeVote[]>();
    } else {
        return new Map(Object.entries(data.votes)) as Map<string, FakeVote[]>;
    }
}

export async function storeVotes(channel: string, votes: Map<string, FakeVote[]>) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('fakevotes').doc(channel);

    await ref.set({
        votes: Object.fromEntries(votes),
    });
}

export async function getBoard(votes: Map<string, FakeVote[]>) {
    const placed = getVotes(votes);

    if(placed.length == 0) return "No votes recorded.";

    const nicknames = await getAllUsers();

    const board = placed.reduce((prev, curr) => prev += (curr.votes.length + " - " + curr.name + " « " + curr.votes.map(vote => {
        const user = nicknames.find(user => user.id == vote.id);

        return user ? user.nickname : "<@" + vote.id + ">";
    }).join(", ")) + "\n", "");

    return board;
}

export function getVotes(votes: Map<string, FakeVote[]>) {
    const compilied = [] as Placed[];

    votes.forEach((placed, name) => {
        placed.sort((a, b) => {
            if(a.timestamp > b.timestamp) return 1;
            if(a.timestamp < b.timestamp) return -1;
            return 0;
        });

        compilied.push({
            name: name,
            votes: placed
        });
    });

    compilied.sort((a, b) => {
        if(a.votes.length > b.votes.length) return -1;
        if(a.votes.length < b.votes.length) return 1;
        return 0;
    });

    return compilied;
}

export function removeVote(id: string, votes: Map<string, FakeVote[]>) {
    votes.forEach((placed, name) => {
        const found = placed.findIndex(vote => vote.id == id);

        if(found != -1) {
            placed.splice(found, 1);
        }

        if(placed.length == 0) {
            votes.delete(name);
        }
    });
}

export function wipeVotes(votes: Map<string, FakeVote[]>) {
    votes.clear();
}