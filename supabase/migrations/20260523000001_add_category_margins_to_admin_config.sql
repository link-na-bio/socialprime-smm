-- Add category_margins column to admin_config table
ALTER TABLE public.admin_config 
ADD COLUMN IF NOT EXISTS category_margins JSONB DEFAULT '[]'::jsonb;
