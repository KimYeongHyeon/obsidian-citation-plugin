> **Withdrawal:** 0.5.0 was removed from GitHub Releases after independent review reproduced baseline regressions. 0.5.1 is not released. The verification records below describe individual checks, not release approval. The current blockers are tracked in [STATUS.md](STATUS.md).

# Maintenance record — unreleased candidate

The [status matrix](STATUS.md) separately records resolution, code inclusion, release version, and evidence for all 160 issues and 15 PRs. It preserves requests and unverified reports rather than counting them as fixed.

## Changes in 0.5.1

- Preserve original BibTeX note angle brackets without reversing genuine Spanish punctuation or disabling TeX formatting/link conversion. A protected second parser pass replaces only note fields; other parsed metadata stays unchanged.
- Resolve citekey-only Zotero item and PDF links through Better BibTeX JSON-RPC. Explicit native URIs continue to work without lookup; ambiguous or missing items fail visibly. Local-only Zotero library URIs are supported.
- Resolve URI variables only when a title, note, or citation template references them, including `entry` paths. Existing notes are not rewritten.
- Use Node HTTP with a fixed loopback endpoint, explicit content length, timeout, HTTP/JSON/RPC validation. Obsidian requestUrl returned ERR_EMPTY_RESPONSE in the actual environment while Node HTTP returned the correct item. No network dependency was added.
- Check local PDF existence and report Electron launch failures.

## 0.5.1 verification

- Actual Obsidian 1.15.1 and Zotero 10.0.7 on macOS: an exact citekey resolved to its native item and PDF attachment; templates rendered the same verified URIs.
- Actual Citations search → Shift+Tab changed the Zotero reader from a different paper to the requested Reference-Free Human-Object Interaction Editing PDF. The rendered title, authors, and 35-page viewer were observed. Tab selected the correct item; its Citation Key field matched the input.
- Original bibliography remains 990 parsed records / 989 library entries. The two-pass parser test took 5.722 seconds in a separate Node check; this is not an app startup benchmark. Parser warnings were aggregated once.
- `npm test -- --runInBand`: 9 suites / 48 tests passed. Type checking, production build, native-class gate, and ESLint (zero errors) passed. Distribution identity and BRAT restart verification are recorded after completion.

The real PDF check covered Zotero's reader on macOS. Windows/Linux, arbitrary external PDF applications, mobile, and the declared minimum Obsidian version were not exercised. Citekey lookup requires a running Zotero with Better BibTeX; ordinary bibliography search does not.

---

# Maintenance record — 0.5.0

This independent fork starts from upstream `2edeecea` (Citations 0.4.5). Upstream retains authorship and the MIT license. Community PRs were reviewed and adapted rather than merged blindly. This is not an official upstream release.

## Upstream pull requests

All 15 open PRs captured on 2026-11-04 are accounted for below. Adaptations and limits are explicit.

