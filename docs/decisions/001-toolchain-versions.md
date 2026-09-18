# ADR-001: Toolchain versions

## Context

SPEC § 3 fixes the stack (Angular 20, Node 22, Vitest, Zod) but not exact
versions. Latest npm releases at project start: TypeScript 7, Vitest 5, ESLint 10.
Angular 20 supports TypeScript `>=5.8 <6.0` only. The dev machine runs Node 24.

## Decision

- TypeScript **5.9** across the whole monorepo (one compiler, Angular-compatible).
- Zod **4**, Vitest **3.2**, ESLint **9** (flat config) + typescript-eslint 8
  strict-type-checked — the versions the Angular 20 tooling is tested against.
- `engines.node >= 22`, CI runs Node 22; local development on Node 24 is fine.

## Consequences

Upgrading to TS 6+/Vitest 5 is a separate task together with Angular 21.
