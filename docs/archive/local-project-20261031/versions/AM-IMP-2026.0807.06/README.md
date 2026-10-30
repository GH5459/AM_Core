# AM-IMP-2026.0807.06 Google Calendar Projection Provider

This package defines Google Calendar as a one-way projection provider for AM Calendar Hub.

It does not make Google Calendar a source of truth. AM/Rental Calendar records remain canonical, and Google failures must not prevent source records from being created or updated.

## Included Files

- `config/google-calendar-projection-contract.json`
- `contracts/google-projection-provider-interface.json`
- `schemas/google-calendar-projection-postgres.sql`

## Credential Rule

AMCore stores only credential reference rules. OAuth refresh tokens, client secrets and raw callback material must live in production secret storage.

For HOZO, the recorded intended authorization subject is `hozosince2026@gmail.com`, but this package does not contain its credential.
