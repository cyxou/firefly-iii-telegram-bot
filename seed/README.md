# Optional DB dumps for the dev stack

Any `*.sql` / `*.sql.gz` dropped into this directory is auto-restored by the
`postgres` container from `compose.firefly.yaml` on first `up` (empty data
volume only). Re-restore from scratch with `down -v && up -d`.

Dumps are LOCAL-ONLY (gitignored). If you bring your own:

- It must come from a stack sharing this compose file's `APP_KEY` (Firefly
  encrypts some columns with it).
- Keep the Firefly image tag >= the version the dump was made with; Firefly
  migrates older dumps forward on boot.
