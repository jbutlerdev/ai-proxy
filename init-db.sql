-- Create database if it doesn't exist
SELECT 'CREATE DATABASE openai_proxy' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'openai_proxy');