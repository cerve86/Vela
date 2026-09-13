-- Which prescribed movements a session actually finished.
--
-- The app ticks sets on the phone and, on send, writes only the totals: sets done over
-- sets planned. That says how much of a day was done and not which of it. The week view
-- marks each movement she completed, so the session carries the ids of the items whose
-- every set was ticked. Written by the client with the rest of the outcome; read by her
-- and her coach through the policies sessions already have.
alter table public.sessions
  add column if not exists done_item_ids uuid[] not null default '{}';
