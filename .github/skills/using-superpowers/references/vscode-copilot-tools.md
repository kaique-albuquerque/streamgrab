## VS Code / GitHub Copilot tool mapping

This port was imported into `.github/skills/`, the project skills location
VS Code reads. Skills are discovered automatically, so there is no `Skill`
tool to call: **to invoke a skill, read its `SKILL.md` and follow it** (for
example `.github/skills/test-driven-development/SKILL.md`). Announce
"Using [skill] to [purpose]" either way.

Trust your actual tool list over this table when they disagree.

| Skill wording | Copilot tool in VS Code |
| --- | --- |
| `Skill` tool | Read `.github/skills/<name>/SKILL.md` |
| `Task` tool (spawn a subagent) | `runSubagent` / the `task` tool with `agent_type` |
| Background/parallel agents | `task` with `mode: "background"`, then `read_agent` / `write_agent` |
| `TodoWrite` / `TaskCreate` | `sql` tool on the `todos` / `todo_deps` tables (or `manage_todo_list`) |
| `Read` / `Write` / `Edit` | `read_file`, `create`, `edit` (prefer `view`/`edit` over `create` for existing files) |
| `Grep` / `Glob` | `grep`, `glob`, plus `usages` and `problems` for code intelligence |
| `Bash` | `run_in_terminal` (PowerShell on Windows: `;` instead of `&&`) |
| `WebFetch` / `WebSearch` | `fetch_webpage` |
| `AskUserQuestion` | `vscode_askQuestions` |
| Running tests | `runTests`, or `npm run test:unit` in the terminal |

### Subagents

`dispatching-parallel-agents` and `subagent-driven-development` are usable
here: the `task` tool gives each subagent a clean context, and
`agent_type: "general-purpose"` is the implementer equivalent. Launch
independent agents in the same tool block so they run concurrently.

Constraints worth knowing before you plan around them:

- A subagent cannot talk back mid-task. Put the whole brief in `prompt`.
- Background agents report when their turn ends; read results with
  `read_agent` instead of polling.
- Subagents inherit this repository's instruction files, so keep project
  rules in `.github/instructions/` rather than repeating them per dispatch.

### Worktrees

`using-git-worktrees` and `finishing-a-development-branch` run fine on
Windows, but prefer `git worktree add <path>` from the terminal over any
harness-specific isolation feature so the commands stay reproducible.

See `using-git-worktrees` Step 0 and `finishing-a-development-branch`
Step 1 for the environment-detection commands each skill expects.
