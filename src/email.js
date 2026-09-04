import fs from "node:fs";
import nodemailer from "nodemailer";
import { config } from "./config.js";

const USER = process.env.GMAIL_USER;
const PASS = process.env.GMAIL_APP_PASSWORD;
const TO = config.notifyEmail || USER;

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function transport() {
  if (!USER || !PASS) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: USER, pass: PASS },
  });
}

async function send({ subject, html, text, screenshot }) {
  const t = transport();
  if (!t) {
    console.warn("[email] GMAIL_USER / GMAIL_APP_PASSWORD not set — printing instead:\n");
    console.warn(subject + "\n\n" + (text || html.replace(/<[^>]+>/g, "")));
    return null;
  }
  const attachments =
    screenshot && fs.existsSync(screenshot)
      ? [{ filename: "confirmation.png", path: screenshot, cid: "shot" }]
      : [];
  const body = attachments.length
    ? html + `<p style="margin-top:24px"><img src="cid:shot" style="max-width:100%;border:1px solid #ddd;border-radius:6px"></p>`
    : html;
  try {
    return await t.sendMail({ from: `Journal Bot <${USER}>`, to: TO, subject, html: body, attachments });
  } catch (err) {
    // A failed receipt must never mask a successful submission.
    console.error("[email] send failed:", err.message);
    return null;
  }
}

const wrap = (inner) =>
  `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a;max-width:640px">${inner}</div>`;

const field = (label, value) =>
  `<p style="margin:18px 0 4px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#888">${label}</p>` +
  `<p style="margin:0">${esc(value)}</p>`;

export function sendReceipt({ date, answers, activity, submitted, screenshot }) {
  const subject = submitted
    ? `✅ Journal submitted — ${date}`
    : `📝 Journal draft (dry run, not submitted) — ${date}`;
  const stats = `${activity.commits.length} commits · ${activity.pullRequests.length} PR events · ${activity.reviews.length} reviews · ${activity.openPrs.length} open PRs`;

  const html = wrap(
    `<h2 style="margin:0 0 4px;font-size:18px">${submitted ? "Journal submitted" : "Journal draft — not submitted"}</h2>` +
      `<p style="margin:0;color:#888;font-size:13px">${esc(date)} · ${esc(stats)}</p>` +
      field("Key tasks", answers.key_tasks) +
      field("Solved", answers.solved) +
      field("Still open", answers.unsolved) +
      field("Plan", answers.plan)
  );

  const text = [
    subject, stats, "",
    `KEY TASKS\n${answers.key_tasks}`, "",
    `SOLVED\n${answers.solved}`, "",
    `STILL OPEN\n${answers.unsolved}`, "",
    `PLAN\n${answers.plan}`,
  ].join("\n");

  return send({ subject, html, text, screenshot });
}

export function sendAlert(subject, message) {
  return send({
    subject,
    html: wrap(
      `<h2 style="margin:0 0 12px;font-size:18px">${esc(subject)}</h2>` +
        `<p style="margin:0 0 16px;white-space:pre-wrap">${esc(message)}</p>` +
        `<p style="margin:0"><a href="${esc(config.formUrl)}">Open the journal form</a></p>`
    ),
    text: `${subject}\n\n${message}\n\n${config.formUrl}`,
  });
}
