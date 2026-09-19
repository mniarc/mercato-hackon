# T82 - Align portal document preview typography

State: done (bounded renderer styling and focused verification)
Delivery: `00337927a`; further UI bugfixing and visual confirmation belong to the
teammate. This task does not claim a new browser capture or visual acceptance.
Source: user-reported portal review screenshot
Owns: the agency portal document-review renderer and its focused component test.

## Deliver

- Apply the native Open Mercato document-preview type scale and spacing inside the existing sandboxed review iframe.
- Preserve saved client content, annotations, approval behavior, CSP, sandboxing, and the intentionally contained scroll surface.

## Verify

- Run the focused document-review component test and scoped syntax/diff checks without touching the persistent runtime.

Focused component suite passed 13/13. Two incidental exact-CSS assertions were
subsequently removed; renderer behavior was unchanged. Diff check passed. No new
browser capture was made before UI ownership transferred to the teammate.
