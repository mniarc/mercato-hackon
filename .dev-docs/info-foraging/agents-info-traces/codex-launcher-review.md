# Bounded Codex launcher review (2026-09-18)

## Verified interface

- Installed CLI: `codex-cli 0.155.0`; entrypoint is
  `C:\Users\pkraw\AppData\Roaming\npm\codex.cmd`.
- Official non-interactive guidance:
  <https://developers.openai.com/codex/non-interactive-mode> (redirects to the
  current ChatGPT Learn page).
- Supported local flags needed here:
  - global, **before** `exec`: `-a never`
  - exec: `--sandbox {read-only|workspace-write}`, `-C <dir>`, `--json`,
    `--output-last-message <file>`, `--ephemeral`, `--ignore-user-config`,
    `--disable <feature>`, `--color never`
  - a full prompt can be supplied on stdin with the final `-` argument.
- `-a never` after `exec` is rejected by this version (exit 2). Correct shape:
  `codex -a never exec ...`.
- Official behavior: default sandbox is read-only; `workspace-write` is the
  explicit edit mode; `danger-full-access` is only for isolated environments.
  JSONL emits run events; `-o` writes the final answer separately. Do not use
  deprecated `--full-auto` or either dangerous bypass flag.

## Recommended launcher contract

- Two mutually exclusive parameter sets:
  `-TaskFile <existing file>` or `-Prompt <non-empty string>`.
- Required/resolved `-Workspace`; reject nonexistent paths, paths outside
  `D:\Flow-OpenMercato`, quote characters in paths, and directories not inside
  a Git worktree. This preserves the outer/App repository boundary without
  needing `--skip-git-repo-check`.
- `[ValidateSet('read-only','workspace-write')] -Sandbox`, default
  `workspace-write` for implementation tasks. Never expose
  `danger-full-access` through this helper.
- Bounded timeout, e.g. `[ValidateRange(1,240)] -TimeoutMinutes = 30`.
- Each run gets a unique directory (timestamp plus GUID fragment) containing:
  `events.jsonl`, `stderr.log`, `final.md`, and a small `run.json` with start,
  end, workspace, timeout, sandbox, PID, timed-out flag, and exit code. Keep run
  artifacts out of the team `App` repo; an ignored `.runs/` beside the script
  is convenient.
- Launch arguments should be equivalent to:
  `codex -a never exec --sandbox <mode> --ephemeral --ignore-user-config
  --disable multi_agent --color never --json -C <workspace>
  -o <final.md> -`.
  Keep project/user exec-policy rules active; do **not** pass `--ignore-rules`.
- `--ignore-user-config` provides a repeatable bounded run while retaining
  saved CLI authentication. Omitting it is acceptable only if the user wants
  their MCP/plugins/profile loaded for the task.
- Feed the prompt through redirected stdin, not the command line. This avoids
  Windows command-line length and quoting failures and keeps the task text out
  of process listings.

## Boundaries injected ahead of the task

Prepend a short fixed instruction block:

1. This is one bounded worker; do not call `codex`, spawn subagents, start
   background automation, or delegate the task.
2. Work only in the resolved workspace and obey applicable `AGENTS.md` files.
3. Never run `git add`, `commit`, `push`, `reset`, `checkout`, `switch`,
   `merge`, `rebase`, or `tag`; leave changes unstaged. Read-only Git inspection
   is allowed.
4. Stay inside the supplied task; report changed files, validation, and
   blockers in the final response.

Also set a process-scoped guard such as `FLOW_CODEX_LAUNCH_DEPTH=1`. Refuse to
start when it is already present/nonzero. The child inherits it, so a nested
call to this launcher fails. `--disable multi_agent` removes the ordinary
internal subagent route. These controls are defense in depth; the prompt alone
is not an enforcement boundary.

`-a never` plus the sandbox means an operation requiring elevation fails back
to the worker instead of hanging for interactive approval. Network access is
not granted by the launcher, so `git push` should be unavailable; workspace
sandbox protections plus the explicit ban protect Git metadata. Optionally
record the workspace repository HEAD before and after and fail/report if it
changed, but do not attempt an automatic rollback.

## PowerShell/Windows pitfalls

- Host is Windows PowerShell 5.1 (`PSEdition=Desktop`, CLR 4.0), not `pwsh`.
- On this exact host the process environment contains both `Path` and `PATH`.
  `Start-Process` throws `Item has already been added ... Path/PATH` before it
  launches. Do not base the launcher on `Start-Process`.
- `codex.cmd` is a batch trampoline to Node. `ProcessStartInfo` cannot execute a
  `.cmd` directly when `UseShellExecute=false`; launch `%ComSpec% /d /s /c`
  with the fully quoted `codex.cmd` path. Keep all user prompt text on stdin.
- Windows PowerShell 5.1 has no `Process.Kill(true)` tree-kill overload. On
  timeout (and in `finally`) run `taskkill.exe /PID <capturedPid> /T /F`, then
  wait briefly for process exit. `Stop-Process` alone can orphan Node.
- Redirecting stdout and stderr and then calling synchronous `ReadToEnd()` on
  one stream can deadlock if the other pipe fills. Start both
  `ReadToEndAsync()` calls immediately, then `WaitForExit(timeoutMs)`, terminate
  on timeout, and only then consume both tasks.
- Preserve the native exit code. Treat timeout as its own nonzero result and
  treat missing/empty `final.md` as failure even if a log exists.
- `Set-Content`/`Out-File` default encoding in Windows PowerShell 5.1 is often
  UTF-16LE. Write logs/metadata with explicit UTF-8 (prefer UTF-8 without BOM)
  using .NET file APIs; JSONL consumers otherwise break easily.
- Reject CR/LF or quote characters in any value that must enter the `cmd.exe`
  argument string. Resolve and validate all paths before quoting them. Prompt
  and task file content must never be interpolated into that string.
- Use `try/finally` to close stdin, terminate a still-running process tree, and
  restore/remove the recursion-guard environment variable. Avoid printing
  secrets or the full task text to the console. Note that `events.jsonl` may
  itself contain repository excerpts or command output, so keep `.runs/`
  ignored and local.

## Review conclusion

The launcher is sensible and can safely add bounded external capacity if it is
single-run, disables internal multi-agent fan-out, runs with `-a never` and an
explicit non-dangerous sandbox, feeds tasks over stdin, records outputs outside
the team repo, and kills the entire Windows process tree on timeout. It should
not include queueing, retries, resume, commit/push, or parallel orchestration in
the first version; callers can start several independent bounded processes if
they consciously want parallelism.
