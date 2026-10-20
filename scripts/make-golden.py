#!/usr/bin/env python3
"""Erzeugt die synthetischen Golden-Dateien unter test/golden/.

Bewusst unabhängig von der TypeScript-Bibliothek: jede Stelle wird hier mit
den Positionen (von–bis) aus der Spezifikation „Standard-Datenaustausch 3.10,
dritte Erweiterung“ gesetzt, nicht aus src/fields.ts. Die Tests prüfen, dass
die Bibliothek diese Dateien liest und byte-gleich wieder schreibt — damit
sind zwei unabhängige Abschriften der Spezifikation gegeneinander geprüft.

Alle Daten sind erfunden. Aufruf: python3 scripts/make-golden.py
"""
from decimal import Decimal
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'test', 'golden')
TS = '20260115103000000'
V = '03.10'


def rec(length, parts):
    buf = [' '] * length
    for frm, to, text in parts:
        assert len(text) == to - frm + 1, (frm, to, text, len(text))
        buf[frm - 1:to] = list(text)
    s = ''.join(buf)
    assert len(s) == length
    return s


def an(s, n):
    assert len(s) <= n, s
    return s.ljust(n)


def num(v, n, dec=0):
    if v is None:
        return ' ' * n
    q = int((Decimal(str(v)) * (10 ** dec)).to_integral_value())
    if q < 0:
        return '-' + str(-q).rjust(n - 1, '0')
    return str(q).rjust(n, '0')


def date(iso):
    y, m, d = iso.split('-')
    return d + m + y[2:]


def period(a, b):
    return date(a) + date(b)


CUST = num(4711, 10)
PROP = '123456789'
START, END = '2025-01-01', '2025-12-31'


def head(t, flat='0000'):
    return [(1, 1, t), (2, 6, V), (7, 16, CUST), (17, 18, '  '), (19, 31, PROP + flat)]


# --- Nutzer (gemeinsam für M, A, D, E835, E898) ------------------------------
USERS = [
    # flat, clientRef, von, bis, Nutzername, Eigentümer, Leerstand, Adresskz, HZ-Anteile, Einheit, Personen
    dict(flat='0001', ref='0815.0001.01', frm=START, to=END, user='Erika Beispiel', owner='Max Mustermann', vac=0, af=3,
         heat='65.50', heatKey='010', persons='2.00'),
    dict(flat='0002', ref='0815.0002.01', frm=START, to='2025-06-30', user='Hans Müller', owner='Anna Groß', vac=0, af=1,
         heat='80.25', heatKey='010', persons='1.00'),
    dict(flat='0002', ref='0815.0002.02', frm='2025-07-01', to=END, user='Jörg Šimek', owner='Anna Groß', vac=0, af=1,
         heat='80.25', heatKey='010', persons='3.00'),
    dict(flat='0003', ref='0815.0003.01', frm=START, to=END, user='', owner='Anna Groß', vac=1, af=2,
         heat='45.00', heatKey='010', persons=None),
    dict(flat='0004', ref='0815.0004.01', frm=START, to=END, user='Peter Eigen', owner='Peter Eigen', vac=0, af=3,
         heat='100.00', heatKey='011', persons='1.00'),
]


def name_block(start, name, street='', country='', plz='', city=''):
    return [
        (start, start + 34, an(name, 35)),
        (start + 35, start + 69, an('', 35)),
        (start + 70, start + 104, an('', 35)),
        (start + 105, start + 139, an('', 35)),
        (start + 140, start + 174, an(street, 35)),
        (start + 175, start + 177, an(country, 3)),
        (start + 178, start + 187, an(plz, 10)),
        (start + 188, start + 222, an(city, 35)),
    ]


