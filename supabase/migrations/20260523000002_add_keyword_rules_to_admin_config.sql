-- Add keyword_rules column to admin_config table
ALTER TABLE public.admin_config 
ADD COLUMN IF NOT EXISTS keyword_rules JSONB DEFAULT '[]'::jsonb;
