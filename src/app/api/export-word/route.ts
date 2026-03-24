import { NextResponse } from "next/server";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import * as fs from "fs";
import * as path from "path";
import expressionParser from "angular-expressions";

// Configure angular-expressions for jinja2-like syntax
function angularParser(tag: string) {
  tag = tag
    .replace(/^\\./, "this.")
    .replace(/('|')/g, "'")
    .replace(/("|")/g, '"');
  return {
    get: function (scope: Record<string, unknown>) {
      if (tag === ".") return scope;
      const expr = expressionParser.compile(tag);
      return expr(scope);
    },
  };
}

export async function POST(request: Request) {
  try {
    const data = await request.json();

    // Read template from public folder
    const templatePath = path.join(process.cwd(), "public", "vorlage.docx");
    const templateContent = fs.readFileSync(templatePath);

    const zip = new PizZip(templateContent);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      parser: angularParser,
    });

    // Prepare context - same as the local Python app
    const ctx: Record<string, unknown> = { ...data };

    // Clean referents: missing ones become empty string
    for (let i = 1; i <= 10; i++) {
      if (!ctx[`referent_${i}`]) ctx[`referent_${i}`] = "";
    }

    // Format bullets in takeaways
    const rawTake = String(ctx.takeaways || "");
    if (rawTake) {
      const lines = rawTake
        .split("\n")
        .map((l: string) => l.trim())
        .filter(Boolean)
        .map((l: string) => {
          const clean = l.replace(/^[-*]/, "").trim();
          return `• ${clean}`;
        });
      ctx.takeaways = lines.join("\n");
    }

    // Format bullets in zielgruppe
    const rawZiel = String(ctx.zielgruppe || "");
    if (rawZiel) {
      const lines = rawZiel
        .split("\n")
        .map((l: string) => l.trim())
        .filter(Boolean)
        .map((l: string) => {
          const clean = l.replace(/^[-*]/, "").trim();
          return `• ${clean}`;
        });
      ctx.zielgruppe = lines.join("\n");
    }

    // Prepare zeitplan_tag_1 through zeitplan_tag_5
    const zeitplan = (data.zeitplan_alle_tage || {}) as Record<string, Array<Record<string, string>>>;
    for (let i = 1; i <= 5; i++) {
      const tagRows = zeitplan[`Tag ${i}`] || [];
      ctx[`zeitplan_tag_${i}`] = tagRows.map((row: Record<string, string>) => {
        const r = { ...row };
        // Clean referent "-" to empty
        if (r.referent === "-") r.referent = "";
        // Format bullets
        if (r.bullets) {
          const lines = r.bullets
            .split("\n")
            .map((l: string) => l.trim())
            .filter(Boolean)
            .map((l: string) => {
              if (l.startsWith("-") || l.startsWith("*")) {
                return `• ${l.slice(1).trim()}`;
              }
              return l;
            });
          r.bullets = lines.join("\n");
        }
        return r;
      });
    }

    // Build URL with tracking
    let trackingUrl = String(ctx.url || "");
    if (trackingUrl) {
      trackingUrl += trackingUrl.includes("?") ? "&utm_source=agenda" : "?utm_source=agenda";
      ctx.url = trackingUrl;
    }

    // Render template
    doc.render(ctx);

    const buf = doc.getZip().generate({
      type: "uint8array",
      compression: "DEFLATE",
    });

    const vaCode = String(data.va_code || "000").replace(/\//g, "_");

    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="Agenda_${vaCode}.docx"`,
      },
    });
  } catch (error) {
    console.error("Word export error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
