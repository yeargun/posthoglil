# Source-build measurements

Measured 2026-09-27T16:44:36Z using LilScript `d1d48c4ca24b5d4ccd3016dc4913d85c6d38a41c` and the upstream Git revision recorded in `job.json`.

`result.json` records the commands, wall time, CPU time, machine and exit codes. `esm.json` records the production ESM assembly and exact input graph. `compiler-invocations.jsonl` records the wall time of each compiler invocation inside the last LilScript build. The lockfiles record dependency resolution. The public page uses `source-build.json` for the final consolidated record.

Run the installation and setup commands from `job.json` in the corresponding pinned upstream checkout; they are excluded from build time. Run the recorded build command with Node v24.11.1. Clear the listed generated output directories between repetitions. Install the port dependencies and set `LILSCRIPT_COMPILER`, `LILSCRIPT_ROOT` and `LILSCRIPT_CODEC` to the recorded compiler and codec.

The original repository build (the complete PostHog SDK) and the comparison ESM assembly (the selected kernel) are measured separately. Build output scope differs between the repositories; no build speedup is inferred. The LilScript lane and the ESM assembly ran on an Azure Standard_B8als_v2 host that also runs unrelated jobs. The original repository build was not re-run there (one sample ran past 20 minutes under load); its three samples are carried from `original-2026-09-10-result.json`, measured on an Azure Standard_D16als_v7 worker.
