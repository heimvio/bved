// Spaltenzuordnungen je Quelle. Alle Presets sind GERATEN — aus dem
// immoware24-Handbuch (Kapitel 5 Adressbuch, 7 Liegenschaften, benutzerdefinierte
// Auswertungen) und üblichen deutschen Spaltenköpfen. Sie werden mit echten
// Exporten korrigiert; deshalb sind sie Daten, kein Code.

export type TargetField =
  | 'property.name'
  | 'property.street'
  | 'property.houseNumber'
  | 'property.postalCode'
  | 'property.city'
  | 'property.externalRef'
  | 'unit.externalRef'
  | 'unit.label'
  | 'unit.areaSqm'
  | 'occupancy.kind'
  | 'occupancy.name'
  | 'occupancy.firstName'
  | 'occupancy.name2'
  | 'occupancy.from'
  | 'occupancy.to'
  | 'occupancy.persons'
  | 'occupancy.street'
  | 'occupancy.houseNumber'
  | 'occupancy.postalCode'
  | 'occupancy.city'
  | 'occupancy.externalRef'
  | 'occupancy.email'
  | 'contact.externalRef'
  | 'ignore';

export const TARGET_FIELDS: TargetField[] = [
  'property.name',
  'property.street',
  'property.houseNumber',
  'property.postalCode',
  'property.city',
  'property.externalRef',
  'unit.externalRef',
  'unit.label',
  'unit.areaSqm',
  'occupancy.kind',
  'occupancy.name',
  'occupancy.firstName',
  'occupancy.name2',
  'occupancy.from',
  'occupancy.to',
  'occupancy.persons',
  'occupancy.street',
  'occupancy.houseNumber',
  'occupancy.postalCode',
  'occupancy.city',
  'occupancy.externalRef',
  'occupancy.email',
  'contact.externalRef',
  'ignore',
];

export interface CsvMapping {
  /** Preset-Id (CSV_PRESETS) oder Name eines gespeicherten Org-Presets. */
  preset?: string;
  /** Spaltenkopf wie in der Datei → Zielfeld; null = nicht übernehmen. */
  columns: Record<string, TargetField | null>;
  /** Werte für Zielfelder ohne Spalte bzw. mit leerer Zelle (z. B. occupancy.kind = 'owner'). */
  defaults?: Partial<Record<TargetField, string>>;
  /** Erweiterung: nur Zeilen übernehmen, deren Zielfeld diesen Wert hat (z. B. property.externalRef bei objektübergreifenden Exporten). */
  filter?: Partial<Record<TargetField, string>>;
  /** Erweiterung: Rolle der Datei, wenn das Preset unbekannt ist. */
  role?: CsvPreset['role'];
}

export interface CsvPreset {
  id: string;
  label: string;
  source: string;
  role: 'units' | 'tenants' | 'owners' | 'contacts' | 'generic';
  synonyms: Partial<Record<TargetField, string[]>>;
  guessed: boolean;
  /** Erweiterung: Spaltenköpfe, die für dieses Preset sprechen (Gewichtung bei der Erkennung). */
  distinctive?: string[];
  /** Erweiterung: Wörter im Dateinamen, die für dieses Preset sprechen. */
  fileHints?: string[];
}

const PROPERTY_REF = ['Objekt', 'Objektnummer', 'Objekt-Nr.', 'Objektnr', 'Objekt-ID', 'Objektkürzel', 'Objekt Nr', 'Liegenschaftsnummer'];
const PROPERTY_NAME = ['Objektbezeichnung', 'Objektname', 'Objekt-Bezeichnung', 'Liegenschaft', 'Bezeichnung Objekt'];
const UNIT_REF = [
  'VE',
  'VE-Nr.',
  'VE-Nummer',
  'VE Nr',
  'VE-ID',
  'Verwaltungseinheit',
  'Einheit',
  'Einheit-Nr.',
  'Einheitennummer',
  'Einheitsnummer',
  'Wohnungsnummer',
  'Whg.-Nr.',
  'Whg-Nr',
  'Wohnung',
  'Nutzeinheit',
];
const UNIT_LABEL = ['VE-Bezeichnung', 'Bezeichnung', 'Einheitbezeichnung', 'Einheitsbezeichnung', 'Lage', 'Beschreibung', 'Bezeichnung VE'];
const UNIT_AREA = ['Wohnfläche', 'Wohnfläche (m²)', 'Fläche', 'Fläche m²', 'Nutzfläche', 'qm', 'm²', 'Wfl.', 'Wohnflaeche'];
const STREET = ['Straße', 'Strasse', 'Str.', 'Anschrift'];
const HOUSE_NO = ['Hausnummer', 'Hausnr.', 'Hausnr', 'Haus-Nr.', 'Nr.'];
const POSTAL = ['PLZ', 'Postleitzahl'];
const CITY = ['Ort', 'Stadt', 'Wohnort'];
const CONTACT_REF = ['Kontakt-Nr.', 'Kontaktnummer', 'Kontakt-ID', 'Kontakt', 'Adress-Nr.', 'Adressnummer', 'Adress-ID', 'Personen-Nr.', 'Personennummer'];
const PERSONS = ['Personen', 'Personenanzahl', 'Anzahl Personen', 'Pers.', 'Personenzahl'];
const FIRST_NAME = ['Vorname', 'Vornamen'];
const EMAIL = ['E-Mail', 'Email', 'E-Mail-Adresse', 'Mail', 'Mailadresse'];

