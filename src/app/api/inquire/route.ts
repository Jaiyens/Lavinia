import { NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";

type InquiryBody = {
  name?: string;
  email?: string;
  company?: string;
  acres?: string;
  role?: string;
  message?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(req: Request) {
  let body: InquiryBody;
  try {
    body = (await req.json()) as InquiryBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = body.name?.trim();
  const email = body.email?.trim();
  const message = body.message?.trim();

  if (!name || !email || !message) {
    return NextResponse.json(
      { error: "Name, email, and message are required." },
      { status: 422 },
    );
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email." }, { status: 422 });
  }

  const fields = {
    Name: name,
    Email: email,
    "Farm / Company": body.company?.trim() || "-",
    Acres: body.acres?.trim() || "-",
    Role: body.role?.trim() || "-",
    Message: message,
  };

  const apiKey = process.env.RESEND_API_KEY;
  const to =
    process.env.INQUIRY_TO_EMAIL ||
    "kamisalahuddin@gmail.com, jaiyen_shetty@berkeley.edu";
  const from = process.env.INQUIRY_FROM_EMAIL || "Terra <onboarding@resend.dev>";

  // No key configured yet → accept gracefully so the UI works in dev / before setup.
  if (!apiKey || !to) {
    console.warn(
      "[inquire] RESEND_API_KEY / INQUIRY_TO_EMAIL not set, logging submission instead of emailing.",
    );
    console.info("[inquire] submission:", fields);
    return NextResponse.json({ ok: true, delivered: false });
  }

  try {
    const resend = new Resend(apiKey);
    const html = `
      <h2 style="font-family:sans-serif">New Terra inquiry</h2>
      <table style="font-family:sans-serif;border-collapse:collapse">
        ${Object.entries(fields)
          .map(
            ([k, v]) =>
              `<tr><td style="padding:6px 14px 6px 0;color:#6f7d68;vertical-align:top"><strong>${k}</strong></td><td style="padding:6px 0">${escapeHtml(
                String(v),
              ).replace(/\n/g, "<br/>")}</td></tr>`,
          )
          .join("")}
      </table>`;

    const { error } = await resend.emails.send({
      from,
      to: to.split(",").map((s) => s.trim()),
      replyTo: email,
      subject: `New inquiry from ${name}${fields["Farm / Company"] !== "-" ? ` · ${fields["Farm / Company"]}` : ""}`,
      html,
    });

    if (error) {
      console.error("[inquire] resend error:", error);
      return NextResponse.json({ error: "Could not send your message." }, { status: 502 });
    }

    return NextResponse.json({ ok: true, delivered: true });
  } catch (err) {
    console.error("[inquire] unexpected error:", err);
    return NextResponse.json({ error: "Could not send your message." }, { status: 500 });
  }
}
