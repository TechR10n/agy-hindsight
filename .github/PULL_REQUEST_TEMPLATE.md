## Summary

<!-- Briefly describe what this PR changes and why. -->

## Verification Checklist

- [ ] `node ./scripts/self-test.mjs` passes (added or updated tests where applicable)
- [ ] `agy plugin validate --strict .` passes with **0 errors and 0 warnings**
- [ ] Zero external `npm` runtime dependencies added
- [ ] No hard-coded server URLs, bank IDs, private hostnames, file paths, or secrets introduced
- [ ] Shared-bank safety preserved (`createBank: false` default, `manageBankConfig: false`)
