// Connexion à Supabase : Project Settings → API (ou Data API) dans le tableau de bord.
// La clé "anon" / "publishable" est faite pour être publique : les écritures passent
// uniquement par les fonctions SQL de supabase/schema.sql.
export const SUPABASE_URL = 'https://jefhqkjiwrnlzohxzazi.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_XpbSgKeuNZxC1cYBZ9JOpg_TuwvOHRv';

// Adresse du worker des liens d'invitation (invite/worker.js), affichée après `npm run deploy:invite`,
// Vide : lien direct ?lobby=CODE, aperçu générique.
export const INVITE_URL = 'https://saloon-invite.buckshot-saloon.workers.dev';
