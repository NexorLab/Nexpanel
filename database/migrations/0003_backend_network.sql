-- Step 1: fragment + ECH move from global network settings onto the backend.
-- A backend may sit behind DPI and need fragmentation, another may want ECH —
-- these describe the server, so they belong on the backend row (BPB parity).
--
-- Defaults mirror DEFAULT_SETTINGS.network.fragment/ech so existing rows
-- (vahid, TR) render exactly as before: fragment "none", ECH off.

ALTER TABLE backends ADD COLUMN fragment TEXT NOT NULL DEFAULT '{"mode":"none","packets":"tlshello","lengthMin":100,"lengthMax":200,"delayMin":1,"delayMax":1,"maxSplitMin":0,"maxSplitMax":0}';
ALTER TABLE backends ADD COLUMN ech      TEXT NOT NULL DEFAULT '{"enabled":false,"serverName":""}';
