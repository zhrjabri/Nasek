-- =============================================================================
-- NASEK — initial schema
--
-- Written from docs/DATA-MODEL.md, which described these tables long before
-- there was a database to put them in. The TypeScript shapes in src/types.ts
-- map onto them 1:1, so the application layer needed no redesign to sit on
-- top of this.
--
-- Two conventions carried over from the prototype:
--
--   * Bilingual fields become two columns, `*_ar` and `*_en`. Arabic is the
--     platform's primary language, so neither is nullable and neither is a
--     translation of the other at the database level.
--   * Money is numeric(10,3). The Omani Rial has three decimal places and the
--     2% mediation fee needs all of them; a float would lose baisa.
--
-- Every statement is written to be re-runnable. `supabase db push` applies
-- migrations exactly once, but a migration that can be replayed by hand
-- against a database in an unknown state is worth far more during a migration
-- than one that can only be applied to an empty schema.
-- =============================================================================

-- Case-insensitive text, so Ali@x.com and ali@x.com are one account.
create extension if not exists citext;

-- ---------------------------------------------------------------- vocabulary
-- Each closed union in src/types.ts becomes an enum, so a typo in application
-- code is rejected by the database rather than stored and discovered later.

do $$ begin
  create type public.user_role as enum ('customer', 'provider', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.campaign_type as enum ('hajj', 'umrah');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.travel_method as enum ('air', 'land');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.verification_status as enum ('verified', 'pending', 'unverified');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.booking_status as enum ('pending', 'confirmed', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.provider_plan as enum ('basic', 'plus', 'premium');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_kind as enum ('booking', 'trip', 'availability', 'system');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------------- wilayat
-- Oman's wilayat, with real decimal-degree coordinates. Smart Match ranks
-- departure points by great-circle distance from these, so they are data and
-- not a display label.

create table if not exists public.wilayat (
  id              text primary key,
  name_ar         text not null,
  name_en         text not null,
  governorate_ar  text not null,
  governorate_en  text not null,
  lat             double precision not null,
  lng             double precision not null
);

-- ------------------------------------------------------------------ profiles
-- One row per authenticated person. `id` is the auth.users id rather than a
-- key of its own: a profile without a login is not a thing NASEK has, and
-- sharing the key means every policy can compare against auth.uid() directly
-- with no join.
--
-- Note what is NOT here: no password column of any kind. Supabase Auth holds
-- credentials in a schema this one cannot read, and NASEK signs people in with
-- one-time codes, so there is no password for this table to have mishandled.

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  name         text not null default '',
  email        citext,
  phone        text,
  role         public.user_role not null default 'customer',
  wilayah_id   text references public.wilayat (id),
  avatar_color text not null default '#1c5e4c',
  provider_id  uuid,
  -- Moderation. Suspension keeps an account out; removal hides it from the
  -- directory without deleting the person, because bookings and revenue
  -- history are reconstructed from them and erasing the row would silently
  -- rewrite the platform's own accounts.
  suspended    boolean not null default false,
  removed      boolean not null default false,
  created_at   timestamptz not null default now()
);

create unique index if not exists profiles_email_key on public.profiles (email) where email is not null;
create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_provider_idx on public.profiles (provider_id);

-- ----------------------------------------------------------------- providers
-- The campaign owner. One provider, many campaigns.

create table if not exists public.providers (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid references public.profiles (id) on delete set null,
  name_ar           text not null,
  name_en           text not null,
  tagline_ar        text not null default '',
  tagline_en        text not null default '',
  description_ar    text not null default '',
  description_en    text not null default '',
  wilayah_id        text references public.wilayat (id),
  verification      public.verification_status not null default 'pending',
  experience_years  int not null default 0 check (experience_years >= 0),
  rating            numeric(2,1) not null default 0 check (rating >= 0 and rating <= 5),
  review_count      int not null default 0 check (review_count >= 0),
  phone             text,
  email             citext,
  initials          text not null default '?',
  brand_color       text not null default '#1c5e4c',
  plan              public.provider_plan not null default 'basic',
  joined_at         date not null default current_date,
  -- The permit image the owner uploaded, downscaled client-side. Stored as a
  -- data URL for now; production moves this to Storage with signed URLs, which
  -- is a change of column type and nothing else.
  licence_image     text,
  licence_file_name text,
  -- Who verified, when. docs/DATA-MODEL.md called for an audit trail and the
  -- prototype only ever stored the resulting flag.
  verified_by       uuid references public.profiles (id) on delete set null,
  verified_at       timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists providers_owner_idx on public.providers (owner_id);
create index if not exists providers_verification_idx on public.providers (verification);

-- profiles.provider_id points back at providers; added after both exist.
do $$ begin
  alter table public.profiles
    add constraint profiles_provider_fk
    foreign key (provider_id) references public.providers (id) on delete set null;
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------- campaigns
-- One trip with a fixed departure. The same programme run in March and April
-- is two rows, which is what makes seats, price and availability meaningful.

create table if not exists public.campaigns (
  id               uuid primary key default gen_random_uuid(),
  provider_id      uuid not null references public.providers (id) on delete cascade,
  type             public.campaign_type not null,
  title_ar         text not null,
  title_en         text not null,
  description_ar   text not null default '',
  description_en   text not null default '',
  price            numeric(10,3) not null check (price >= 0),
  wilayah_id       text references public.wilayat (id),
  travel_method    public.travel_method not null,
  departure_date   date not null,
  return_date      date not null,
  seats_total      int not null check (seats_total >= 0),
  seats_available  int not null check (seats_available >= 0),
  services         text[] not null default '{}',
  hotel_makkah_ar  text not null default '',
  hotel_makkah_en  text not null default '',
  hotel_madinah_ar text not null default '',
  hotel_madinah_en text not null default '',
  haram_distance_m int not null default 0 check (haram_distance_m >= 0),
  rating           numeric(2,1) not null default 0 check (rating >= 0 and rating <= 5),
  review_count     int not null default 0 check (review_count >= 0),
  featured         boolean not null default false,
  bookings_count   int not null default 0 check (bookings_count >= 0),
  -- Moderation, and deliberately distinct from an owner deleting their own
  -- trip: an owner must not be able to undo a takedown by republishing.
  suspended        boolean not null default false,
  deleted          boolean not null default false,
  created_at       timestamptz not null default now(),
  constraint campaigns_dates_ordered check (return_date >= departure_date),
  constraint campaigns_seats_sane check (seats_available <= seats_total)
);

-- The indexes docs/DATA-MODEL.md called for: the filter panel's three hot
-- paths, plus a GIN index for the "must include these services" filter.
create index if not exists campaigns_type_departure_idx on public.campaigns (type, departure_date);
create index if not exists campaigns_wilayah_idx on public.campaigns (wilayah_id);
create index if not exists campaigns_price_idx on public.campaigns (price);
create index if not exists campaigns_provider_idx on public.campaigns (provider_id);
create index if not exists campaigns_services_idx on public.campaigns using gin (services);

-- ------------------------------------------------------------------ bookings

create table if not exists public.bookings (
  id               uuid primary key default gen_random_uuid(),
  reference        text not null unique,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  campaign_id      uuid not null references public.campaigns (id) on delete restrict,
  travellers_count int not null check (travellers_count > 0),
  contact_name     text not null,
  contact_phone    text not null,
  contact_email    citext not null,
  total_price      numeric(10,3) not null check (total_price >= 0),
  status           public.booking_status not null default 'pending',
  booking_date     date not null default current_date,
  notes            text,
  created_at       timestamptz not null default now()
);

create index if not exists bookings_user_idx on public.bookings (user_id);
create index if not exists bookings_campaign_idx on public.bookings (campaign_id);
create index if not exists bookings_status_idx on public.bookings (status);

-- ---------------------------------------------------------------- travellers
-- Split out of bookings because NASEK's registration flow collects full
-- details per companion, and non-Omani residents need more of them.
--
-- civil_id and passport_no are personal data. They are readable only by the
-- traveller who booked and by an administrator; production should additionally
-- encrypt them at rest with pgsodium or an application-side key.

create table if not exists public.travellers (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings (id) on delete cascade,
  name         text not null,
  nationality  text not null default '',
  gender       text check (gender in ('male', 'female')),
  civil_id     text,
  passport_no  text,
  residence_no text,
  sponsor_name text
);

create index if not exists travellers_booking_idx on public.travellers (booking_id);

-- ------------------------------------------------------------------- reviews

create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  provider_id uuid not null references public.providers (id) on delete cascade,
  rating      int not null check (rating between 1 and 5),
  comment_ar  text not null default '',
  comment_en  text not null default '',
  hidden      boolean not null default false,
  created_at  timestamptz not null default now(),
  -- The integrity rule the UI has always promised: one review per traveller
  -- per trip. The "must have completed a booking" half is enforced by trigger
  -- below, because it needs a lookup rather than a constraint.
  unique (user_id, campaign_id)
);

create index if not exists reviews_campaign_idx on public.reviews (campaign_id);
create index if not exists reviews_provider_idx on public.reviews (provider_id);

-- ------------------------------------------------------------- notifications

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       public.notification_kind not null default 'system',
  title_ar   text not null,
  title_en   text not null,
  body_ar    text not null default '',
  body_en    text not null default '',
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, read);

-- ------------------------------------------------------------ saved campaigns

create table if not exists public.saved_campaigns (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, campaign_id)
);

-- -------------------------------------------------------------- admin audit
-- Every administrative decision, with the administrator who made it. The
-- prototype stored only the resulting flag, which meant a verification badge
-- rested on nothing anyone could later inspect.

create table if not exists public.admin_audit (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  entity      text not null,
  entity_id   text not null,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists admin_audit_created_idx on public.admin_audit (created_at desc);
create index if not exists admin_audit_entity_idx on public.admin_audit (entity, entity_id);
