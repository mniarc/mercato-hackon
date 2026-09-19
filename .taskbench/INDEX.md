# Project Management Directory (`.taskbench`)

Single authoritative source for user stories, active tasks, and completed tasks.
The coverage tool (`App/.dev-docs/coverage`) reads from this directory when present.

---

## Directory Overview

```
App/.taskbench/
├── user-stories/     [102 stories] Split-format: each story is a subdirectory
│   ├── 01-sprzedaz/
│   │   ├── F01-1/
│   │   │   ├── story.md       Core story with frontmatter + relationships
│   │   │   ├── _index.md      At-a-glance status table + blocker counts
│   │   │   ├── AC1.md         Individual acceptance criterion with evidence
│   │   │   ├── AC2.md         ...
│   │   │   └── ...
│   │   └── F01-2/
│   │       └── ...
│   └── ...
├── tasks/            [40 files]  Active, in-progress, blocked, and pending tasks
└── tasks-done/       [76 files]  Completed and verified tasks
```

---

### Story format (`user-stories/`)

Each story is a **subdirectory** named by its ID (e.g., `F01-1/`) containing:

| File | Purpose |
|------|---------|
| `story.md` | Full story text with YAML frontmatter (`id`, `kind`, `category`, `feature`, `criteria_count`, `status`, `primary_blocker`). Criteria section redirects to AC files. |
| `_index.md` | Summary dashboard: total/implemented/partial/missing/unassessed criteria counts, blocker type counts, and a per-AC status table with links. |
| `AC*.md` | One per acceptance criterion. YAML frontmatter with `id`, `story`, `status`, `blocking`, `needs_decision`, `needs_trial`, `needs_code`. Body has `## Criterion`, `## Evidence`, and `## Verification` sections. |

### Domain categories

* `01-sprzedaz/`: Offer and pre-purchase questions (F01–F03)
* `02-oplacenie-i-przekazanie/`: Payment matching, validation, and intake (F04–F05)
* `03-audyt-i-research/`: Source register, brand audit, competitors, findings QA (F06–F08)
* `04-brief/`: Brief drafting, review, and client approval (F09–F12)
* `05-strategia/`: Strategy authoring, Tone of Voice (ToV), and paired review (F20–F25)
* `06-planowanie-tresci/`: Content planning, topic selection, post instructions (F26–F29)
* `07-produkcja-postu/`: Post authoring, editorial QA, client text acceptance (F30–F33)
* `08-publikacja/`: Publication configuration, authorization, and dispatch proposals (F34–F37)
* `09-dostawa-i-zamkniecie/`: Package assembly, delivery verification, and closure proposals (F38–F39)
* `e-wyjatki-i-pracownik/`: Native employee exception inbox and human return (F48–F50)
* `g-wspolna-obsluga-klienta/`: Shared customer intake, triage, scope & impact assessment (F40–F47)
* `open-mercato-warstwa-operacyjna/`: Platform cases, lineage projection, execution contracts (F52–F55)
* `przekrojowe-konfiguracja-produktu/`: Pinned execution config and product standards (F60)
* `przekrojowe-wykonanie-agentow/`: Agent execution (F51)
* `demo-dowody-wykonania/`: Execution evidence standards (F56–F59)

---

### Superseded locations

This directory consolidates content previously scattered across:

| Old location | Replaced by |
|--------------|-------------|
| `internal/gem/user-stories/` (flat files) | `.taskbench/user-stories/` (split format) |
| `internal/gem/tasks-active/` | `.taskbench/tasks/` |
| `internal/gem/tasks-done/` | `.taskbench/tasks-done/` |
| `internal/gem-refreshed/user-stories/` | `.taskbench/user-stories/` (same split format) |
| `App/.specs/user-stories/` | `.taskbench/user-stories/` |
| `App/.tasks/` | `.taskbench/tasks/` + `.taskbench/tasks-done/` |