export const CSV_PRESETS: CsvPreset[] = [
  {
    id: 'immoware24-ve',
    label: 'immoware24 – Verwaltungseinheiten',
    source: 'immoware24',
    role: 'units',
    guessed: true,
    distinctive: ['Wohnfläche', 'Fläche', 'Nutzfläche', 'VE-Bezeichnung', 'Lage', 'Zimmer', 'Etage', 'Nutzungsart', 'Art der VE'],
    fileHints: ['verwaltungseinheit', 've', 'einheit', 'wohnung'],
    synonyms: {
      'property.externalRef': PROPERTY_REF,
      'property.name': PROPERTY_NAME,
      'property.street': STREET,
      'property.houseNumber': HOUSE_NO,
      'property.postalCode': POSTAL,
      'property.city': CITY,
      'unit.externalRef': UNIT_REF,
      'unit.label': UNIT_LABEL,
      'unit.areaSqm': UNIT_AREA,
    },
  },
  {
    id: 'immoware24-mieter',
    label: 'immoware24 – Mieter',
    source: 'immoware24',
    role: 'tenants',
    guessed: true,
    distinctive: ['Mieter', 'Mietbeginn', 'Mietende', 'Einzug', 'Auszug', 'Mieternummer', 'Mieter-Nr.', 'Mietvertrag'],
    fileHints: ['mieter', 'miet'],
    synonyms: {
      'property.externalRef': PROPERTY_REF,
      'property.name': PROPERTY_NAME,
      'unit.externalRef': UNIT_REF,
      'unit.label': ['VE-Bezeichnung', 'Lage', 'Einheitsbezeichnung'],
      'occupancy.name': ['Mieter', 'Name', 'Nachname', 'Mietername', 'Name Mieter', 'Vertragspartner', 'Name 1'],
      'occupancy.firstName': FIRST_NAME,
      'occupancy.name2': ['Name 2', 'Mieter 2', '2. Mieter', 'Weiterer Mieter', 'Mitmieter'],
      'occupancy.from': ['Mietbeginn', 'Einzug', 'Einzugsdatum', 'Vertragsbeginn', 'Beginn', 'Mietvertrag ab', 'von', 'Mietbeginn Datum'],
      'occupancy.to': ['Mietende', 'Auszug', 'Auszugsdatum', 'Vertragsende', 'Ende', 'bis'],
      'occupancy.persons': PERSONS,
      'occupancy.externalRef': ['Mieter-Nr.', 'Mieternummer', 'Mietvertragsnummer', 'Mietvertrags-Nr.', 'Vertragsnummer', 'Vertrags-Nr.', 'Mietvertrag'],
      'contact.externalRef': CONTACT_REF,
      'occupancy.street': STREET,
      'occupancy.houseNumber': HOUSE_NO,
      'occupancy.postalCode': POSTAL,
      'occupancy.city': CITY,
      'occupancy.email': EMAIL,
    },
  },
  {
    id: 'immoware24-eigentuemer',
    label: 'immoware24 – Eigentümer',
    source: 'immoware24',
    role: 'owners',
    guessed: true,
    distinctive: ['Eigentümer', 'Eigentümername', 'Eigentum seit', 'Eigentümer seit', 'Besitzübergang', 'Miteigentumsanteil', 'MEA', 'Eigentümer-Nr.'],
    fileHints: ['eigentuemer', 'eigentümer', 'eigentum', 'weg'],
    synonyms: {
      'property.externalRef': PROPERTY_REF,
      'property.name': PROPERTY_NAME,
      'unit.externalRef': UNIT_REF,
      'unit.label': ['VE-Bezeichnung', 'Lage', 'Einheitsbezeichnung'],
      'occupancy.name': ['Eigentümer', 'Eigentümername', 'Name', 'Nachname', 'Name Eigentümer', 'Vertragspartner', 'Name 1'],
      'occupancy.firstName': FIRST_NAME,
      'occupancy.name2': ['Name 2', 'Miteigentümer', '2. Eigentümer', 'Weiterer Eigentümer'],
      'occupancy.from': ['Eigentum seit', 'Eigentümer seit', 'Beginn', 'Übergabe', 'Besitzübergang', 'Lastenübergang', 'Vertragsbeginn', 'von'],
      'occupancy.to': ['Eigentum bis', 'Eigentümer bis', 'Ende', 'Verkauf', 'Vertragsende', 'bis'],
      'occupancy.persons': PERSONS,
      'occupancy.externalRef': ['Eigentümer-Nr.', 'Eigentümernummer', 'Eigentümervertrag', 'Vertragsnummer', 'Vertrags-Nr.'],
      'contact.externalRef': CONTACT_REF,
      'occupancy.street': STREET,
      'occupancy.houseNumber': HOUSE_NO,
      'occupancy.postalCode': POSTAL,
      'occupancy.city': CITY,
    },
  },
  {
    id: 'immoware24-kontakte',
    label: 'immoware24 – Kontakte (Adressbuch)',
    source: 'immoware24',
    role: 'contacts',
    guessed: true,
    distinctive: ['Anrede', 'Telefon', 'E-Mail', 'Email', 'Mobil', 'Gruppe', 'Kategorie', 'Firma', 'Titel', 'Kontakt-Nr.', 'Kontaktnummer'],
    fileHints: ['kontakt', 'adress', 'adressbuch'],
    synonyms: {
      'contact.externalRef': [...CONTACT_REF, 'Nr.', 'Nummer', 'ID'],
      'occupancy.name': ['Name', 'Nachname', 'Name 1', 'Firma', 'Firmenname'],
      'occupancy.firstName': FIRST_NAME,
      'occupancy.name2': ['Name 2', 'Zusatz', 'Namenszusatz', 'Name 2 / Zusatz'],
      'occupancy.street': STREET,
      'occupancy.houseNumber': ['Hausnummer', 'Hausnr.', 'Hausnr', 'Haus-Nr.'],
      'occupancy.postalCode': POSTAL,
      'occupancy.city': CITY,
      'occupancy.email': EMAIL,
    },
  },
  {
    id: 'generisch',
    label: 'Allgemeine Tabelle (Spalten selbst zuordnen)',
    source: 'generisch',
    role: 'generic',
    guessed: true,
    synonyms: {
      'property.externalRef': PROPERTY_REF,
      'property.name': PROPERTY_NAME,
      'property.street': ['Objekt Straße', 'Objektstraße', 'Straße Objekt', ...STREET],
      'property.houseNumber': HOUSE_NO,
      'property.postalCode': ['Objekt PLZ', ...POSTAL],
      'property.city': ['Objekt Ort', ...CITY],
      'unit.externalRef': UNIT_REF,
      'unit.label': UNIT_LABEL,
      'unit.areaSqm': UNIT_AREA,
      'occupancy.kind': ['Art', 'Nutzerart', 'Rolle', 'Typ', 'Nutzungsverhältnis'],
      'occupancy.name': ['Name', 'Nachname', 'Mieter', 'Nutzer', 'Eigentümer', 'Bewohner', 'Name 1'],
      'occupancy.firstName': FIRST_NAME,
      'occupancy.name2': ['Name 2', 'Weiterer Name', 'Mitmieter'],
      'occupancy.from': ['Beginn', 'von', 'ab', 'Einzug', 'Mietbeginn', 'Nutzungsbeginn', 'Vertragsbeginn'],
      'occupancy.to': ['Ende', 'bis', 'Auszug', 'Mietende', 'Nutzungsende', 'Vertragsende'],
      'occupancy.persons': PERSONS,
      'occupancy.street': ['Anschrift Nutzer', 'Straße Nutzer', 'Mieter Straße'],
      'occupancy.postalCode': ['PLZ Nutzer'],
      'occupancy.city': ['Ort Nutzer'],
      'occupancy.email': EMAIL,
      'occupancy.externalRef': ['Nutzer-Nr.', 'Nutzernummer', 'Mieter-Nr.', 'Vertragsnummer', 'Ordnungsbegriff'],
      'contact.externalRef': CONTACT_REF,
    },
  },
];