def make_dtm():
    lines = []
    lines.append(rec(2048, head('L') + [
        (32, 32, '3'),
        (33, 67, an('Musterstraße 12', 35)),
        (68, 70, 'DEU'),
        (71, 80, an('12345', 10)),
        (81, 115, an('Musterstadt', 35)),
        (116, 127, period(START, END)),
        (128, 142, an('OBJ-0815', 15)),
        (143, 143, '0'),
        (147, 147, '1'),
        (148, 150, 'EUR'),
        (151, 151, '1'),
        (159, 159, '0'),
        (160, 160, '0'),
        (161, 161, '0'),
        (165, 165, '0'),
        (2048, 2048, 'L'),
    ]))
    for u in USERS:
        parts = head('M', u['flat']) + [
            (32, 51, an(u['ref'], 20)),
            (52, 52, str(u['af'])),
        ]
        if u['user']:
            parts += name_block(53, u['user'], 'Musterstraße 12', 'DEU', '12345', 'Musterstadt')
        parts += name_block(276, u['owner'], 'Am Eigentum 3', 'DEU', '54321', 'Eigenheim')
        parts += [
            (499, 510, period(u['frm'], u['to'])),
            (511, 511, '0'),
            (512, 512, '0'),
            (513, 522, num(u['heat'], 10, 2)),
            (543, 552, num(u['heat'], 10, 2)),
        ]
        if u['persons'] is not None:
            parts += [(603, 605, '035'), (606, 615, num(u['persons'], 10, 2))]
        parts += [
            (1167, 1167, str(u['vac'])),
            (1168, 1168, '0'),
            (1169, 1171, u['heatKey']),
            (1172, 1174, u['heatKey']),
            (2048, 2048, 'M'),
        ]
        lines.append(rec(2048, parts))
    return lines


def make_dtk():
    lines = [rec(1024, head('B') + [
        (32, 34, 'EUR'),
        (35, 46, period(START, END)),
        (47, 49, '194'),
        (135, 138, num('55.00', 4, 2)),
        (170, 170, '1'),
        (171, 182, period(START, END)),
        (195, 206, period(START, END)),
        (1024, 1024, 'B'),
    ])]

    def k(key, label, scope, inv, qty, gross, net, lkey, labor, fuel, co2=None):
        parts = head('K') + [
            (32, 34, key),
            (35, 59, an(label, 25)),
            (60, 60, scope),
            (61, 66, date(inv)),
            (67, 77, num(qty, 11, 3)),
            (78, 87, num(gross, 10, 2)),
            (88, 97, num(net, 10, 2)),
            (98, 99, lkey),
            (100, 109, num(labor, 10, 2)),
            (110, 110, fuel),
        ]
        if co2:
            parts += [
                (115, 116, '01'),
                (117, 125, num(co2['factor'], 9, 3)),
                (126, 134, num(co2['kg'], 9, 3)),
                (135, 144, num(co2['gross'], 10, 2)),
                (145, 154, num(co2['net'], 10, 2)),
                (155, 156, '04'),
            ]
        parts.append((1024, 1024, 'K'))
        return rec(1024, parts)

    lines += [
        k('201', '', 'E', '2025-12-31', '150000.000', '18450.00', '15504.20', '00', None, '1',
          dict(factor='0.201', kg='30150.000', gross='1640.16', net='1378.29')),
        k('201', '', 'E', '2025-03-15', None, '-119.00', '-100.00', '00', None, '1'),
        k('221', '', 'E', '2025-06-15', None, '476.00', '400.00', '13', '238.00', '1'),
        k('225', '', 'E', '2025-10-10', None, '95.20', '80.00', '13', '60.00', '1'),
        k('228', 'Legionellenprüfung', 'W', '2025-09-01', None, '238.00', '200.00', '00', None, '1'),
        k('237', '', 'K', '2025-12-31', '420.000', '1260.00', '1177.57', '00', None, '0'),
    ]
    return lines


# Ergebnis je Nutzer: (Kostenart, brutto, netto, Verbrauch, Einheit, Schätzkz, CO2 umgelegt brutto/netto, nicht umgelegt brutto/netto)
RESULTS = {
    '0815.0001.01': [('231', '4210.37', '3538.13', '1234.000', '030', '11', '210.12', '176.57', '90.05', '75.67')],
    '0815.0002.01': [('231', '1890.11', '1588.33', '640.500', '030', '11', '94.31', '79.25', '40.42', '33.97')],
    '0815.0002.02': [('231', '2390.85', '2009.12', '812.250', '030', '6', '119.30', '100.25', '51.13', '42.97')],
    '0815.0003.01': [('231', '1210.00', '1016.81', None, None, '11', '60.37', '50.73', '25.87', '21.74')],
    '0815.0004.01': [('231', '5001.47', '4202.92', '1702.000', '030', '11', '249.55', '209.71', '106.95', '89.87'),
                     ('237', '315.00', '294.39', '105.000', '003', '11', None, None, None, None)],
}
NAMES = {
    '0815.0001.01': 'Erika Beispiel', '0815.0002.01': 'Hans Müller', '0815.0002.02': 'Jörg Šimek',
    '0815.0003.01': 'Leerstand', '0815.0004.01': 'Peter Eigen',
}


