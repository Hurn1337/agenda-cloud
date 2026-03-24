"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import type { Fortbildung } from "@/lib/types";
import { getEmptyFortbildung } from "@/lib/types";
import ZeitplanEditor, { zeitplanToDayBlocks, dayBlocksToZeitplan } from "@/components/ZeitplanEditor";
import type { ZeitplanRow } from "@/lib/types";

const STORAGE_KEY = "agenda_fortbildungen";

function loadFromStorage(): Fortbildung[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage(data: Fortbildung[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export default function Home() {
  const [fortbildungen, setFortbildungen] = useState<Fortbildung[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [current, setCurrent] = useState<Fortbildung>(getEmptyFortbildung());
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const data = loadFromStorage();
    if (data.length > 0) {
      setFortbildungen(data);
    } else {
      // First visit: load bundled daten.json
      fetch("/daten.json")
        .then((res) => res.json())
        .then((json: Fortbildung[]) => {
          json.sort((a, b) => a.titel.toLowerCase().localeCompare(b.titel.toLowerCase()));
          setFortbildungen(json);
          saveToStorage(json);
        })
        .catch(() => {});
    }
  }, []);

  const referentenList = useMemo(() => {
    const names: string[] = ["-"];
    const keys = Object.keys(current)
      .filter((k) => k.startsWith("referent_"))
      .sort((a, b) => parseInt(a.split("_")[1]) - parseInt(b.split("_")[1]));
    for (const k of keys) {
      const val = String(current[k] || "").trim();
      if (val) names.push(val);
    }
    names.push("Publivio Team");
    return names;
  }, [current]);

  const dayBlocks = useMemo(() => zeitplanToDayBlocks(current.zeitplan_alle_tage || {}), [current.zeitplan_alle_tage]);

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 3000);
  };

  const syncWithWooCommerce = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ existingData: fortbildungen }),
      });
      const json = await res.json();
      if (json.error) {
        showMessage(`Sync Fehler: ${json.error}`);
      } else {
        setFortbildungen(json.data);
        saveToStorage(json.data);
        showMessage(`Sync erfolgreich! ${json.data.length} Veranstaltungen geladen.`);
      }
    } catch (err) {
      showMessage(`Sync Fehler: ${err}`);
    } finally {
      setSyncing(false);
    }
  };

  const selectItem = (index: number) => {
    setSelectedIndex(index);
    const item = fortbildungen[index];
    setCurrent({ ...item });
  };

  const updateField = useCallback((key: string, value: string) => {
    setCurrent((prev) => ({ ...prev, [key]: value }));
  }, []);

  const save = () => {
    setSaving(true);
    const updated = [...fortbildungen];
    if (selectedIndex !== null) {
      updated[selectedIndex] = current;
    } else {
      updated.push(current);
    }
    updated.sort((a, b) => a.titel.toLowerCase().localeCompare(b.titel.toLowerCase()));
    setFortbildungen(updated);
    saveToStorage(updated);
    const newIdx = updated.findIndex((f) => f.va_code === current.va_code && f.titel === current.titel);
    setSelectedIndex(newIdx >= 0 ? newIdx : null);
    setSaving(false);
    showMessage("Gespeichert!");
  };

  const deleteItem = (index: number) => {
    if (!confirm("Sicher löschen?")) return;
    const updated = fortbildungen.filter((_, i) => i !== index);
    setFortbildungen(updated);
    saveToStorage(updated);
    if (selectedIndex === index) {
      setSelectedIndex(null);
      setCurrent(getEmptyFortbildung());
    }
    showMessage("Gelöscht.");
  };

  const newEntry = () => {
    setSelectedIndex(null);
    setCurrent(getEmptyFortbildung());
  };

  const addReferent = () => {
    const existingKeys = Object.keys(current).filter((k) => k.startsWith("referent_"));
    const maxNum = existingKeys.reduce((max, k) => Math.max(max, parseInt(k.split("_")[1]) || 0), 0);
    setCurrent((prev) => ({ ...prev, [`referent_${maxNum + 1}`]: "" }));
  };

  const removeReferent = (key: string) => {
    setCurrent((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const exportWord = async () => {
    try {
      const res = await fetch("/api/export-word", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(current),
      });
      if (!res.ok) {
        const err = await res.json();
        showMessage(`Fehler: ${err.error}`);
        return;
      }
      const blob = await res.blob();
      const vaCode = (current.va_code || "000").replace(/\//g, "_");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Agenda_${vaCode}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      showMessage("Word-Datei erstellt!");
    } catch (err) {
      showMessage(`Fehler beim Export: ${err}`);
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(fortbildungen, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "daten.json";
    a.click();
    URL.revokeObjectURL(url);
    showMessage("JSON exportiert!");
  };

  const importJson = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const data = JSON.parse(text) as Fortbildung[];
        data.sort((a, b) => a.titel.toLowerCase().localeCompare(b.titel.toLowerCase()));
        setFortbildungen(data);
        saveToStorage(data);
        showMessage(`${data.length} Veranstaltungen importiert!`);
      } catch {
        showMessage("Fehler beim Import: Ungültige JSON-Datei");
      }
    };
    input.click();
  };

  const referentKeys = Object.keys(current)
    .filter((k) => k.startsWith("referent_"))
    .sort((a, b) => parseInt(a.split("_")[1]) - parseInt(b.split("_")[1]));

  const filteredList = fortbildungen
    .map((f, i) => ({ f, i }))
    .filter(
      ({ f }) =>
        !searchTerm ||
        f.titel.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.va_code.toLowerCase().includes(searchTerm.toLowerCase())
    );

  return (
    <div className="flex h-screen bg-white">
      {/* LEFT SIDEBAR */}
      <div className="w-[360px] min-w-[360px] border-r border-gray-200 flex flex-col bg-gray-50">
        <div className="p-6 text-center border-b border-gray-200 bg-white">
          <Image src="/logo.png" alt="Publivio" width={80} height={80} className="mx-auto mb-3" />
          <h1 className="text-lg font-bold text-gray-800">Publivio Agenda Manager</h1>
          <p className="text-xs text-gray-400 mt-1">Cloud Edition v2.0</p>
        </div>

        <div className="p-3 space-y-2 border-b border-gray-200">
          <button
            onClick={syncWithWooCommerce}
            disabled={syncing}
            className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
          >
            {syncing ? "Synchronisiere..." : "Webshop Sync"}
          </button>
          <div className="flex gap-2">
            <button onClick={newEntry} className="flex-1 bg-green-500 hover:bg-green-600 text-white py-1.5 px-3 rounded text-xs font-medium">
              + Neu
            </button>
            <button onClick={importJson} className="flex-1 bg-gray-500 hover:bg-gray-600 text-white py-1.5 px-3 rounded text-xs font-medium">
              Import
            </button>
            <button onClick={exportJson} className="flex-1 bg-gray-500 hover:bg-gray-600 text-white py-1.5 px-3 rounded text-xs font-medium">
              Export
            </button>
          </div>
        </div>

        <div className="p-3 border-b border-gray-200">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Suchen..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredList.map(({ f, i }) => (
            <div key={i} className="flex items-center gap-1">
              <button
                onClick={() => selectItem(i)}
                className={`flex-1 text-left px-3 py-2 rounded-lg text-sm transition-colors truncate ${
                  selectedIndex === i ? "bg-blue-100 text-blue-800 font-medium border border-blue-300" : "hover:bg-gray-100 text-gray-700"
                }`}
              >
                <span className="text-xs text-gray-400 mr-1">{f.va_code || "--"}</span>
                <span className="truncate">{f.titel.length > 35 ? f.titel.slice(0, 35) + "..." : f.titel}</span>
              </button>
              <button
                onClick={() => deleteItem(i)}
                className="text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-2 rounded text-sm font-bold"
                title="Löschen"
              >
                x
              </button>
            </div>
          ))}
          {filteredList.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-8">
              {fortbildungen.length === 0 ? "Keine Veranstaltungen. Starte einen Webshop Sync!" : "Keine Ergebnisse."}
            </p>
          )}
        </div>

        <div className="p-3 text-center text-xs text-gray-400 border-t border-gray-200">
          {fortbildungen.length} Veranstaltung{fortbildungen.length !== 1 ? "en" : ""}
        </div>
      </div>

      {/* RIGHT MAIN AREA */}
      <div className="flex-1 overflow-y-auto">
        {message && (
          <div className="sticky top-0 z-10 bg-green-50 border-b border-green-200 px-4 py-2 text-green-800 text-sm font-medium">
            {message}
          </div>
        )}

        <div className="max-w-5xl mx-auto p-8 space-y-8">
          {/* Section 1: Grunddaten */}
          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200">1. Grunddaten</h2>
            <div className="grid grid-cols-2 gap-4">
              {[
                { key: "titel", label: "Titel", full: true },
                { key: "va_code", label: "VA Code" },
                { key: "datum", label: "Datum" },
                { key: "uhrzeit", label: "Uhrzeit" },
                { key: "preis", label: "Preis (EUR)" },
                { key: "modal_attr", label: "Modal" },
                { key: "modalitaet", label: "Modalität" },
                { key: "url", label: "URL", full: true },
              ].map(({ key, label, full }) => (
                <div key={key} className={full ? "col-span-2" : ""}>
                  <label className="block text-sm font-medium text-gray-600 mb-1">{label}</label>
                  <input
                    type="text"
                    value={String(current[key] || "")}
                    onChange={(e) => updateField(key, e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Section 2: Texte */}
          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200">2. Texte</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Kurzbeschreibung</label>
                <input
                  type="text"
                  value={current.kurzbeschreibung}
                  onChange={(e) => updateField("kurzbeschreibung", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
                />
              </div>
              {[
                { key: "themen_fokus", label: "Themen im Fokus", rows: 4 },
                { key: "zielgruppe", label: "Zielgruppe", rows: 3 },
                { key: "takeaways", label: "Das nehmen Sie mit", rows: 4 },
              ].map(({ key, label, rows }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-600 mb-1">{label}</label>
                  <textarea
                    value={String(current[key] || "")}
                    onChange={(e) => updateField(key, e.target.value)}
                    rows={rows}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none resize-y"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Section 3: Referenten */}
          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200">3. Referenten</h2>
            <div className="space-y-2">
              {referentKeys.map((key) => {
                const num = key.split("_")[1];
                return (
                  <div key={key} className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-600 w-24">Referent {num}:</label>
                    <input
                      type="text"
                      value={String(current[key] || "")}
                      onChange={(e) => updateField(key, e.target.value)}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
                    />
                    {parseInt(num) > 2 && (
                      <button
                        onClick={() => removeReferent(key)}
                        className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded text-sm font-bold"
                      >
                        x
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              onClick={addReferent}
              className="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              + Weiteren Referenten hinzufügen
            </button>
          </section>

          {/* Section 4: Zeitplan */}
          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200">4. Zeitplan</h2>
            <ZeitplanEditor
              days={dayBlocks}
              referentenList={referentenList}
              onChange={(newDays) => {
                setCurrent((prev) => ({
                  ...prev,
                  zeitplan_alle_tage: dayBlocksToZeitplan(newDays as { tag: string; rows: ZeitplanRow[] }[]),
                }));
              }}
            />
          </section>

          {/* Action Buttons */}
          <section className="flex gap-4 pb-12 pt-4 border-t border-gray-200">
            <button
              onClick={save}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-8 py-3 rounded-lg font-medium text-sm transition-colors"
            >
              {saving ? "Speichert..." : "Speichern"}
            </button>
            <button
              onClick={exportWord}
              className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 rounded-lg font-medium text-sm transition-colors"
            >
              Word Datei erstellen
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
