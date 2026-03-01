# Total Recall Memory System — Schema & Protocol

> Loaded every session. Teaches Claude how this memory system works.

## Four-Tier Architecture

```
CLAUDE.local.md          ← Working memory (auto-loaded, ~1500 words)
memory/registers/        ← Domain registers (load on demand)
memory/daily/            ← Daily logs (chronological raw capture)
memory/archive/          ← Completed/superseded items (cold storage)
```

### Tier 1: Working Memory (`CLAUDE.local.md`)
- Auto-loaded every session
- ~1500 word limit — ruthlessly pruned
- Only behavior-changing facts: active context, key decisions, preferences, open loops
- Updated immediately when something changes the way Claude should work

### Tier 2: Registers (`memory/registers/`)
- Domain-specific, loaded on demand when topic arises
- Six registers: people, projects, decisions, preferences, tech-stack, open-loops
- More detailed than working memory; fewer items than daily logs

### Tier 3: Daily Logs (`memory/daily/`)
- Chronological raw capture — everything that happened
- Never delete; archive when too old
- Source material for promoting to registers

### Tier 4: Archive (`memory/archive/`)
- Completed projects, superseded decisions, old daily logs
- Cold storage — loaded only when explicitly needed

---

## Write Gate Rules

Before writing anything, ask: **"Does this change future behavior?"**

| If yes → write | If no → skip |
|----------------|--------------|
| User expressed a preference | Routine task completed |
| A decision was made with rationale | Info already captured |
| A new constraint was discovered | Temporary/one-off context |
| A person's role/style was revealed | Status update with no impact |
| A deadline or commitment was set | |

**Default destination**: Daily log first, then promote if it recurs or matters long-term.

---

## Read Rules

| Auto-loaded (every session) | Load on demand |
|-----------------------------|----------------|
| `CLAUDE.local.md` | Any register when its topic comes up |
| `memory/SCHEMA.md` | Daily logs when historical context needed |
| `memory/registers/open-loops.md` | Archive when past project resurfaces |

---

## Routing Table

| Trigger | Destination |
|---------|-------------|
| "Remember that I prefer…" | preferences.md + working memory |
| Person mentioned by name | people.md |
| Project discussed | projects.md |
| Decision made with rationale | decisions.md |
| Technical choice / tool selected | tech-stack.md |
| Follow-up / deadline / commitment | open-loops.md |
| Anything else notable | daily log |

---

## Contradiction Protocol

**Never silently overwrite.** When new info contradicts existing:

1. Mark old entry as `~~superseded~~` with date
2. Add new entry with source/date
3. Note the change in today's daily log
4. Update working memory if behavior-changing

---

## Correction Handling

Corrections get **highest priority writes**:
1. Fix the register immediately
2. Update working memory if the old info was there
3. Note correction in daily log with: `CORRECTION: [what changed and why]`
4. Propagate to all tiers that had the wrong info

---

## Maintenance Cadences

**Immediate** (during session):
- Capture decisions, preferences, commitments as they happen
- Write to daily log; update working memory if critical

**End of session**:
- Review daily log for items worth promoting to registers
- Prune working memory to stay under ~1500 words
- Close completed open loops

**Periodic** (every few sessions):
- Promote recurring daily log patterns to registers
- Merge duplicate register entries

**Quarterly**:
- Archive daily logs older than 90 days
- Archive completed projects
- Review and prune all registers

---

## File Locations

- Working memory: `CLAUDE.local.md` (project root, auto-loaded, gitignored)
- Protocol: `.claude/rules/total-recall.md` (auto-loaded if it exists)
- Registers: `memory/registers/`
- Daily logs: `memory/daily/YYYY-MM-DD.md`
- Archive: `memory/archive/`
