# QA Review — v1.5

## Production sources

- SeenThis tag files: enabled
- Adform tag files: enabled
- Google Campaign Manager XLS/XLSX: enabled
- HTML5 ZIP: hidden/disabled

## ZIP regression

The Arbetsförmedlingen HTML5 ZIP is deliberately rejected. The app must not generate a Hawk batch payload from it. The user is instructed to obtain the official SeenThis tag export instead.

This avoids the previously observed DSP failures caused by unverified ZIP-to-HTML/JavaScript transformations.
