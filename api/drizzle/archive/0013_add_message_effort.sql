-- The reasoning effort the Agent recorded for a message (e.g. `medium`), so the
-- assistant byline can name it beside the model (ADR-0023, #234). Additive and
-- nullable on the same terms as `model`: many turns record no effort, and rows
-- normalized before this column existed read as NULL until the
-- NORMALIZE_VERSION bump re-normalizes them from Raw.
ALTER TABLE `messages` ADD COLUMN `effort` text;
