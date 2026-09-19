# T91 - Add local agency command wrappers

State: done
Source: user request for portable self/team development aliases
Owns: `bin-dev/` wrappers and their brief testing-process guidance.

## Deliver

- Provide PowerShell 5.1 and POSIX shell aliases for the existing agency start, status, and headed demo scripts.
- Resolve the app directory from the wrapper location and forward existing launcher arguments unchanged.
- Add no runtime, database, setup, build, reset, or paid-call behavior.

## Verify

- Check shell syntax, help output, and dispatch through a temporary fake `yarn` command without starting the app or test runner.

PowerShell 5.1 and Git Bash syntax/help/dispatch checks passed, including arguments,
working directory and propagated exit code. No application or test runtime started.
