# Parser logic

## Creative name

The parser supports two main SeenThis export formats.

### A. Full name in each script comment

Example:

```text
AMF Fastighter Sweden - AMF-Västermalmsgallerian - Höstkampanj - Parken - 980 × 300 - 980x300
```

Result:

```text
AMF-Västermalmsgallerian - Höstkampanj - Parken - 980 × 300
```

Rules:
- remove the advertiser/account prefix when it can be identified against the file-level header
- remove the final duplicated dimension
- keep the human-readable dimension using `×`

### B. Script comment contains only the size

File header:

```text
AMF Fastighter Sweden - AMF-MOOD Wellness - Wellness
```

Script comment:

```text
980 × 300 - 980x300
```

Result:

```text
AMF-MOOD Wellness - Wellness - 980 × 300
```

The same logic is used for the Friskis and Fältöversten examples.

## Dimension

1. Numeric `data-width` + `data-height` are used when available.
2. The comment is used as fallback, which is required for creatives using `100vw` / `100vh`.
3. If the dimension is missing from the template dropdown, the row is automatically excluded and receives a warning.
4. No nearby or specially mapped size is selected.

## Export

- Only rows with a valid template size and `included=true` are exported.
- The user can manually exclude or remove rows.
- Invalid/unknown sizes do not block export of the remaining valid creatives.
