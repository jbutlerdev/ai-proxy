-- Add thinking tokens and time to first token metrics
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reasoning_tokens integer DEFAULT 0 NOT NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS time_to_first_token_ms integer;