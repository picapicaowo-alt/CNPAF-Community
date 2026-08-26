# Dataset Phase 1 — demo-ready scope

Status: implemented and verified for the current local integration build. This
is the Dataset scope intended for tomorrow's demonstration.

## User flow and data relationships

```text
Insights drill-down ──> Records filters ──┬─> canonical filter selection
                                         └─> eligible current results / manual record selection
                                                        │
                                                        v
Dataset (selection query + classification + field policy)
  └─> Dataset Version v1 (immutable snapshot, count, content hash)
        └─> Dataset Record[]
              ├─> Record
              └─> exact Record Version captured at creation

Refresh ──> Dataset Version v2 (new immutable snapshot; v1 remains unchanged)
```

`Dataset` is the long-lived definition. `Dataset Version` is an immutable run of
that definition. Each `Dataset Record` links one Record to the exact frozen
Record Version, so a later correction cannot silently rewrite an earlier
download.

## Implemented filters

Records and the Dataset builder support:

- occurred/submitted time range;
- Organization and Program;
- Location;
- Service/source type and source origin;
- Population;
- Form Version;
- Collector;
- review status and Research Use status;
- Finding Type;
- canonical Theme/Concern.

These canonical filters use the shared evidence-filter implementation also used
by reports, exports and Ask Collect. Unknown filter fields are rejected.

The Records page is the primary filter surface. Filter options are authorized
through Records visibility, independently of `datasets.create`, so an operations
reviewer can narrow the working list even when Dataset actions are unavailable.
The displayed list, current-result selection, select-all behavior, and Dataset
handoff use the same filtered result.

## Creation modes

- Create from repeatable canonical filters.
- Create from manually selected eligible records.
- Create from the currently visible eligible Records result.
- Keyword, privacy-state and concern drill-downs are intentionally treated as
  non-canonical. They freeze explicit Record IDs from the current result instead
  of pretending the search is a reproducible Dataset filter.
- One Dataset belongs to one Organization; cross-organization selection is
  blocked.

## Compliance and permission gates

The default `approved_evidence` Dataset accepts only records that are:

1. human-approved;
2. privacy-cleared or redacted;
3. `approved_for_research`;
4. visible through the actor's current `records.view_approved` scope.

Restricted classifications additionally require raw-record and restricted-PII
permissions. Access is revalidated on download/share; a previously frozen record
does not bypass a later permission change.

## Version, field and download behavior

- Creation freezes exact `recordId + recordVersionId` pairs, the selection,
  field policy, record count and content hash.
- Refresh creates `Dataset Version N+1`; it never updates an earlier version.
- Non-canonical selections retain explicit Record IDs. A later refresh may
  capture new eligible head versions for those same IDs, while the earlier
  Dataset Version remains unchanged.
- Included fields are frozen in the version. Download cannot expand that policy
  or introduce restricted PII.
- `media_attachments` freezes the image/audio/video/document manifest attached
  to each exact Record Version and includes it in the Dataset content hash.
- Dataset detail supports authenticated image preview, audio/video playback,
  and file download. Ask Collect and initial report drafting can explicitly use
  supported images and privacy-screenable documents; audio/video are never
  sent by this workflow.
- CSV and JSON downloads use deterministic serialization and retain the Dataset
  version number and record count.

## Insights compatibility

Existing Insights/Analytics links to Records remain supported, including
`status`, `source`, `stage` and `hasConcerns` query parameters. Canonical values
flow into the Dataset filter model; non-canonical drill-downs freeze the current
eligible Records result as explicit IDs.

## Demo checklist

1. Open Insights and follow an approved/source drill-down to Records.
2. Add Program, Location, Form Version, Collector or advanced evidence filters.
3. Create a Dataset from the current filters or select individual records.
4. Show Dataset Version 1, frozen record count and field policy.
5. Download CSV or JSON.
6. Refresh and show Version 2 while Version 1 remains available and unchanged.

## Phase 2 status

Dataset detail, version history, sharing, revocation, archive and initial cited
Report Version handoff are now implemented in the local integration set. The
Local-to-S3 manifest/checksum/backfill/cutover tooling is executable; commercial
Rating Versions remain the next phase. Current status and acceptance gates are in
[dataset-report-rating-roadmap.md](dataset-report-rating-roadmap.md).
