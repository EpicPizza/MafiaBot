import { flow, getVotes, Log, Vote } from "./vote";

test('Empty hammer test.', () => {
    expect(flow.determineHammer({ id: "---", for: 'unvote', timestamp: new Date().valueOf() }, [], [])).toEqual({
        message: null,
        hammered: false,
        id: null
    });
});

test('getVotes', () => {
    const transaction = jest.fn();

    transaction.mockReturnValue(Promise.resolve({ docs: [] }));

    expect(getVotes(0, { get: transaction } as any)).resolves.toEqual([]);

    expect(transaction).toHaveBeenCalledTimes(1);

    transaction.mockReset();

    let votes = [{
        id: Math.random().toString(),
        for: Math.random().toString(),
        timestamp: new Date().valueOf()
    }] satisfies Vote[];

    transaction.mockReturnValue(Promise.resolve({ docs: [{ data: () => ({
        timestamp: new Date().valueOf(),
        messageId: null,
        vote: votes[0],
        board: "",
        type: 'standard'
    })}] satisfies { data: () => Log }[] }));

    expect(getVotes(0, { get: transaction } as any)).resolves.toEqual(votes);
    
    expect(transaction).toHaveBeenCalledTimes(1);
})