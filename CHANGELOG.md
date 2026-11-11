# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Breaking: replace the default function with `exportJSON()` and exported configuration types.
- Adopt node-GTFS v5 sources, database, reporting, extensions, and Schedule import settings.
- Move JSON options under `export`; add configurable output directory, source/agency filters, overwrite protection, and stop merging distance in meters.
- Replace legacy CLI flags with kebab-case flags and native argument parsing; use node-GTFS reporting and error formatting.
- Write source-scoped `<sourceId>.json` files and a dataset manifest. Preserve actual GTFS agency IDs and include source IDs.
- Align source layout, strict TypeScript, build, lint, formatting, CI, package exports, release checks, and supporting files with node-GTFS and GTFS-to-GeoJSON.
- Remove legacy logging, timing, table, argument-parser, filename-sanitizer, and lodash dependencies.

### Fixed

- Preserve routes sharing a short name and stops referencing a missing parent station.
- Stage output replacement and reject unrelated files, symlinks, and unsafe destinations.
- Avoid merging unnamed stops; preserve distinct stops without usable coordinates.
- Make route order deterministic and encode unsafe or case-colliding source IDs without overwriting files.

## [0.2.0] - 2026-11-10

### Updated

- node-gtfs v5
- Dependency updates

### Changed

- Deduplicate similar stops with identical names
- Only use parent station ids and names

## [0.1.6] - 2026-08-23

### Updated

- Dependency updates

## [0.1.5] - 2026-07-22

### Fixed

- Fix for deduplicating routes
- Better route sorting

### Updated

- Dependency updates

## [0.1.4] - 2026-07-20

### Added

- Add support for filtering by agency

### Updated

- Dependency updates

## [0.1.3] - 2026-06-18

### Updated

- Dependency updates
- Switch to tsdown

## [0.1.2] - 2025-06-10

### Updated

- Dependency updates

## [0.1.1] - 2025-02-25

### Updated

- Dependency updates

## [0.1.0]

### Added

- Initial Commit
