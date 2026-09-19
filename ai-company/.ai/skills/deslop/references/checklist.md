# Checklist before delivering

Run this on the finished text. Each item is pass or fail. Fix every fail and run again. For detect mode, only the last block applies.

## Meaning and honesty

1. Every claim, number, name, quote, and example in the output was in the user's input or came from the user. Nothing was invented to add specificity.
2. Where a claim needed support the user didn't provide, it is flagged in a bracket or in *What changed*, not silently kept or silently dropped.
3. No manufactured roughness: no deliberate errors, fake hesitations, or "last Tuesday" details that didn't happen.
4. The core point of the piece is the same as the user's core point.

## Voice (edit mode)

5. The writer's vocabulary, register, humour, bluntness, and level of polish survived. Strong human sentences were left alone.
6. Hedges that express real uncertainty were kept; only hedges on claims the writer is sure about were cut.
7. Structure and detours were preserved unless they hurt the piece, and any reorganisation is explained in *What changed*.
8. The amount of cutting matches the amount of slop. A rough draft is still rough in its human places.

## Patterns

9. No throat-clearing openers, faux-insight setups, rhetorical priming, or credential openers.
10. No binary contrasts, negative runways, colon reveals, or self-answered questions.
11. No importance labels, redundant glossing, structural narration, or emphasis crutches.
12. Active voice with a human actor wherever the actor is known. No inanimate things doing human verbs.
13. No weasel attribution, vague declaratives, importance puffery, trailing -ing glosses, or lazy extremes.
14. No fake-profound kicker, recap paragraph, permission-granting line, or boilerplate sign-off.
15. No hedging seesaw; the piece takes its positions.

## Rhythm and words

16. No three consecutive sentences of similar length; no stacked fragments; paragraphs vary in shape.
17. Lists have the number of items the content has, not three by default.
18. The same thing is called by the same word throughout.
19. Words from `words.md` appear only inside quotes, names, code, or deliberate jokes.
20. Em dashes, exclamation marks, and ellipses are within budget for the length and channel.

## Format

21. Formatting matches the channel per `channels.md`: no markdown where it won't render, no headers over tiny sections, no decorative bold, no emoji bullets.
22. Every sentence passes the portability test or was made specific to this subject.

## Delivery

23. The output is the full text (not a diff, not a summary), followed in edit mode by a short *What changed*.
24. The rules are not mentioned anywhere in the output.
25. Detect mode only: each finding quotes the line, names the pattern, gives a short fix; no rewrite, no score, no claim about authorship; an offer to edit follows.

## Client profile (only when `--voice` is set)

26. The profile's approval status and version were checked and are named in the output.
27. Every `replacements` pair and every banned cliché from the profile was applied, within the profile's `replacement_boundary`.
28. Each claim uses the `evidence_language` pattern for its type; no `forbidden_upgrade` occurs.
29. Every `copy_check` from the profile is answered yes, or its failure is reported with the fix applied.
30. Where the profile and the generic rules disagreed, the profile's choice was applied and the disagreement is noted.