| PR | Contributor | Integration |
|---|---|---|
| [#51](https://github.com/hans/obsidian-citation-plugin/pull/51) | [maia-sh](https://github.com/maia-sh) | Installation instructions updated for Community plugins and BRAT. |
| [#126](https://github.com/hans/obsidian-citation-plugin/pull/126) | [eddieantonio](https://github.com/eddieantonio) | Adapted with a YAML-escaping Handlebars helper; stored custom templates preserved. |
| [#128](https://github.com/hans/obsidian-citation-plugin/pull/128) | [eatse21](https://github.com/eatse21) | Parser upgraded to 6.0.1; anchor text retained in converted notes. |
| [#131](https://github.com/hans/obsidian-citation-plugin/pull/131) | [crashmoney](https://github.com/crashmoney) | Theme monospace font with a monospace fallback. |
| [#187](https://github.com/hans/obsidian-citation-plugin/pull/187) | [JoostScheffer](https://github.com/JoostScheffer) | Entry type exposed; BibLaTeX entry kind takes precedence over its separate type field. |
| [#211](https://github.com/hans/obsidian-citation-plugin/pull/211) | [jxpeng98](https://github.com/jxpeng98) | Keywords available to templates. |
| [#239](https://github.com/hans/obsidian-citation-plugin/pull/239) | [ypislon](https://github.com/ypislon) | Active editor captured before opening the modal; compatible active view fallback. |
| [#240](https://github.com/hans/obsidian-citation-plugin/pull/240) | [ypislon](https://github.com/ypislon) | Selection replacement uses the editor API; multiline cursor verified in Obsidian. |
| [#248](https://github.com/hans/obsidian-citation-plugin/pull/248) | [ludschmid](https://github.com/ludschmid) | Native item/PDF URIs supported when identity and library context are known. No arbitrary citekey-to-item-key guessing; insertion emits a URI. |
| [#250](https://github.com/hans/obsidian-citation-plugin/pull/250) | [Flecart](https://github.com/Flecart) | Moved notes found by unique filename; exact path wins. Filename identity limitation documented. |
| [#267](https://github.com/hans/obsidian-citation-plugin/pull/267) | [HEmile](https://github.com/HEmile) | Clipboard BibTeX or CSL JSON detected independently of configured export format; temporary library. |
| [#272](https://github.com/hans/obsidian-citation-plugin/pull/272) | [goi42](https://github.com/goi42) | Markdown link display uses the citekey and the resolved file. |
| [#279](https://github.com/hans/obsidian-citation-plugin/pull/279) | [alex-schutz](https://github.com/alex-schutz) | Adapted with the same YAML helper as PR126. |
| [#280](https://github.com/hans/obsidian-citation-plugin/pull/280) | [adzcai](https://github.com/adzcai) | Issued date exposed with validation and documented partial-date defaults. |
| [#289](https://github.com/hans/obsidian-citation-plugin/pull/289) | [adzcai](https://github.com/adzcai) | ES2018 target and native-class build gate prevent ES5 inheritance failure. |

## Other fixes

- Serialize reloads, watch export replacement and path changes, preserve the previous library on load failure, and always finish the loading state.
- Reject pending worker requests on error or termination and release watchers on unload.
- Preserve title capitalization, multiline JabRef comments, names, journal strings containing commas, and attachment path forms reported upstream.
- Clip search highlights, include editors in searches, and prevent duplicate modal selection.
- Validate bibliography shapes and IDs. Duplicate IDs warn and keep the last record for compatibility; invalid records and fatal parser errors fail visibly.

## Verification

- `npm test -- --runInBand`: 6 suites, 38 tests passed. Includes the original full German title from #265, the full multi-link sample from #171, queue old/new identity, failure preservation, metadata and worker regressions.
- `npm run lint`: zero errors; 99 nonblocking type warnings remain. Jest also emits its existing esModuleInterop configuration advisory.
- `npm run build`: type checking and production Rollup build passed. `npm run check:build`: all five Obsidian subclasses retain native class declarations. Actual ES5 and comment-spoofed negative bundles were rejected.
- Obsidian 1.15.0 on macOS: built 0.5.0 loaded with the existing settings file unchanged, 989 searchable references, and the requested Reference-Free paper visible in the search modal. Plugin reload captured no errors. A full app restart retained enabled version 0.5.0, loaded all 989 references, and finished loading.
- Actual Obsidian editor: selected text replaced with a multiline citation; cursor finished after the inserted text. A temporary test note was removed and the original note restored. Other plugins attempted to read the removed scratch note and logged ENOENT; a subsequent clean Citations reload captured no errors.
- A YAML parser roundtrip retained quotes, colons, newlines, and backslashes.
- Actual app worker: changing a temporary CSL file from an old record to a new record changed the loaded entry identity. Malformed JSON preserved the previous library and finished loading. Original bibliography and settings were restored; temporary input removed.
- The private bibliography contains 990 records and 989 unique IDs; the duplicate differed only in access date. It loaded as 989 with a duplicate warning and summarized nonfatal parser warnings. Private input was not committed.

## Issue triage and limits

See [the complete issue triage](UPSTREAM-ISSUES.md). Reviewing all 160 reports does not mean that all 160 are fixed: feature requests, unsupported platforms, and reports without reproduction data remain distinguished from implemented defects.

Note angle brackets can still change in the BibTeX parser (#150); citekey-only Zotero links can still fail on Zotero 9+ (#192/#287).

Known limits include filename-based moved-note identity, duplicate-ID last-record selection, semicolons in attachment filenames, and Zotero PDF links without library context. Mobile, arbitrary third-party views, and launching Zotero/PDF applications have not been validated. Existing notes and stored templates are preserved. Obsidian 0.15.9 remains the declared minimum; this release was tested on 1.15.0, not the minimum version.

## Distribution verification

- [Public release 0.5.0](https://github.com/KimYeongHyeon/obsidian-citation-plugin/releases/tag/0.5.0), source tag `b0a40a5`.
- [Build and test](https://github.com/KimYeongHyeon/obsidian-citation-plugin/actions/runs/41811183361) passed. [Release workflow](https://github.com/KimYeongHyeon/obsidian-citation-plugin/actions/runs/41811201703) passed on attempt 2. Attempt 1 failed only at the GitHub upload endpoint with HTTP 404; its temporary draft was removed automatically. The unchanged workflow succeeded on retry.
- All three GitHub release asset digests match the locally tested production build.
- BRAT latest-release registration and installation succeeded. Installed `main.js` and `styles.css` match the release bytes; BRAT reserialized `manifest.json`, whose parsed fields are identical. Existing `data.json` is byte-identical to the backup.
- After BRAT installation and a full app restart, Citations remained enabled at 0.5.0 with 989 entries. BRAT retained the fork registration and startup update checks.
- One fork announcement was posted in the [upstream maintenance discussion](https://github.com/hans/obsidian-citation-plugin/issues/266#issuecomment-6628016059).
