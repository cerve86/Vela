-- ---------------------------------------------------------------------------
-- A client may see who her physiotherapist is
-- ---------------------------------------------------------------------------

/**
 * Until now the disclosure ran one way: a coach could read her clients' profiles, and a
 * client could read nobody's but her own. That made it impossible for the app to name the
 * person it keeps telling her to message — the profile screen could say "your
 * physiotherapist" and nothing more.
 *
 * This discloses no new information. The invitation email that created her account already
 * carried both the coach's name and the practice name, and she is in a clinical
 * relationship with that person by definition. What it fixes is that the app could not
 * repeat back what she was already told.
 *
 * Deliberately narrow in both directions: only the one coach who owns her client row, and
 * only for a client who actually has one. A client cannot enumerate coaches, and a coach
 * remains invisible to everybody else's clients.
 */
create policy profiles_client_reads_own_coach on public.profiles for
select
  using (
    exists (
      select
        1
      from
        public.clients c
      where
        c.profile_id = auth.uid ()
        and c.coach_id = public.profiles.id
    )
  );

create policy coaches_client_reads_own_coach on public.coaches for
select
  using (
    exists (
      select
        1
      from
        public.clients c
      where
        c.profile_id = auth.uid ()
        and c.coach_id = public.coaches.id
    )
  );
