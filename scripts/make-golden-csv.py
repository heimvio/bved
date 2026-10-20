#!/usr/bin/env python3
"""Erzeugt die CSV-Golden-Dateien unter test/golden/csv/.

GERATEN: So könnten Exporte aus immoware24 (benutzerdefinierte Auswertungen
„Verwaltungseinheiten“, „Mieter“, „Eigentümer“, Adressbuch „Kontakte“) laut
Handbuch aussehen. Es lagen keine echten Exporte vor; Spaltenköpfe,
Trennzeichen und Zeichensätze sind absichtlich verschieden, damit die
Erkennung geprüft wird. Alle Daten sind erfunden. Passen die echten Dateien
nicht, werden die Presets (src/csv/presets.ts) korrigiert, nicht diese Dateien
schöngeschrieben — neue echte Muster kommen als weitere Dateien dazu.

Aufruf: python3 scripts/make-golden-csv.py
"""
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'test', 'golden', 'csv')


def write(name, rows, sep, encoding, bom=False, eol='\r\n'):
    text = eol.join(sep.join(r) for r in rows) + eol
    data = text.encode(encoding)
    if bom:
        data = b'\xef\xbb\xbf' + data
    with open(os.path.join(OUT, name), 'wb') as fh:
        fh.write(data)
    print(name, encoding, repr(sep), len(rows) - 1, 'Zeilen')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    # UTF-8 mit BOM, Semikolon (Handbuch: „Bitte achten Sie beim Export auf das UTF8 Format“)
    write('immoware24_Verwaltungseinheiten.csv', [
        ['Objekt', 'Objektbezeichnung', 'VE-Nr.', 'VE-Bezeichnung', 'Art der VE', 'Straße', 'Hausnummer', 'PLZ', 'Ort', 'Wohnfläche (m²)', 'Zimmer', 'Etage'],
        ['OBJ-0815', 'WEG Musterstraße 12', '0815.0001', 'Whg. 1 EG links', 'Wohnung', 'Musterstraße', '12', '12345', 'Musterstadt', '65,50', '3', 'EG'],
        ['OBJ-0815', 'WEG Musterstraße 12', '0815.0002', 'Whg. 2 EG rechts', 'Wohnung', 'Musterstraße', '12', '12345', 'Musterstadt', '80,25', '4', 'EG'],
        ['OBJ-0815', 'WEG Musterstraße 12', '0815.0003', 'Whg. 3 1. OG links', 'Wohnung', 'Musterstraße', '12', '12345', 'Musterstadt', '45,00', '2', '1. OG'],
        ['OBJ-0815', 'WEG Musterstraße 12', '0815.0004', 'Whg. 4 1. OG rechts', 'Wohnung', 'Musterstraße', '12', '12345', 'Musterstadt', '1.000,00', '5', '1. OG'],
    ], ';', 'utf-8', bom=True)
    # Windows-1252, Semikolon, Anführungszeichen
    write('immoware24_Mieter.csv', [
        ['"Objekt"', '"VE-Nr."', '"Mieter-Nr."', '"Kontakt-Nr."', '"Name"', '"Vorname"', '"Mietbeginn"', '"Mietende"', '"Personen"', '"Telefon"'],
        ['"OBJ-0815"', '"0815.0001"', '"M-1001"', '"K-501"', '"Beispiel"', '"Erika"', '"01.03.2019"', '""', '"2"', '"0123 456"'],
        ['"OBJ-0815"', '"0815.0002"', '"M-1002"', '"K-502"', '"Müller"', '"Hans"', '"01.01.2015"', '"30.06.2025"', '"1"', '""'],
        ['"OBJ-0815"', '"0815.0002"', '"M-1003"', '"K-503"', '"Šimek"', '"Jörg"', '"01.07.2025"', '""', '"3"', '""'],
        ['"OBJ-0815"', '"0815.0003"', '""', '""', '"Leerstand"', '""', '"01.01.2025"', '""', '"0"', '""'],
    ], ';', 'cp1252')
    # ISO 8859-15, Komma
    write('immoware24_Eigentuemer.csv', [
        ['Objekt', 'VE-Nr.', 'Eigentümer-Nr.', 'Kontakt-Nr.', 'Eigentümer', 'Eigentum seit', 'Eigentum bis', 'MEA'],
        ['OBJ-0815', '0815.0001', 'E-01', 'K-601', 'Max Mustermann', '15.05.2010', '', ''],
        ['OBJ-0815', '0815.0002', 'E-02', 'K-602', 'Anna Groß', '01.01.2000', '', ''],
        ['OBJ-0815', '0815.0003', 'E-02', 'K-602', 'Anna Groß', '01.01.2000', '', ''],
        ['OBJ-0815', '0815.0004', 'E-03', 'K-603', 'Peter Eigen', '1.7.2018', '', ''],
    ], ',', 'iso8859_15')
    # UTF-8 ohne BOM, Tabulator, nur LF
    write('immoware24_Kontakte.csv', [
        ['Kontakt-Nr.', 'Anrede', 'Vorname', 'Name', 'Straße', 'Hausnummer', 'PLZ', 'Ort', 'E-Mail', 'Telefon'],
        ['K-501', 'Frau', 'Erika', 'Beispiel', 'Musterstraße', '12', '12345', 'Musterstadt', 'erika@example.org', ''],
        ['K-502', 'Herr', 'Hans', 'Müller', 'Neue Straße', '1', '10115', 'Berlin', '', ''],
        ['K-503', 'Herr', 'Jörg', 'Šimek', 'Musterstraße', '12', '12345', 'Musterstadt', '', ''],
        ['K-601', 'Herr', 'Max', 'Mustermann', 'Am Eigentum', '3', '54321', 'Eigenheim', '', ''],
        ['K-602', 'Frau', 'Anna', 'Groß', 'Am Eigentum', '5', '54321', 'Eigenheim', '', ''],
        ['K-603', 'Herr', 'Peter', 'Eigen', 'Musterstraße', '12', '12345', 'Musterstadt', '', ''],
    ], '\t', 'utf-8', eol='\n')
