-- The model id the Agent recorded on a message (e.g. `claude-opus-4-8`), so the
-- conversation pane can name the model per message and show a mid-chat switch
-- (ADR-0023, #195). Additive and nullable: reader turns record no model, and
-- rows normalized before this column existed read as NULL until the
-- NORMALIZE_VERSION bump re-normalizes them from Raw.
ALTER TABLE `messages` ADD COLUMN `model` text;
