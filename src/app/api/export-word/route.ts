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

function processConditionals(xml: string, ctx: Record<string, unknown>): string {
  const ifRegex = /\{%\s*if\s+([\s\S]*?)\s*%\}([\s\S]*?)\{%\s*else\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
  return xml.replace(ifRegex, (_match, condition: string, ifBlock: string, elseBlock: string) => {
    const orParts = condition.split(/\s+or\s+/);
    let result = false;
    for (const part of orParts) {
      const eqMatch = part.trim().match(/(\w+)\.(\w+)\s*==\s*"([^"]*)"/);
      if (eqMatch) {
        const obj = ctx[eqMatch[1]] as RowData | undefined;
        if (obj && obj[eqMatch[2]] === eqMatch[3]) { result = true; break; }
      }
    }
    return result ? ifBlock : elseBlock;
  });
}

function processForLoops(xml: string, ctx: Record<string, unknown>): string {
  const forRegex = /\{%\s*for\s+(\w+)\s+in\s+(\w+)\s*%\}/g;
  let fm;

  while ((fm = forRegex.exec(xml)) !== null) {
    const itemVar = fm[1];
    const listVar = fm[2];
    const forTagEnd = fm.index + fm[0].length;

    const endforRe = /\{%\s*endfor\s*%\}/g;
    endforRe.lastIndex = forTagEnd;
    const endm = endforRe.exec(xml);
    if (!endm) continue;

    const endforEnd = endm.index + endm[0].length;
    const templateBlock = xml.substring(forTagEnd, endm.index);

    const beforeFor = xml.substring(0, fm.index);
    const forRowStart = Math.max(beforeFor.lastIndexOf("<w:tr "), beforeFor.lastIndexOf("<w:tr>"));

    const afterEndfor = xml.substring(endforEnd);
    const endforRowEnd = endforEnd + afterEndfor.indexOf("</w:tr>") + 7;

    const items = (ctx[listVar] || []) as RowData[];
    let generatedXml = "";

    for (const item of items) {
      let rowXml = templateBlock;
      rowXml = processConditionals(rowXml, { ...ctx, [itemVar]: item });
      rowXml = rowXml.replace(/\{\{\s*item\.(\w+)\s*\}\}/g, (_m, field: string) => {
        return linebreaksToXml(item[field] || "");
      });
      generatedXml += rowXml;
    }

    xml = xml.substring(0, forRowStart) + generatedXml + xml.substring(endforRowEnd);
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
