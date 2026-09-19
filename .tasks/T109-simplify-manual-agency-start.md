# T109 - Start both agency demo perspectives with one command

State: active (15 launcher checks and app typecheck passed; coordinated manual startup pending)
Depends on: T93
Owns: `bin-dev/agency.*`, `ai-company/scripts/agency-dev.mjs`, its focused tests, existing manual-start guide.
Sources: user request for a single customer/employee demo startup; existing T93 manual profiles.

## Deliver
- Reuse the native launcher and retained fixture database; normal fixture startup should not require copying scope IDs when one intended scope can be resolved safely.
- Preserve explicit scope selection when ambiguous and separate opt-in live execution. Print customer and staff entry URLs together.
- Update existing short run instructions, not another launcher or guide.

## Done when
- Focused launcher checks cover explicit, unambiguous and ambiguous scope selection; coordinated manual startup proves both perspectives use the same app.
- Do not run shared tests, servers, database commands or builds during parallel implementation; hand off for combined verification.
