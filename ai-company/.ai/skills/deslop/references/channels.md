# Format follows the channel

The same text reads as generated or as human depending on where it lands. Markdown in a rendered doc is normal; markdown in an email is asterisks on the screen. Decide the channel before formatting anything.

## Email

- Plain text. No headers, no bold, no bullet asterisks, no horizontal rules.
- One subject, one ask. If the email has two asks, it is two emails or the second ask is a P.S.
- Open with the reason for writing or the ask itself. "I hope this finds you well" delays the point by a line and signals a template.
- Lists only when items must be scanned (dates, options to choose from). Write them as short lines, not markdown bullets.
- Close with the specific next action and who owns it, or with nothing. "Let me know if you have any questions" is filler unless you mean it.
- Length: a reply the recipient can act on from their phone.

## Chat (Slack, Teams, Discord, DMs, SMS)

- No headers. Bold only for a single key term the reader must not miss, and rarely.
- No emoji bullets. One emoji as tone is fine; a column of ✅ is not.
- Lead with the ask or the answer. Context after, if needed.
- Thread-length messages get a one-line summary first.
- Contractions, sentence fragments, and lowercase are normal here; do not formalise them.

## Social posts (LinkedIn, X, Threads, Mastodon)

- No "🧵", "Thread:", "Hot take:", "Unpopular opinion:" openers.
- No hashtag stacks. Zero to two, inside the sentence if at all.
- No line-per-sentence formatting used to manufacture drama. Paragraphs are allowed.
- No fake-profound closing line. End on the last concrete point.
- No credential opener. If the experience matters, it shows up in the specific example.
- The post should contain at least one thing only this author could have written: a number they measured, a decision they made, something that went wrong.

## Blog posts and articles

- Headers are fine when sections are long enough to need them. A header over two sentences is decoration.
- Open with the useful point or the specific scene. No "In today's world" runway.
- Bullet lists only for scannable items. Argument goes in prose.
- Bold: for defined terms on first use, or not at all. Not for emphasis mid-sentence.
- No recap paragraph. No "In conclusion".
- Introduce a code block or a figure before showing it.

## Documentation, READMEs, specs

- Markdown is expected. Headers, tables, and code blocks are the format.
- Still no filler: "This comprehensive guide will walk you through" says nothing. "This page covers installation on Linux and macOS" does.
- Lead with what the thing does and the shortest path to a working result.
- Imperative mood for instructions. "Run `make test`", not "You should now run the tests."
- No marketing adjectives. "Fast" needs a number; "robust" needs a description of what it survives.

## Cover letters and applications

- No credential opener; the CV has the credentials.
- One paragraph on why this role, one on the most relevant thing you've done, one on what you'd do first. Fewer if fewer is honest.
- No "I am writing to express my interest in". Name the role in the first line as a fact.
- Every sentence should fail the portability test: if it could be sent to another company unchanged, rewrite it.

## Internal memos and decision docs

- Decision first, then reasoning, then alternatives rejected. The reader may stop after the first line.
- Name the decider and the date.
- "We" is fine; "the team feels" is false agency, say who.
- Trade-offs stated plainly, including the cost of the chosen option.

## General

- Headers describe contents, not tone ("Migration steps", not "Let's get started").
- Bullets are uneven in length when the items are uneven. Uniform bullets read as generated.
- Never mix formatted and plain styles in one short piece.
- If the user pastes text with formatting, preserve their format unless it is the problem.
