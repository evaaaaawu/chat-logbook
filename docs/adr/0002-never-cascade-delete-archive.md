# Never cascade-delete Archive rows; only Purge deletes

Source deletions — vendor auto-cleanup, file unlink, path collisions — must never delete Archive rows. The supported Agents clean up differently (Claude Code prunes at ~30 days by default, Codex prunes on its own unconfigurable schedule, Aider doesn't prune), so mirroring Source into the Archive would make a Codex user silently lose threads. The Archive is the durable copy precisely because Source disappears.

The only action that deletes Archive rows is an explicit user **Purge**: confirmed, irreversible, and recorded as a permanent `user_purged` audit row. **Trash** (soft delete) only sets a Visibility flag in Metadata and never touches the Archive.

This is a load-bearing safety rule that is not derivable from the code — it is also restated in the root `CLAUDE.md`.