def make_dtd():
    lines = []
    for u in USERS:
        for (key, g, n, cons, ukey, est, cg, cn, ng, nn) in RESULTS[u['ref']]:
            lines.append(rec(1024, head('D', u['flat']) + [
                (32, 51, an(u['ref'], 20)),
                (52, 57, date(u['to'])),
                (58, 67, num(g, 10, 2)),
                (68, 77, num(n, 10, 2)),
                (148, 150, key),
                (151, 159, num(cons, 9, 3)),
                (160, 162, ukey or '   '),
                (163, 165, est.rjust(3, '0')),
                (166, 200, an(NAMES[u['ref']], 35)),
                (201, 203, 'EUR'),
                (204, 213, num(cg, 10, 2)),
                (214, 223, num(cn, 10, 2)),
                (224, 233, num(ng, 10, 2)),
                (234, 243, num(nn, 10, 2)),
                (1024, 1024, 'D'),
            ]))
    return lines


def make_dta():
    return [rec(128, head('A', u['flat']) + [(32, 51, an(u['ref'], 20)), (128, 128, 'A')]) for u in USERS]


def ext_ref(u, seq):
    return PROP + '0000' + u['flat'] + str(seq)


def user_seq():
    seen = {}
    out = {}
    for u in USERS:
        seen[u['flat']] = seen.get(u['flat'], 0) + 1
        out[u['ref']] = seen[u['flat']]
    return out


def make_e835():
    seq = user_seq()
    rows = [
        (USERS[0], '221', '', '13', '476.00', '91.44', '19.21', '238.00', '45.72'),
        (USERS[0], '225', '', '13', '95.20', '18.29', '19.21', '60.00', '11.53'),
        (USERS[4], '221', '', '13', '476.00', '139.61', '29.33', '238.00', '69.81'),
    ]
    lines = []
    for i, (u, key, label, lkey, gross, share, pct, labor, lshare) in enumerate(rows, start=1):
        lines.append(rec(133, [
            (1, 4, 'E835'),
            (5, 11, num(i, 7)),
            (12, 13, '  '),
            (14, 31, ext_ref(u, seq[u['ref']])),
            (32, 51, an(u['ref'], 20)),
            (52, 52, ' '),
            (53, 55, key),
            (56, 80, an(label, 25)),
            (81, 82, lkey),
            (83, 92, num(gross, 10, 2)),
            (93, 102, num(share, 10, 2)),
            (103, 107, num(pct, 5, 2)),
            (108, 117, num(labor, 10, 2)),
            (118, 127, num(lshare, 10, 2)),
            (128, 133, date(u['to'])),
        ]))
    return lines


def make_e898():
    seq = user_seq()
    lines = []
    for i, u in enumerate([x for x in USERS if x['vac'] == 0], start=1):
        lines.append(rec(120, [
            (1, 4, 'E898'),
            (5, 11, num(i, 7)),
            (12, 13, '  '),
            (14, 31, ext_ref(u, seq[u['ref']])),
            (32, 51, an(u['ref'], 20)),
            (52, 52, ' '),
            (53, 108, an(f"HKA_{u['ref']}.pdf", 56)),
            (109, 111, '000'),
            (112, 117, date(u['to'])),
            (118, 120, 'HKA'),
        ]))
    return lines


def write(prefix, lines):
    data = ''.join(l + '\r\n' for l in lines).encode('iso8859_15')
    path = os.path.join(OUT, f'{prefix}_{TS}.DAT')
    with open(path, 'wb') as fh:
        fh.write(data)
    print(path, len(lines), 'Sätze')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    write('DTA310', make_dta())
    write('DTM310', make_dtm())
    write('DTK310', make_dtk())
    write('DTD310', make_dtd())
    write('DTE835', make_e835())
    write('DTE898', make_e898())
