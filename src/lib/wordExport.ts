import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  HeadingLevel,
  ExternalHyperlink,
  ImageRun,
  PageBreak,
} from "docx";
import { saveAs } from "file-saver";
import type { Fortbildung } from "./types";

function bulletize(text: string): string[] {
  if (!text) return [];
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith("-") || line.startsWith("*")) {
        return `• ${line.slice(1).trim()}`;
      }
      return line.startsWith("•") ? line : `• ${line}`;
    });
}

function getReferentenNames(data: Fortbildung): string[] {
  const names: string[] = [];
  const keys = Object.keys(data)
    .filter((k) => k.startsWith("referent_"))
    .sort((a, b) => {
      const numA = parseInt(a.split("_")[1]);
      const numB = parseInt(b.split("_")[1]);
      return numA - numB;
    });
  for (const k of keys) {
    const val = String(data[k] || "").trim();
    if (val) names.push(val);
  }
  return names;
}

const PUBLIVIO_BLUE = "1A73E8";
const GRAY_BG = "F5F5F5";

function noBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  return { top: none, bottom: none, left: none, right: none };
}

export async function generateWord(data: Fortbildung, logoUrl?: string) {
  const referenten = getReferentenNames(data);

  // Try to load logo
  let logoImage: ImageRun | null = null;
  if (logoUrl) {
    try {
      const response = await fetch(logoUrl);
      const blob = await response.blob();
      const buffer = await blob.arrayBuffer();
      logoImage = new ImageRun({
        data: buffer,
        transformation: { width: 100, height: 100 },
        type: "png",
      });
    } catch {
      // skip logo
    }
  }

  // Build URL with tracking
  let trackingUrl = data.url || "";
  if (trackingUrl) {
    trackingUrl += trackingUrl.includes("?") ? "&utm_source=agenda" : "?utm_source=agenda";
  }

  // --- HEADER SECTION ---
  const headerParagraphs: Paragraph[] = [];

  if (logoImage) {
    headerParagraphs.push(
      new Paragraph({
        children: [logoImage],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      })
    );
  }

  headerParagraphs.push(
    new Paragraph({
      children: [new TextRun({ text: data.titel || "Agenda", bold: true, size: 36, color: PUBLIVIO_BLUE })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    })
  );

  // Info line
  const infoLine: TextRun[] = [];
  if (data.va_code) infoLine.push(new TextRun({ text: `${data.va_code}  |  `, size: 20, color: "666666" }));
  if (data.datum) infoLine.push(new TextRun({ text: `${data.datum}  |  `, size: 20, color: "666666" }));
  if (data.uhrzeit) infoLine.push(new TextRun({ text: `${data.uhrzeit}  |  `, size: 20, color: "666666" }));
  if (data.modalitaet) infoLine.push(new TextRun({ text: data.modalitaet, size: 20, color: "666666" }));
  if (data.preis) infoLine.push(new TextRun({ text: `  |  ${data.preis} €`, size: 20, color: "666666" }));

  if (infoLine.length > 0) {
    headerParagraphs.push(new Paragraph({ children: infoLine, alignment: AlignmentType.CENTER, spacing: { after: 300 } }));
  }

  // --- KURZBESCHREIBUNG ---
  const contentParagraphs: Paragraph[] = [];

  if (data.kurzbeschreibung) {
    contentParagraphs.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Kurzbeschreibung", bold: true, color: PUBLIVIO_BLUE })] }),
      new Paragraph({ children: [new TextRun({ text: data.kurzbeschreibung, size: 22 })], spacing: { after: 200 } })
    );
  }

  // --- THEMEN IM FOKUS ---
  if (data.themen_fokus) {
    contentParagraphs.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Themen im Fokus", bold: true, color: PUBLIVIO_BLUE })] }),
      new Paragraph({ children: [new TextRun({ text: data.themen_fokus, size: 22 })], spacing: { after: 200 } })
    );
  }

  // --- ZIELGRUPPE ---
  if (data.zielgruppe) {
    contentParagraphs.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Zielgruppe", bold: true, color: PUBLIVIO_BLUE })] })
    );
    for (const line of bulletize(data.zielgruppe)) {
      contentParagraphs.push(new Paragraph({ children: [new TextRun({ text: line, size: 22 })], spacing: { after: 40 } }));
    }
    contentParagraphs.push(new Paragraph({ spacing: { after: 200 } }));
  }

  // --- DAS NEHMEN SIE MIT ---
  if (data.takeaways) {
    contentParagraphs.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Das nehmen Sie mit", bold: true, color: PUBLIVIO_BLUE })] })
    );
    for (const line of bulletize(data.takeaways)) {
      contentParagraphs.push(new Paragraph({ children: [new TextRun({ text: line, size: 22 })], spacing: { after: 40 } }));
    }
    contentParagraphs.push(new Paragraph({ spacing: { after: 200 } }));
  }

  // --- REFERENTEN ---
  if (referenten.length > 0) {
    contentParagraphs.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Referent(en)", bold: true, color: PUBLIVIO_BLUE })] }),
      new Paragraph({ children: [new TextRun({ text: referenten.join(", "), size: 22 })], spacing: { after: 300 } })
    );
  }

  // --- ZEITPLAN ---
  const scheduleParagraphs: Paragraph[] = [];
  const zeitplan = data.zeitplan_alle_tage || {};

  for (const [tagName, rows] of Object.entries(zeitplan)) {
    if (!rows || rows.length === 0) continue;

    scheduleParagraphs.push(
      new Paragraph({
        children: [new PageBreak()],
      }),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: `Agenda – ${tagName}`, bold: true, size: 28, color: PUBLIVIO_BLUE })],
        spacing: { after: 200 },
      })
    );

    // Table header
    const headerRow = new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "Uhrzeit", bold: true, size: 18, color: "FFFFFF" })] })],
          width: { size: 12, type: WidthType.PERCENTAGE },
          shading: { fill: PUBLIVIO_BLUE },
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "Programmpunkt", bold: true, size: 18, color: "FFFFFF" })] })],
          width: { size: 25, type: WidthType.PERCENTAGE },
          shading: { fill: PUBLIVIO_BLUE },
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "Details", bold: true, size: 18, color: "FFFFFF" })] })],
          width: { size: 43, type: WidthType.PERCENTAGE },
          shading: { fill: PUBLIVIO_BLUE },
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "Referent", bold: true, size: 18, color: "FFFFFF" })] })],
          width: { size: 20, type: WidthType.PERCENTAGE },
          shading: { fill: PUBLIVIO_BLUE },
        }),
      ],
    });

    const dataRows = rows.map((row, idx) => {
      const isAlt = idx % 2 === 1;
      const bgColor = isAlt ? GRAY_BG : "FFFFFF";

      const bulletLines = row.bullets
        ? row.bullets.split("\n").map((l) => l.trim()).filter(Boolean)
        : [];
      const detailParagraphs =
        bulletLines.length > 0
          ? bulletLines.map(
              (line) =>
                new Paragraph({
                  children: [
                    new TextRun({
                      text: line.startsWith("-") || line.startsWith("*") ? `• ${line.slice(1).trim()}` : line,
                      size: 18,
                    }),
                  ],
                })
            )
          : [new Paragraph({ children: [new TextRun({ text: row.titel || "", size: 18 })] })];

      const refText = row.referent === "-" ? "" : row.referent || "";

      return new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: row.uhrzeit || "", size: 18 })] })],
            shading: { fill: bgColor },
          }),
          new TableCell({
            children: [
              new Paragraph({ children: [new TextRun({ text: row.art || "", bold: true, size: 18 })] }),
              ...(row.titel ? [new Paragraph({ children: [new TextRun({ text: row.titel, size: 18, italics: true })] })] : []),
            ],
            shading: { fill: bgColor },
          }),
          new TableCell({
            children: detailParagraphs,
            shading: { fill: bgColor },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: refText, size: 18 })] })],
            shading: { fill: bgColor },
          }),
        ],
      });
    });

    const table = new Table({
      rows: [headerRow, ...dataRows],
      width: { size: 100, type: WidthType.PERCENTAGE },
    });

    scheduleParagraphs.push(new Paragraph({ children: [] })); // spacer
    scheduleParagraphs.push(table as unknown as Paragraph); // docx types workaround
  }

  // --- URL ---
  const urlParagraphs: Paragraph[] = [];
  if (trackingUrl) {
    urlParagraphs.push(
      new Paragraph({ spacing: { before: 400 } }),
      new Paragraph({
        children: [
          new TextRun({ text: "Zur Anmeldung: ", size: 22 }),
          new ExternalHyperlink({
            children: [new TextRun({ text: trackingUrl, style: "Hyperlink", size: 22 })],
            link: trackingUrl,
          }),
        ],
      })
    );
  }

  // --- DOCUMENT ---
  const doc = new Document({
    sections: [
      {
        children: [...headerParagraphs, ...contentParagraphs, ...scheduleParagraphs, ...urlParagraphs] as Paragraph[],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const vaCode = (data.va_code || "000").replace(/\//g, "_");
  saveAs(blob, `Agenda_${vaCode}.docx`);
}
