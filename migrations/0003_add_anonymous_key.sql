-- Add anonymous API key for unauthenticated requests
-- First, check if anonymous key exists
INSERT INTO api_keys (key, name, active, created_at, updated_at)
SELECT 'anonymous', 'Anonymous', true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM api_keys WHERE key = 'anonymous');