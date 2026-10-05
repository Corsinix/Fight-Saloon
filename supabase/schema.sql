-- Buckshot Saloon : à exécuter une fois dans Supabase → SQL Editor.
-- Les joueurs n'ont pas accès direct à la table : tout passe par les fonctions ci-dessous.

create table if not exists public.saloon_players (
  key        text primary key,             -- pseudo en minuscules
  username   text not null,
  "character"  jsonb not null default '{}'::jsonb,
  stats      jsonb not null default '{}'::jsonb,
  history    jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);

alter table public.saloon_players enable row level security;
-- Aucune policy : pas de lecture ni d'écriture directe avec la clé anon.

-- Connexion : crée le joueur s'il n'existe pas, puis le renvoie.
create or replace function public.saloon_login(p_username text, p_character jsonb)
returns public.saloon_players
language plpgsql security definer set search_path = public
as $$
declare r public.saloon_players;
begin
  if p_username is null or p_username !~ '^[A-Za-z0-9_éèàçÉÈÀ-]{2,16}$' then
    raise exception 'pseudo invalide';
  end if;
  insert into saloon_players as s (key, username, "character")
  values (lower(p_username), p_username,
          case when jsonb_typeof(p_character) = 'object' and length(p_character::text) < 1000 then p_character else '{}'::jsonb end)
  on conflict (key) do update set last_seen = now()
  returning * into r;
  return r;
end $$;

create or replace function public.saloon_save_character(p_username text, p_character jsonb)
returns public.saloon_players
language plpgsql security definer set search_path = public
as $$
declare r public.saloon_players;
begin
  if jsonb_typeof(p_character) <> 'object' or length(p_character::text) >= 1000 then
    raise exception 'personnage invalide';
  end if;
  update saloon_players set "character" = p_character, last_seen = now()
  where key = lower(p_username)
  returning * into r;
  return r;
end $$;

-- Fin de duel : ajoute les compteurs et met l'entrée en tête de l'historique (20 max).
create or replace function public.saloon_record(p_username text, p_stats jsonb, p_entry jsonb)
returns public.saloon_players
language plpgsql security definer set search_path = public
as $$
declare
  r  public.saloon_players;
  st jsonb;
  k  text;
  v  jsonb;
begin
  select * into r from saloon_players where key = lower(p_username) for update;
  if not found then return null; end if;
  st := r.stats;
  for k, v in select * from jsonb_each(coalesce(p_stats, '{}'::jsonb)) loop
    if k in ('played', 'wins', 'losses', 'soloPlayed', 'soloWins', 'soloLosses', 'shots', 'selfShots', 'hits',
             'mgPlayed', 'mgWins', 'soloMgPlayed', 'soloMgWins')
       and jsonb_typeof(v) = 'number' and (v::text)::numeric between 0 and 500 then
      st := jsonb_set(st, array[k], to_jsonb(coalesce((st->>k)::int, 0) + (v::text)::int));
    end if;
  end loop;
  update saloon_players s set
    stats = st,
    history = (
      select coalesce(jsonb_agg(e order by n), '[]'::jsonb)
      from jsonb_array_elements(
        case when jsonb_typeof(p_entry) = 'object' and length(p_entry::text) < 500
             then jsonb_build_array(p_entry) else '[]'::jsonb end || s.history
      ) with ordinality as t(e, n)
      where n <= 20
    ),
    last_seen = now()
  where s.key = r.key
  returning * into r;
  return r;
end $$;

create or replace function public.saloon_leaderboard()
returns table (username text, wins int, losses int, "character" jsonb)
language sql stable security definer set search_path = public
as $$
  select p.username,
         coalesce((p.stats->>'wins')::int, 0),
         coalesce((p.stats->>'losses')::int, 0),
         p."character"
  from saloon_players p
  where coalesce((p.stats->>'played')::int, 0) > 0
  order by 2 desc, 3 asc
  limit 10
$$;

grant execute on function public.saloon_login(text, jsonb) to anon, authenticated;
grant execute on function public.saloon_save_character(text, jsonb) to anon, authenticated;
grant execute on function public.saloon_record(text, jsonb, jsonb) to anon, authenticated;
grant execute on function public.saloon_leaderboard() to anon, authenticated;

-- Reprise des joueurs de l'ancien data/users.json
insert into public.saloon_players (key, username, "character", stats, history, created_at) values
  ('aa', 'aa', '{"skin":1,"hat":"sombrero","hatColor":1,"hair":"short","hairColor":1,"eyes":"wide","nose":"small","mouth":"frown","beard":"horseshoe","outfit":"vest","outfitColor":2}'::jsonb, '{"played":0,"wins":0,"losses":0,"shots":0,"selfShots":0,"hits":0}'::jsonb, '[]'::jsonb, '2026-10-04T19:19:14.613Z'::timestamptz),
  ('corsi', 'Corsi', '{"skin":1,"hat":"gambler","hatColor":1,"hair":"ponytail","hairColor":1,"eyes":"wide","nose":"broken","mouth":"grin","beard":"handlebar","outfit":"sheriff","outfitColor":2}'::jsonb, '{"played":0,"wins":0,"losses":0,"shots":0,"selfShots":0,"hits":0}'::jsonb, '[]'::jsonb, '2026-10-04T19:34:35.809Z'::timestamptz)
on conflict (key) do nothing;
