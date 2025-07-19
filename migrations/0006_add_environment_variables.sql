-- Add environment variables field to mcp_servers table
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'mcp_servers' 
                   AND column_name = 'environment_variables') THEN
        ALTER TABLE mcp_servers ADD COLUMN environment_variables JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;