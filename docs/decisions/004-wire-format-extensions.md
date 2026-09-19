# ADR-004: Wire format details not fixed by SPEC § 4.2

## Context

SPEC § 4.2 fixes a 28-byte record and 7-byte header but leaves the reserved
bytes, null encodings, removal and cluster layouts open. Real data also has
`~`-prefixed non-ICAO addresses that collide with the 24-bit ICAO space.

## Decision

- Nulls use sentinels: `int16 −32768`, `uint16 0xFFFF`, `uint8 0xFF`.
  Values out of range saturate instead of wrapping.
- Flag bit 6 = non-ICAO address. Bit 5 `special` = LADD or PIA.
- Byte 24 carries the emergency kind (0–7); bytes 25–27 stay reserved.
  The flag alone cannot distinguish 7500 from 7700, and the UI must.
- Category: `(letter − 'A') << 4 | digit`.
- Removals frame `0x03`: 4 bytes per entry (`uint24` icao + flags byte).
- Clusters frame `0x04`: `int32 lat · int32 lon · uint16 count` per cluster.
- The server encodes each aircraft once per tick and shares the bytes
  between clients; only the `age` byte is patched per frame.

## Consequences

The frame decoder validates exact length per type and rejects anything else.
Adding fields means using the reserved bytes or bumping `hello.version`.
