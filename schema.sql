-- Run in Supabase: SQL Editor > New query > paste > Run.

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  email text not null,
  birthday date not null,
  allergies text[] not null,
  emergency_notes text,
  qr_token uuid unique not null          -- random ID printed in the QR, no allergy data
);

create table orders (
  id bigint generated always as identity primary key,
  qr_token uuid references profiles(qr_token),
  phone text, street text, barangay text, city text, province text, zip text, notes text,
  status text not null default 'pending'
);

create table applications (
  id bigint generated always as identity primary key,
  business_name text, business_type text, address text,
  contact_person text, email text, phone text,
  status text not null default 'pending'  -- pending / approved / rejected
);

create table establishments (
  id uuid primary key references auth.users,
  business_name text not null,
  active boolean not null default false   -- admin flips this after approval
);

create table scans (                       -- usage stats only, no allergy data
  id bigint generated always as identity primary key,
  establishment_id uuid references establishments(id),
  scanned_at timestamptz not null default now()
);

-- Row-level security: customers see only their own rows; the public can only submit applications.
alter table profiles enable row level security;
alter table orders enable row level security;
alter table applications enable row level security;
alter table establishments enable row level security;
alter table scans enable row level security;

create policy "own profile" on profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own orders" on orders for all
  using (qr_token in (select qr_token from profiles where id = auth.uid()))
  with check (qr_token in (select qr_token from profiles where id = auth.uid()));
create policy "anyone can apply" on applications for insert with check (true);
create policy "own establishment" on establishments for select using (auth.uid() = id);

-- Staff never read profiles directly. They call this, which checks approval,
-- logs the scan, and returns only the fields needed.
create function scan_card(card_token uuid) returns json
language plpgsql security definer as $$
begin
  if not exists (select 1 from establishments where id = auth.uid() and active) then
    raise exception 'Establishment not approved';
  end if;
  insert into scans (establishment_id) values (auth.uid());
  return (select json_build_object('display_name', display_name, 'allergies', allergies)
          from profiles where qr_token = card_token);
end $$;

create function scan_count() returns bigint
language sql security definer as $$
  select count(*) from scans where establishment_id = auth.uid();
$$;
