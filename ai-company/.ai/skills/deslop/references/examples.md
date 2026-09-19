# Before and after

Each example shows the pattern, the fix, and what was deliberately kept. The kept part matters as much as the cut.

## 1. Throat-clearing, binary contrast, kicker

**Before**
> Here's the thing: migrations don't fail because of the code. They fail because of the people. Nobody plans for the human side. Let that sink in.

**After**
> Our last two migrations slipped because nobody owned the cutover communication, not because the scripts broke.

*Cut:* the opener, the not-X-but-Y frame, the disembodied "nobody", the crutch. *Added:* nothing invented; "last two migrations" and "cutover communication" came from the writer's own draft two paragraphs later and were moved up.

## 2. Puffery and -ing gloss

**Before**
> The new release introduces file search, highlighting the team's ongoing commitment to user productivity and marking a pivotal step in the product's evolution.

**After**
> The new release adds file search. You can find a draft from March without leaving the editor.

*Cut:* both abstract glosses. *Replaced with:* the concrete consequence the writer had described in the changelog.

## 3. Weasel attribution (and what to do when there is no source)

**Before**
> Studies show that remote teams are 30% more productive, which is why we're going fully remote.

**After (when the user has the source)**
> A 2024 Stanford study of call-centre staff found remote workers 13% more productive, which pushed us toward going fully remote.

**After (when the user has no source)**
> We're going fully remote. [The productivity claim needs a source or should be cut; I couldn't find where 30% came from.]

*Rule applied:* never invent an attribution. The bracket goes in *What changed* or inline, and the sentence is rewritten to stand without the number.

## 4. Preserving voice

**Before**
> ok so I've been putting off writing this for weeks because honestly I'm not sure I'm right. But here's the thing, I think we should kill the mobile app. Not pause it. Not "revisit in Q3". Kill it.

**After**
> I've been putting off writing this for weeks because I'm not sure I'm right. I think we should kill the mobile app, not pause it or revisit it in Q3.

*Kept:* the admission of doubt, "kill", the informal register, the first-person hesitation. Those are the writer. *Cut:* "here's the thing", the negative runway. *Note:* "honestly" was cut because the sentence already carries the uncertainty; if the writer objects, it goes back.

## 5. Metronome and template paragraph

**Before**
> Onboarding matters. It shapes first impressions. It drives retention. Good onboarding is short. It is focused. It is tested.

**After**
> Onboarding shapes the first impression and, in our data, most of week-two retention, which is why we keep it to four screens and test every change on new signups before it ships.

*Fix:* six identical-length sentences became one with real connective tissue. "In our data" and "four screens" were in the writer's notes; without them the sentence would have stayed vague rather than gaining invented numbers.

## 6. Recap ending and fake-profound kicker

**Before**
> ...and that's how we cut the build to six minutes.
>
> In conclusion, performance work is never truly finished. It's a journey, not a destination. The build isn't the product. The product is the team that keeps improving it.

**After**
> ...and that's how we cut the build to six minutes. Next quarter we're looking at the 90-second test-collection step.

*Cut:* the whole final paragraph. *Added:* one concrete next step that was in the writer's outline. Not a better metaphor.

## 7. Detect mode output

**Input:** a 300-word LinkedIn post.

**Output**
> Patterns found:
>
> 1. "Here's what nobody tells you about scaling a team:" — faux-insight setup. Start at the claim.
> 2. "It's not about hiring faster. It's about hiring right." — binary contrast. State the second half.
> 3. "...which underscores the importance of culture." — trailing -ing gloss. Cut or replace with what culture did.
> 4. "Growth. Trust. Alignment. That's the playbook." — staccato drama. One sentence.
> 5. "The future belongs to those who build it." — fake-profound kicker. Delete; end on the hiring example.
>
> Five patterns in 300 words. I can edit it if you'd like; the hiring example in paragraph two is the strongest part and would carry the post on its own.

*Note:* no score, no claim about who wrote it, an offer to edit, and one honest observation about what already works.

## 8. Write mode: an email

**Request:** "write to the vendor saying we're delaying the contract signature to October because legal hasn't finished the DPA review"

**Output**
> Subject: Contract signature moving to October
>
> Hi Marta,
>
> We need to push the signature to the first week of October. Our legal team hasn't finished reviewing the DPA and I'd rather not sign with open questions on data residency.
>
> Nothing else in the terms is changing on our side. If the delay causes a problem with your Q3 numbers, tell me and I'll see what I can do about a letter of intent in the meantime.
>
> Tomasz

*Applied:* plain text, one ask, reason given, a concrete offer instead of "let me know if you have any questions". No "I hope this finds you well". Named the actual blocker (data residency) because the user's request implied a specific issue; if it hadn't, the email would say "open questions on the DPA" and stop there.

## 9. Polish: puffery and structure

**Przed**
> W dzisiejszym dynamicznie zmieniającym się świecie kluczowe jest, aby zespoły nie tylko dostarczały funkcjonalności, ale także budowały wartość dla klienta. Nowa wersja wprowadza wyszukiwarkę plików, co podkreśla nasze zaangażowanie w produktywność użytkowników.

**Po**
> Nowa wersja dodaje wyszukiwarkę plików. Draft z marca znajdziesz bez wychodzenia z edytora.

*Wycięte:* scena bez sceny, "nie tylko... ale także" bez treści, "kluczowe", gloss o zaangażowaniu. *Dodane:* konkret z changelogu autora.
