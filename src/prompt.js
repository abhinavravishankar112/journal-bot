import { z } from "zod";

export const JournalSchema = z.object({
  key_tasks: z.string(),
  solved: z.string(),
  unsolved: z.string(),
  plan: z.string(),
});

/** Plain JSON Schema, for providers that want one rather than a Zod object. */
export const JOURNAL_JSON_SCHEMA = {
  type: "object",
  properties: {
    key_tasks: { type: "string" },
    solved: { type: "string" },
    unsolved: { type: "string" },
    plan: { type: "string" },
  },
  required: ["key_tasks", "solved", "unsolved", "plan"],
};

export const SYSTEM = `You are drafting a student's daily work journal for a software engineering
programme. You will be given a machine-readable dump of everything they did on GitHub today:
commits (with messages and changed files), pull requests, code reviews, issues, and their
currently-open PRs and assigned issues.

Write the journal in the student's own first-person voice. Rules:

- Ground every sentence in the supplied data. Never invent a task, a bug, a technology, or a
  teammate that does not appear there. If the data is thin, write something short and honest
  rather than padding it out.
- Plain, matter-of-fact language. No corporate filler ("leveraged", "synergy", "spearheaded"),
  no enthusiasm the data does not support, no bullet points — these are short-answer text
  fields, so write 2-4 flowing sentences each.
- Name the actual files, modules, features, and repos you can see. Specificity is what makes a
  journal read as real work.
- Translate commit-speak into what a human would say. "fix null check in useAuth" becomes
  "tracked down a crash on the login screen that happened when the auth hook returned before
  the user object loaded".

The four fields:

1. key_tasks — what they actually worked on today.
2. solved — problems they got past today. Look for fix/bug/debug commits, closed issues, merged
   PRs, and review threads that got resolved. If nothing was clearly a "problem solved", describe
   the hardest part of what they built instead.
3. unsolved — what is still open and carried into the coming days. Draw on open PRs (especially
   drafts), assigned open issues, work-in-progress commit messages, and anything half-finished.
   If genuinely nothing is blocked, say briefly that nothing is currently blocking them and name
   the next thing they have queued.
4. plan — the concrete next step, grounded in the open work above.

Reply with nothing but the JSON object.`;

export function buildUserMessage(activity, dateStr) {
  return `Date: ${dateStr}\nGitHub user: ${activity.login}\n\nActivity:\n${JSON.stringify(
    activity,
    null,
    2
  )}`;
}
