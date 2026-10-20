# Golden-Dateien

Alle Dateien sind **synthetisch**, alle Namen und Beträge erfunden.

- `DT*_20260115103000000.DAT` — eine bved-Lieferung (DTA, DTM, DTK, DTD, DTE835, DTE898),
  erzeugt von `scripts/make-golden.py` aus den Stellenangaben der Spezifikation
  „Standard-Datenaustausch 3.10, dritte Erweiterung“ (bved, September 2025),
  **unabhängig** von `src/fields.ts`. Die Tests lesen sie und schreiben sie byte-gleich zurück.
- `csv/immoware24_*.csv` — **geraten**: so könnten Exporte aus immoware24 laut Handbuch aussehen
  (`scripts/make-golden-csv.py`). Es lagen keine echten Exporte vor.

Neu erzeugen: `python3 scripts/make-golden.py && python3 scripts/make-golden-csv.py`.
