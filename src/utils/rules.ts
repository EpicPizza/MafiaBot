import { firebaseAdmin } from "./firebase";

export async function getRules() {
    const db = firebaseAdmin.getFirestore();
    
    const domain = (process.env.DEV == 'TRUE' ? process.env.DEVDOMAIN : process.env.DOMAIN);
    let message = "";

    const query = db.collection('documents').where('integration', '==', 'Rules');
    const docs = (await query.get()).docs;
    if(docs.length < 1) throw new Error("Rules not found!");
    if(docs.length > 0) message = (docs[0].data().content as string).replaceAll("](/", "](" + domain + "/");

    return message;
}

export async function getRule(index: number) {
    const content = await getRules();

    const rules = parseMarkdownRules(content);

    if(index >= rules.length) throw new Error("Rule " + (index + 1) + " not found!");

    return rules[index];
}

function parseMarkdownRules(markdownText: string): string[] {
    // A regular expression to detect the start of a rule.
    // It looks for optional whitespace, followed by a number, an optional sub-number (e.g., .1), a period, and a space.
    const ruleRegex = /^\s*(\d+(\.\d+)?\.\s)(.*)/;

    const rules: string[] = [];
    let currentRule = '';

    // Split the entire markdown text into individual lines.
    const lines = markdownText.trim().split('\n');

    // Iterate over each line to build up the rules.
    for (const line of lines) {
        const match = line.match(ruleRegex);
        const isRuleStart = !!match;
        // Check if the line is a known separator or blank line
        const isSeparator = line.trim() === '***' || line.trim() === '';

        if (isRuleStart) {
            // This is the start of a new rule.
            // If we have a previous rule, push it to the array first.
            if (currentRule) {
                rules.push(currentRule.trim());
            }
            // The rule text is in the third capture group (`match[3]`).
            currentRule = match![3];
        } else if (currentRule && !isSeparator) {
            // This is a continuation line of the current rule.
            // Append it only if we're currently building a rule and the line is not a separator.
            currentRule += `\n${line}`;
        } else if (isSeparator) {
            // If a separator is found, it marks the end of the current rule.
            if (currentRule) {
                rules.push(currentRule.trim());
            }
            // Reset the currentRule accumulator for any text that follows.
            currentRule = '';
        }
        // Any other text that is not a rule start or continuation is ignored.
    }

    // After the loop, push the last accumulated rule if it exists.
    if (currentRule) {
        rules.push(currentRule.trim());
    }

    return rules;
}