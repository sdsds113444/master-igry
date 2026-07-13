-- Скриншоты к кейсам «Битва капитанов» (8–10) и «Альфа-марафон» (1–2),
-- извлечены из PRJECT GAME/ы/Кейсы ФЛ исправлен.xlsx (последние 2 листа файла).
-- Файлы лежат в public/case-images/*.webp, отдаются как статика Vercel.

alter table cases add column if not exists image_url text;

update cases set image_url = '/case-images/captains-8.webp'  where id = '7b1a2151-c014-4bb4-a658-366a7d2f22ae';
update cases set image_url = '/case-images/captains-9.webp'  where id = '242be9b0-8ce7-45ee-9714-295ee6e675bf';
update cases set image_url = '/case-images/captains-10.webp' where id = '9d20a2da-e1d8-454f-a4ad-980da67ada87';
update cases set image_url = '/case-images/marathon-1.webp'  where id = '28f5437b-a411-4b55-9110-216073d129ba';
update cases set image_url = '/case-images/marathon-2.webp'  where id = 'c2febe04-4faf-4834-b387-793ac3b70595';
