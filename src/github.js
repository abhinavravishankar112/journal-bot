import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.js";

const exec = promisify(execFile);
const ZERO = "0000000000000000000000000000000000000000";

async function gh(endpoint) {
  try {
    const { stdout } = await exec("gh", ["api", "-H", "Accept: application/vnd.github+json", endpoint], {
      maxBuffer: 32 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  } catch (err) {
    const msg = (err.stderr || err.message || "").trim();
    if (/gh auth login/.test(msg)) throw new Error("GitHub CLI is not authenticated. Run: gh auth login");
    const e = new Error(`gh api ${endpoint} failed: ${msg}`);
    e.notFound = /HTTP 404|HTTP 422/.test(msg);
    throw e;
  }
}

const softGh = (endpoint) => gh(endpoint).catch(() => null);

/** config.repo scopes the whole run to one repo; empty means the whole account. */
const REPO = (config.repo || "").toLowerCase();
const inScope = (repo) => !REPO || (repo || "").toLowerCase() === REPO;
const scoped = (q) => (config.repo ? `${q} repo:${config.repo}` : q);

/**
 * The events feed is the only source that spans private repos, every branch, and
 * every contribution type in one call — requesting your own feed while
 * authenticated as yourself returns your private events too.
 */
async function fetchEvents(login, since) {
  const events = [];
  for (let page = 1; page <= 3; page++) {
    const batch = await gh(`users/${login}/events?per_page=100&page=${page}`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    events.push(...batch);
    if (new Date(batch[batch.length - 1].created_at) < since) break;
  }
  return events.filter((e) => new Date(e.created_at) >= since && inScope(e.repo?.name));
}

/**
 * PushEvent payloads no longer carry commit messages — GitHub trimmed them down to
 * before/head SHAs — so each push has to be expanded through the compare API, which
 * returns the commits in the range plus the files the range touched.
 */
async function expandPush(login, { repo, before, head, branch }) {
  const range =
    before && before !== ZERO
      ? await softGh(`repos/${repo}/compare/${before}...${head}`)
      : null;

  if (range?.commits) {
    const mine = range.commits.filter(
      (c) => (c.parents?.length ?? 1) === 1 && (!c.author?.login || c.author.login === login)
    );
    return mine.map((c) => ({
      repo,
      branch,
      sha: c.sha,
      message: c.commit.message,
      files: (range.files || []).slice(0, 15).map((f) => f.filename),
      additions: range.files?.reduce((n, f) => n + (f.additions || 0), 0) ?? 0,
      deletions: range.files?.reduce((n, f) => n + (f.deletions || 0), 0) ?? 0,
    }));
  }

  // New branch, force push, or a compare the API refused: fall back to the head commit.
  const c = await softGh(`repos/${repo}/commits/${head}`);
  if (!c) return [];
  return [
    {
      repo,
      branch,
      sha: c.sha,
      message: c.commit.message,
      files: (c.files || []).slice(0, 15).map((f) => f.filename),
      additions: c.stats?.additions ?? 0,
      deletions: c.stats?.deletions ?? 0,
    },
  ];
}

/**
 * Only `pull_request` is trimmed in the events feed — it arrives as {base, head, id,
 * number, url} with no title or body — so PRs referenced by an event have to be
 * fetched. Issue and review payloads still come through complete.
 */
async function hydratePr(repo, number) {
  const pr = await softGh(`repos/${repo}/pulls/${number}`);
  if (!pr) return null;
  return {
    repo,
    number,
    title: pr.title,
    body: (pr.body || "").slice(0, 800),
    url: pr.html_url,
    state: pr.state,
    merged: !!pr.merged,
    isDraft: !!pr.draft,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
  };
}

async function search(q) {
  const r = await softGh(`search/issues?q=${encodeURIComponent(q)}&per_page=30`);
  return (r?.items || []).map((i) => ({
    title: i.title,
    url: i.html_url,
    repo: i.repository_url.replace("https://api.github.com/repos/", ""),
    isDraft: !!i.draft,
    updatedAt: i.updated_at,
    body: (i.body || "").slice(0, 600),
  }));
}

export async function collectActivity({ start }) {
  const login = config.githubLogin;
  const events = await fetchEvents(login, start);

  const pushes = [];
  const prStubs = [];
  const reviews = [];
  const issues = [];
  const comments = [];
  const branches = [];

  for (const e of events) {
    const repo = e.repo?.name;
    switch (e.type) {
      case "PushEvent":
        pushes.push({
          repo,
          before: e.payload.before,
          head: e.payload.head,
          branch: (e.payload.ref || "").replace("refs/heads/", ""),
        });
        break;
      case "PullRequestEvent":
        prStubs.push({ repo, number: e.payload.number, action: e.payload.action });
        break;
      case "PullRequestReviewEvent":
      case "PullRequestReviewCommentEvent":
        reviews.push({
          repo,
          number: e.payload.pull_request?.number,
          state: e.payload.review?.state,
          body: (e.payload.review?.body || e.payload.comment?.body || "").slice(0, 400),
        });
        break;
      case "IssuesEvent":
        issues.push({
          repo,
          action: e.payload.action,
          title: e.payload.issue.title,
          body: (e.payload.issue.body || "").slice(0, 500),
        });
        break;
      case "IssueCommentEvent":
        comments.push({
          repo,
          on: e.payload.issue?.title,
          body: (e.payload.comment?.body || "").slice(0, 400),
        });
        break;
      case "CreateEvent":
        if (e.payload.ref_type === "branch") branches.push({ repo, branch: e.payload.ref });
        break;
    }
  }

  const expanded = config.fetchCommitDetail
    ? await Promise.all(pushes.slice(0, config.maxCommitDetail).map((p) => expandPush(login, p)))
    : [];

  const seen = new Set();
  const commits = expanded
    .flat()
    .filter((c) => !seen.has(c.sha) && seen.add(c.sha)); // one commit can ride several pushes

  // One fetch per distinct PR, however many events referenced it.
  const prNumbers = [...new Set(
    [...prStubs, ...reviews]
      .filter((r) => r.number)
      .map((r) => `${r.repo}#${r.number}`)
  )].slice(0, 30);
  const hydrated = new Map(
    (await Promise.all(prNumbers.map((key) => {
      const [repo, number] = key.split("#");
      return hydratePr(repo, Number(number)).then((pr) => [key, pr]);
    }))).filter(([, pr]) => pr)
  );

  const pullRequests = prStubs
    .map((s) => {
      const pr = hydrated.get(`${s.repo}#${s.number}`);
      return pr ? { ...pr, action: s.action } : null;
    })
    .filter(Boolean);

  for (const r of reviews) {
    const pr = hydrated.get(`${r.repo}#${r.number}`);
    if (pr) r.title = pr.title;
  }

  const [openPrs, openIssues] = await Promise.all([
    search(scoped(`is:pr is:open author:${login}`)),
    search(scoped(`is:issue is:open assignee:${login}`)),
  ]);

  const total =
    commits.length + pullRequests.length + reviews.length + issues.length + comments.length;

  return {
    login,
    ...(config.repo ? { repo: config.repo } : {}),
    commits,
    pullRequests,
    reviews,
    issues,
    comments,
    branches,
    openPrs,
    openIssues,
    pushCount: pushes.length,
    totalEvents: total,
  };
}
