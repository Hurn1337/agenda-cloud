import { NextResponse } from "next/server";
import PizZip from "pizzip";
import * as fs from "fs";
import * as path from "path";

function escapeXml(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linebreaksToXml(text: string): string {
  if (!text.includes("\n")) return escapeXml(text);
  return text
    .split("\n")
    .map((line, i, arr) => {
      const escaped = escapeXml(line);
      return i < arr.length - 1
        ? escaped + `</w:t><w:br/><w:t xml:space="preserve">`
        : escaped;
    })
    .join("");
}

interface TextNode { text: string; start: number; end: number }

function cleanAndMergeXml(xml: string): string {
  xml = xml.replace(/<w:proofErr[^/]*\/>/g, "");

  const allNodes: TextNode[] = [];
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    allNodes.push({ text: m[1], start: m.index, end: m.index + m[0].length });
  }

  let concat = "";
  const charToNode: number[] = [];
  for (let i = 0; i < allNodes.length; i++) {
    for (let c = 0; c < allNodes[i].text.length; c++) charToNode.push(i);
    concat += allNodes[i].text;
  }

  const tagRe = /(\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\})/g;
  let tm;
  const mergeOps: { startNode: number; endNode: number; mergedText: string }[] = [];
  while ((tm = tagRe.exec(concat)) !== null) {
    const startNode = charToNode[tm.index];
    const endNode = charToNode[tm.index + tm[0].length - 1];
    if (startNode !== endNode) {
      let mergedText = "";
      for (let i = startNode; i <= endNode; i++) mergedText += allNodes[i].text;
      mergeOps.push({ startNode, endNode, mergedText });
    }
  }

  mergeOps.sort((a, b) => b.startNode - a.startNode);
  for (const op of mergeOps) {
    const firstNode = allNodes[op.startNode];
    const lastNode = allNodes[op.endNode];

    const before = xml.substring(0, firstNode.start);
    const rStart = Math.max(before.lastIndexOf("<w:r "), before.lastIndexOf("<w:r>"));

    const after = xml.substring(lastNode.end);
    const rEnd = lastNode.end + after.indexOf("</w:r>") + 6;

    const firstRunXml = xml.substring(rStart, firstNode.start);
    const rPrMatch = firstRunXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
    const rPr = rPrMatch ? rPrMatch[0] : "";

    const newRun = `<w:r>${rPr}<w:t xml:space="preserve">${op.mergedText}</w:t></w:r>`;
    xml = xml.substring(0, rStart) + newRun + xml.substring(rEnd);
  }

  return xml;
}

interface RowData { [key: string]: string }

// Find the start of the enclosing <w:p> for a given position
function findEnclosingParagraphStart(xml: string, pos: number): number {
  const before = xml.substring(0, pos);
  const pStart = Math.max(before.lastIndexOf("<w:p "), before.lastIndexOf("<w:p>"));
  return pStart;
}

// Find the end of the enclosing </w:p> for a given position
function findEnclosingParagraphEnd(xml: string, pos: number): number {
  const after = xml.substring(pos);
  return pos + after.indexOf("</w:p>") + 6;
}

function evaluateCondition(condition: string, ctx: Record<string, unknown>): boolean {
  const orParts = condition.split(/\s+or\s+/);
  for (const part of orParts) {
    const eqMatch = part.trim().match(/(\w+)\.(\w+)\s*==\s*"([^"]*)"/);
    if (eqMatch) {
      const obj = ctx[eqMatch[1]] as RowData | undefined;
      if (obj && obj[eqMatch[2]] === eqMatch[3]) return true;
    }
  }
  return false;
}

// Process conditionals that span across paragraph boundaries:
// <w:p>{% if ... %}</w:p> ... content ... <w:p>{% else %}</w:p> ... content ... <w:p>{% endif %}</w:p>
function processConditionals(xml: string, ctx: Record<string, unknown>): string {
  const ifTagRe = /\{%\s*if\s+([\s\S]*?)\s*%\}/g;
  let fm;

  while ((fm = ifTagRe.exec(xml)) !== null) {
    const condition = fm[1];

    // Find enclosing paragraph of {% if %}
    const ifPStart = findEnclosingParagraphStart(xml, fm.index);
    const ifPEnd = findEnclosingParagraphEnd(xml, fm.index);

    // Find {% else %} and its enclosing paragraph
    const elseRe = /\{%\s*else\s*%\}/g;
    elseRe.lastIndex = ifPEnd;
    const elseMatch = elseRe.exec(xml);
    if (!elseMatch) continue;
    const elsePStart = findEnclosingParagraphStart(xml, elseMatch.index);
    const elsePEnd = findEnclosingParagraphEnd(xml, elseMatch.index);

    // Find {% endif %} and its enclosing paragraph
    const endifRe = /\{%\s*endif\s*%\}/g;
    endifRe.lastIndex = elsePEnd;
    const endifMatch = endifRe.exec(xml);
    if (!endifMatch) continue;
    const endifPStart = findEnclosingParagraphStart(xml, endifMatch.index);
    const endifPEnd = findEnclosingParagraphEnd(xml, endifMatch.index);

    const ifBlock = xml.substring(ifPEnd, elsePStart);
    const elseBlock = xml.substring(elsePEnd, endifPStart);

    const result = evaluateCondition(condition, ctx);
    const replacement = result ? ifBlock : elseBlock;

    xml = xml.substring(0, ifPStart) + replacement + xml.substring(endifPEnd);
    ifTagRe.lastIndex = 0;
  }

  return xml;
}

