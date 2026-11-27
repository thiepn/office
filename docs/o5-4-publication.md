# O5.4 Academic Publication Export (draft)

Read-only export of version-1 structured documents. No persisted schema changes, no database or account activation changes. Three publication templates use standard LaTeX classes, shared theorem counters, native equations, UUID-based labels/citations, first-use bibliography and escaped literal metadata. The browser's existing Print / Save PDF remains a separate browser-rendered path, not a TeX compiler.

## Compile locally, free and offline

Install a local TeX Live distribution with XeLaTeX, fontspec, Latin Modern, geometry, amsmath, amssymb, amsthm, tabularx, ulem and hyperref. Download the standalone TeX file from Academic publication. Compile twice:

    xelatex -no-shell-escape -interaction=nonstopmode -halt-on-error publication.tex
    xelatex -no-shell-escape -interaction=nonstopmode -halt-on-error publication.tex

Use a dedicated working directory with no sensitive files. Inspect warnings, especially unsupported font glyphs, unresolved references and overfull boxes. Never compile arbitrary edited TeX as trusted code. No document data is uploaded.

Current export boundaries: unsupported math commands or malformed math fail closed; tables support validated row/column spans and common block content; direct nested tables and headings are rejected, 12 columns maximum; local typography is overridden by the publication template with a warning. Links are emitted as literal URLs. Missing references/citations are visibly marked and reported. Publication options are export-session settings, not stored metadata. Equation numbering is native TeX; numbered display equations with stable UUIDs are selectable in the cross-reference dialog; existing legacy equations remain valid and acquire an ID when explicitly edited. Unnumbered or deleted equations remain unresolved until restored. Browser file-picker coverage is added for O5.3-Q01; closure requires actual three-browser success. Actual XeLaTeX and visual qualification remains required.

## Qualification

Preserve all 272 O5.3 checks. Additional publication unit and browser tests, including O5.3-Q01 file picker, must pass. Compile representative documents with all three templates and visually inspect generated PDF pages before qualification.

The existing Quality workflow additionally runs `node tests/compile-publication.mjs` with free TeX Live and Poppler, verifies the actual exported documents, extracts text and rasterizes pages. The artifact is named `office-publication-evidence`. The same command runs locally with the installed tools; rasterized pages require human visual review.

O5.4 continuation adds optional display equation UUIDs, cross-reference navigation and publication labels, and source-only PostgreSQL validator parity. No migration has been applied to a live database. Merged tables use fixed-width columns and native multicolumn/multirow with occupancy checks. The three compilation fixtures include combined row/column spans and resolved equation references.
