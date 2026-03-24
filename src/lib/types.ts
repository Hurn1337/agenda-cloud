export interface ZeitplanRow {
  uhrzeit: string;
  art: string;
  titel: string;
  bullets: string;
  referent: string;
}

export interface ZeitplanAlleTage {
  [tag: string]: ZeitplanRow[];
}

export interface Fortbildung {
  titel: string;
  va_code: string;
  datum: string;
  uhrzeit: string;
  preis: string;
  modal_attr: string;
  url: string;
  modalitaet: string;
  kurzbeschreibung: string;
  themen_fokus: string;
  zielgruppe: string;
  takeaways: string;
  zeitplan_alle_tage: ZeitplanAlleTage;
  [key: string]: unknown; // for dynamic referent_1, referent_2, etc.
}

export const ART_OPTIONS = [
  "Vorstellungsrunde",
  "Akkreditierung und Anmeldung",
  "Ankommen und Netzwerken",
  "Eröffnung der Veranstaltung durch Publivio",
  "Kleine Pause und Gedankenaustausch",
  "Präsentation",
  "Mittagspause",
  "Workshop",
  "Abschlussdisskussion und offene Fragen",
  "Ende der Veranstaltung",
  "Sonstiges",
  "Ende des Tages",
];

export const TAG_OPTIONS = ["Tag 1", "Tag 2", "Tag 3", "Tag 4", "Tag 5"];

export function getEmptyRow(): ZeitplanRow {
  return { uhrzeit: "", art: "Vorstellungsrunde", titel: "", bullets: "", referent: "-" };
}

export function getEmptyFortbildung(): Fortbildung {
  return {
    titel: "",
    va_code: "",
    datum: "",
    uhrzeit: "",
    preis: "",
    modal_attr: "",
    url: "",
    modalitaet: "",
    kurzbeschreibung: "",
    themen_fokus: "",
    zielgruppe: "",
    takeaways: "",
    referent_1: "",
    referent_2: "",
    zeitplan_alle_tage: { "Tag 1": [getEmptyRow(), getEmptyRow(), getEmptyRow()] },
  };
}
