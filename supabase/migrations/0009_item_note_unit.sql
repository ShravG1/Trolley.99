-- Per-item note + free-text quantity unit (§2.3). A note is a general
-- instruction to the shopper ("get the own-brand one"); the unit disambiguates
-- the quantity ("2" → "2 L" / "1 pack"). Both optional, length-bounded.
alter table items add column if not exists note text
  check (note is null or char_length(note) <= 280);
alter table items add column if not exists unit text
  check (unit is null or char_length(unit) <= 24);

-- items UPDATE is column-scoped (migration 0008): the new mutable columns must be
-- granted explicitly or the client can't edit them. They're not audit fields.
grant update (note, unit) on items to authenticated;
