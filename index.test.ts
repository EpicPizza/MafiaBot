import { disable, isDisabled } from './src/disable';

beforeAll(() => {
    disable();
})

test("Disable client.", () => {
    expect(isDisabled()).toBe(true);
});