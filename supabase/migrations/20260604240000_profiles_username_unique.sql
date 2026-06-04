UPDATE public.profiles SET username = lower(username) WHERE username IS NOT NULL;

WITH ranked AS (
  SELECT id, username,
    ROW_NUMBER() OVER (PARTITION BY username ORDER BY created_at NULLS LAST, id) AS rn
  FROM public.profiles
  WHERE username IS NOT NULL
)
UPDATE public.profiles p
SET username = NULL
FROM ranked r
WHERE p.id = r.id AND r.rn > 1;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_unique UNIQUE (username);