function processForLoops(xml: string, ctx: Record<string, unknown>): string {
  const forRegex = /\{%\s*for\s+(\w+)\s+in\s+(\w+)\s*%\}/g;
  let fm;

  while ((fm = forRegex.exec(xml)) !== null) {
    const itemVar = fm[1];
    const listVar = fm[2];

    // Find enclosing paragraph of {% for %}
    const forPStart = findEnclosingParagraphStart(xml, fm.index);
    const forPEnd = findEnclosingParagraphEnd(xml, fm.index);

    // Find {% endfor %} and its enclosing paragraph
    const endforRe = /\{%\s*endfor\s*%\}/g;
    endforRe.lastIndex = forPEnd;
    const endm = endforRe.exec(xml);
    if (!endm) continue;
    const endforPStart = findEnclosingParagraphStart(xml, endm.index);
    const endforPEnd = findEnclosingParagraphEnd(xml, endm.index);

    // Template block is everything between the for-paragraph and endfor-paragraph
    const templateBlock = xml.substring(forPEnd, endforPStart);

    const items = (ctx[listVar] || []) as RowData[];
    let generatedXml = "";

    for (const item of items) {
      let rowXml = templateBlock;
      // Process conditionals within the loop iteration
      rowXml = processConditionals(rowXml, { ...ctx, [itemVar]: item });
      // Replace item variables
      rowXml = rowXml.replace(/\{\{\s*item\.(\w+)\s*\}\}/g, (_m, field: string) => {
        return linebreaksToXml(item[field] || "");
      });
      generatedXml += rowXml;
    }

    // Replace from start of for-paragraph through end of endfor-paragraph
    xml = xml.substring(0, forPStart) + generatedXml + xml.substring(endforPEnd);
    forRegex.lastIndex = 0;
  }

  return xml;
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const templatePath = path.join(process.cwd(), "public", "vorlage.docx");
    const templateContent = fs.readFileSync(templatePath);
    const zip = new PizZip(templateContent);

    // Prepare context
    const ctx: Record<string, unknown> = { ...data };

    for (let i = 1; i <= 10; i++) {
      if (!ctx[`referent_${i}`]) ctx[`referent_${i}`] = "";
    }

    // Format bullets
    for (const key of ["takeaways", "zielgruppe"]) {
      const raw = String(ctx[key] || "");
      if (raw) {
        ctx[key] = raw.split("\n").map(l => l.trim()).filter(Boolean)
          .map(l => `• ${l.replace(/^[-*]/, "").trim()}`).join("\n");
      }
    }

    // Prepare zeitplan
    const zeitplan = (data.zeitplan_alle_tage || {}) as Record<string, RowData[]>;
    for (let i = 1; i <= 5; i++) {
      const rows = zeitplan[`Tag ${i}`] || [];
      ctx[`zeitplan_tag_${i}`] = rows.map((row: RowData) => {
        const r = { ...row };
        if (r.referent === "-") r.referent = "";
        if (r.bullets) {
          r.bullets = r.bullets.split("\n").map(l => l.trim()).filter(Boolean)
            .map(l => (l.startsWith("-") || l.startsWith("*")) ? `• ${l.slice(1).trim()}` : l)
            .join("\n");
        }
        return r;
      });
    }

    // URL with tracking
    let trackingUrl = String(ctx.url || "");
    if (trackingUrl) {
      trackingUrl += trackingUrl.includes("?") ? "&utm_source=agenda" : "?utm_source=agenda";
      ctx.url = trackingUrl;
    }

    // Process document.xml
    let docXml = zip.file("word/document.xml")!.asText();
    docXml = cleanAndMergeXml(docXml);
    docXml = processForLoops(docXml, ctx);

    // Replace simple {{variables}}
    docXml = docXml.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, varName: string) => {
      const val = ctx[varName];
      if (val === undefined) return "";
      return linebreaksToXml(String(val));
    });

    // Clean remaining template tags
    docXml = docXml.replace(/\{%[\s\S]*?%\}/g, "");
    docXml = docXml.replace(/\{\{[\s\S]*?\}\}/g, "");

    zip.file("word/document.xml", docXml);

    // Clean docProps
    for (const f of ["docProps/core.xml", "docProps/app.xml"]) {
      const file = zip.file(f);
      if (file) {
        let x = file.asText();
        x = x.replace(/\{\{[^}]*\}\}/g, "");
        zip.file(f, x);
      }
    }

    const buf = zip.generate({ type: "uint8array", compression: "DEFLATE" });
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
