import { NextResponse } from "next/server";
import type { Fortbildung } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const { existingData } = (await request.json()) as { existingData: Fortbildung[] };

    const WC_URL = process.env.WC_URL;
    const WC_KEY = process.env.WC_KEY;
    const WC_SECRET = process.env.WC_SECRET;

    if (!WC_URL || !WC_KEY || !WC_SECRET) {
      return NextResponse.json({ error: "WooCommerce credentials not configured" }, { status: 500 });
    }

    const baseUrl = `${WC_URL}/wp-json/wc/v3`;
    const authParams = `consumer_key=${WC_KEY}&consumer_secret=${WC_SECRET}`;

    // Fetch published products
    const res = await fetch(`${baseUrl}/products?status=publish&per_page=100&${authParams}`, {
      headers: { "User-Agent": "AgendaCloud/1.0" },
    });
    if (!res.ok) {
      return NextResponse.json({ error: `WooCommerce API error: ${res.status}` }, { status: 502 });
    }

    const products = await res.json();
    const fortbildungen: Fortbildung[] = [...existingData];

    for (const p of products) {
      const prodId = p.id;
      const url = p.permalink || "";
      let vaCode = p.sku || "";
      let preisVal = String(p.regular_price || "");

      // Handle variable products
      if (p.type === "variable") {
        try {
          const vRes = await fetch(`${baseUrl}/products/${prodId}/variations?${authParams}`);
          if (vRes.ok) {
            const variations = await vRes.json();
            if (variations.length > 0) {
              const firstVar = variations[0];
              const fallbackPrice = String(firstVar.regular_price || firstVar.price || "");
              if (fallbackPrice) {
                preisVal = fallbackPrice;
                vaCode = firstVar.sku || vaCode;
              }

              const defaults = p.default_attributes || [];
              if (defaults.length > 0) {
                for (const v of variations) {
                  let match = true;
                  for (const d of defaults) {
                    const vAttr = v.attributes?.find((a: { name: string }) => a.name === d.name);
                    if (!vAttr || vAttr.option !== d.option) {
                      match = false;
                      break;
                    }
                  }
                  if (match) {
                    vaCode = v.sku || vaCode;
                    const specPrice = String(v.regular_price || v.price || "");
                    if (specPrice) preisVal = specPrice;
                    break;
                  }
                }
              }
            }
          }
        } catch {
          // ignore variation fetch errors
        }
      }

      // Format price
      if (preisVal.includes(".") && !preisVal.includes(",")) {
        preisVal = preisVal.replace(".", ",");
      }

      // Extract attributes
      let datumVal = "", zeitVal = "", modalVal = "", formatVal = "";
      for (const attr of p.attributes || []) {
        const name = (attr.name || "").toLowerCase();
        const val = (attr.options || []).join(", ");
        if (name === "termin") datumVal = val;
        else if (name === "zeit") zeitVal = val;
        else if (name === "modal") modalVal = val;
        else if (name === "format") formatVal = val;
      }

      // Strip HTML from short description
      const rawShort = p.short_description || "";
      const kurzDesc = rawShort.replace(/<[^>]*>/g, "").trim();

      // Fetch page content for themen, takeaways, zielgruppe
      let valThemen = "", valTakeaways = "", valZielgruppe = "";
      try {
        const webRes = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(10000),
        });
        if (webRes.ok) {
          const html = await webRes.text();
          const extractById = (id: string) => {
            const regex = new RegExp(`id=["']${id}["'][^>]*>([\\s\\S]*?)</`, "i");
            const match = html.match(regex);
            return match ? match[1].replace(/<[^>]*>/g, "").trim() : "";
          };
          valThemen = extractById("import_themen");
          valTakeaways = extractById("import_takeaways");
          valZielgruppe = extractById("import_zielgruppe");
        }
      } catch {
        // ignore fetch errors
      }

      // Update or add
      const existingIdx = fortbildungen.findIndex((item) => item.url === url);
      if (existingIdx >= 0) {
        const existing = fortbildungen[existingIdx];
        existing.va_code = vaCode;
        if (preisVal) existing.preis = preisVal;
        if (modalVal) existing.modal_attr = modalVal;
        if (formatVal) existing.modalitaet = formatVal;
        if (datumVal) existing.datum = datumVal;
        if (zeitVal) existing.uhrzeit = zeitVal;
        if (kurzDesc) existing.kurzbeschreibung = kurzDesc;
        if (valThemen) existing.themen_fokus = valThemen;
        if (valTakeaways) existing.takeaways = valTakeaways;
        if (valZielgruppe) existing.zielgruppe = valZielgruppe;
      } else {
        fortbildungen.push({
          titel: p.name || "",
          va_code: vaCode,
          url,
          preis: preisVal,
          modal_attr: modalVal,
          datum: datumVal,
          uhrzeit: zeitVal,
          modalitaet: formatVal,
          kurzbeschreibung: kurzDesc,
          themen_fokus: valThemen,
          takeaways: valTakeaways,
          zielgruppe: valZielgruppe,
          referent_1: "",
          referent_2: "",
          zeitplan_alle_tage: { "Tag 1": [] },
        });
      }
    }

    // Sort alphabetically
    fortbildungen.sort((a, b) => a.titel.toLowerCase().localeCompare(b.titel.toLowerCase()));

    return NextResponse.json({ data: fortbildungen });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
