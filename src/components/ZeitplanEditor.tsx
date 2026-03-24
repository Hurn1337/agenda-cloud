"use client";

import { ART_OPTIONS, TAG_OPTIONS, getEmptyRow } from "@/lib/types";
import type { ZeitplanRow, ZeitplanAlleTage } from "@/lib/types";

interface DayBlock {
  tag: string;
  rows: ZeitplanRow[];
}

interface Props {
  days: DayBlock[];
  referentenList: string[];
  onChange: (days: DayBlock[]) => void;
}

export function zeitplanToDayBlocks(zat: ZeitplanAlleTage): DayBlock[] {
  return Object.entries(zat).map(([tag, rows]) => ({ tag, rows }));
}

export function dayBlocksToZeitplan(blocks: DayBlock[]): ZeitplanAlleTage {
  const result: ZeitplanAlleTage = {};
  blocks.forEach((b) => {
    result[b.tag] = b.rows;
  });
  return result;
}

export default function ZeitplanEditor({ days, referentenList, onChange }: Props) {
  const updateDay = (dayIdx: number, field: "tag", value: string) => {
    const copy = days.map((d, i) => (i === dayIdx ? { ...d, [field]: value } : d));
    onChange(copy);
  };

  const updateRow = (dayIdx: number, rowIdx: number, field: keyof ZeitplanRow, value: string) => {
    const copy = days.map((d, di) => {
      if (di !== dayIdx) return d;
      return {
        ...d,
        rows: d.rows.map((r, ri) => (ri === rowIdx ? { ...r, [field]: value } : r)),
      };
    });
    onChange(copy);
  };

  const addRow = (dayIdx: number) => {
    const copy = days.map((d, i) => (i === dayIdx ? { ...d, rows: [...d.rows, getEmptyRow()] } : d));
    onChange(copy);
  };

  const removeRow = (dayIdx: number, rowIdx: number) => {
    const copy = days.map((d, i) => {
      if (i !== dayIdx) return d;
      return { ...d, rows: d.rows.filter((_, ri) => ri !== rowIdx) };
    });
    onChange(copy);
  };

  const addDay = () => {
    onChange([...days, { tag: `Tag ${days.length + 1}`, rows: [getEmptyRow(), getEmptyRow(), getEmptyRow()] }]);
  };

  const removeDay = (dayIdx: number) => {
    onChange(days.filter((_, i) => i !== dayIdx));
  };

  return (
    <div className="space-y-6">
      {days.map((day, dayIdx) => (
        <div key={dayIdx} className="border border-gray-300 rounded-lg overflow-hidden">
          {/* Day Header */}
          <div className="bg-gray-100 px-4 py-3 flex items-center justify-between">
            <select
              value={day.tag}
              onChange={(e) => updateDay(dayIdx, "tag", e.target.value)}
              className="bg-white border border-gray-300 rounded px-3 py-1.5 text-sm font-medium"
            >
              {TAG_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <button
              onClick={() => removeDay(dayIdx)}
              className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm font-medium"
            >
              Tag entfernen
            </button>
          </div>

          {/* Column Headers */}
          <div className="grid grid-cols-[80px_180px_1fr_1fr_160px_40px] gap-1 px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-600 uppercase">
            <span>Uhrzeit</span>
            <span>Art</span>
            <span>Titel</span>
            <span>Bullets</span>
            <span>Referent</span>
            <span></span>
          </div>

          {/* Rows */}
          <div className="px-3 pb-3 space-y-1">
            {day.rows.map((row, rowIdx) => (
              <div key={rowIdx} className="grid grid-cols-[80px_180px_1fr_1fr_160px_40px] gap-1 items-start">
                <input
                  type="text"
                  value={row.uhrzeit}
                  onChange={(e) => updateRow(dayIdx, rowIdx, "uhrzeit", e.target.value)}
                  placeholder="09:00"
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full"
                />
                <select
                  value={row.art}
                  onChange={(e) => updateRow(dayIdx, rowIdx, "art", e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full"
                >
                  {ART_OPTIONS.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={row.titel}
                  onChange={(e) => updateRow(dayIdx, rowIdx, "titel", e.target.value)}
                  placeholder="Titel"
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full"
                />
                <textarea
                  value={row.bullets}
                  onChange={(e) => updateRow(dayIdx, rowIdx, "bullets", e.target.value)}
                  placeholder="Stichpunkte (je Zeile einer)"
                  rows={2}
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full resize-y"
                />
                <select
                  value={row.referent}
                  onChange={(e) => updateRow(dayIdx, rowIdx, "referent", e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full"
                >
                  {referentenList.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button
                  onClick={() => removeRow(dayIdx, rowIdx)}
                  className="bg-red-500 hover:bg-red-600 text-white rounded px-2 py-1.5 text-sm font-bold"
                  title="Zeile löschen"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="px-3 pb-3">
            <button
              onClick={() => addRow(dayIdx)}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              + Zeile hinzufügen
            </button>
          </div>
        </div>
      ))}

      <button
        onClick={addDay}
        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded font-medium"
      >
        + Weiteren Tag hinzufügen
      </button>
    </div>
  );
}
