-- Add Founding Member flag to profiles (idempotent: skips if the profiles table
-- lives in a schema this project doesn't manage).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_founding_member'
    ) THEN
      ALTER TABLE public.profiles ADD COLUMN is_founding_member boolean NOT NULL DEFAULT false;
    END IF;
  END IF;
END $$;