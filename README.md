# THIEPN Office — O2
A standalone, device-local document library at the intended future domain office.thiepn.dev. This branch is source-only. No domain, authentication, cloud sync, or production deployment is configured.
 
Run `npm test` for dependency-free model tests. Run `npm run dev` and open http://127.0.0.1:8000 for the local app. Install dev dependencies and browser binaries for `npm run test:browser`.
 
Implemented: create/open, search titles and contents, sort, duplicate, reversible trash, Markdown export, editing, debounced autosave, bounded revision snapshots and atomic IndexedDB compare-and-swap. Conflicts retain the unsaved draft in memory, with explicit Markdown export and reload. Unsaved edits are not durable if the browser is closed forcibly. No history restore UI yet.
 
## Boundaries
O2 uses a new origin-local database, not the Hub Office database. Anyone with access to the same browser profile can access local documents; this is not authenticated storage. Do not use for sensitive documents on shared devices. No migration/import is performed. O3 will address visual authoring; O4 must establish identity-scoped synchronization and a separately tested, explicitly approved migration with preservation of IDs and revisions. Sheets and Slides are not presented as available features.
 
Release requires completed tests on Chromium, Firefox and WebKit and a reviewed dependency lockfile before deployment. No deployment workflow is included.
