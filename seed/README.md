# Optional DB dumps for the dev stack

Any `*.sql` / `*.sql.gz` dropped into this directory is auto-restored by the
`postgres` container from `compose.firefly.yaml` on first `up` (empty data
volume only — init scripts never re-run on an existing volume). Re-restore by
removing just the DB volume:

```bash
docker compose -f compose.firefly.yaml down
docker volume rm <project>_firefly_pg   # <project> = worktree dir basename, lowercased
docker compose -f compose.firefly.yaml up -d
```

(`down -v` also works but wipes `firefly_iii_upload` — all attachments — too.)

Dumps are LOCAL-ONLY (gitignored). If you bring your own:

- It must come from a stack sharing this compose file's `APP_KEY` (Firefly
  encrypts some columns with it).
- Keep the Firefly image tag >= the version the dump was made with; Firefly
  migrates older dumps forward on boot.
