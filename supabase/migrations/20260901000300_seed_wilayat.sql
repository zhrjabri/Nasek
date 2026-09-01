-- =============================================================================
-- NASEK — wilayat reference data
--
-- Generated from src/data/geo.ts, which the map and Smart Match already treat
-- as authoritative: the coordinates are real decimal degrees and the same
-- projection draws the coastline, so a marker sits where the wilayah actually
-- is and great-circle distances between departure points are genuine.
--
-- Kept in a migration rather than a seed file because campaigns and profiles
-- carry foreign keys into it — an empty wilayat table would reject every trip
-- an owner tried to publish.
-- =============================================================================

insert into public.wilayat (id, name_ar, name_en, governorate_ar, governorate_en, lat, lng)
values
  ('muscat', 'مسقط', 'Muscat', 'محافظة مسقط', 'Muscat Governorate', 23.6139, 58.5922),
  ('seeb', 'السيب', 'Seeb', 'محافظة مسقط', 'Muscat Governorate', 23.6703, 58.1891),
  ('bawshar', 'بوشر', 'Bawshar', 'محافظة مسقط', 'Muscat Governorate', 23.5859, 58.4),
  ('muttrah', 'مطرح', 'Muttrah', 'محافظة مسقط', 'Muscat Governorate', 23.615, 58.5636),
  ('amerat', 'العامرات', 'Al Amerat', 'محافظة مسقط', 'Muscat Governorate', 23.5333, 58.4972),
  ('sohar', 'صحار', 'Sohar', 'شمال الباطنة', 'North Al Batinah', 24.3417, 56.7089),
  ('shinas', 'شناص', 'Shinas', 'شمال الباطنة', 'North Al Batinah', 24.7419, 56.4664),
  ('saham', 'صحم', 'Saham', 'شمال الباطنة', 'North Al Batinah', 24.1722, 56.8886),
  ('suwaiq', 'السويق', 'Al Suwaiq', 'شمال الباطنة', 'North Al Batinah', 23.8492, 57.4383),
  ('barka', 'بركاء', 'Barka', 'جنوب الباطنة', 'South Al Batinah', 23.7069, 57.8892),
  ('rustaq', 'الرستاق', 'Al Rustaq', 'جنوب الباطنة', 'South Al Batinah', 23.3908, 57.4245),
  ('nakhal', 'نخل', 'Nakhal', 'جنوب الباطنة', 'South Al Batinah', 23.3961, 57.8231),
  ('nizwa', 'نزوى', 'Nizwa', 'محافظة الداخلية', 'Ad Dakhiliyah', 22.9333, 57.5333),
  ('bahla', 'بهلاء', 'Bahla', 'محافظة الداخلية', 'Ad Dakhiliyah', 22.9667, 57.3),
  ('samail', 'سمائل', 'Samail', 'محافظة الداخلية', 'Ad Dakhiliyah', 23.3, 57.9667),
  ('ibri', 'عبري', 'Ibri', 'محافظة الظاهرة', 'Ad Dhahirah', 23.2258, 56.5158),
  ('ibra', 'إبراء', 'Ibra', 'شمال الشرقية', 'North Ash Sharqiyah', 22.6906, 58.5334),
  ('sur', 'صور', 'Sur', 'جنوب الشرقية', 'South Ash Sharqiyah', 22.5667, 59.5289),
  ('salalah', 'صلالة', 'Salalah', 'محافظة ظفار', 'Dhofar', 17.0197, 54.0897),
  ('thumrait', 'ثمريت', 'Thumrait', 'محافظة ظفار', 'Dhofar', 17.6667, 54.0333),
  ('khasab', 'خصب', 'Khasab', 'محافظة مسندم', 'Musandam', 26.1794, 56.2437),
  ('haima', 'هيما', 'Haima', 'محافظة الوسطى', 'Al Wusta', 19.9591, 56.2769)
on conflict (id) do update set
  name_ar        = excluded.name_ar,
  name_en        = excluded.name_en,
  governorate_ar = excluded.governorate_ar,
  governorate_en = excluded.governorate_en,
  lat            = excluded.lat,
  lng            = excluded.lng;
