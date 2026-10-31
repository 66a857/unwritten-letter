-- 在专用于此信箱的新 Supabase 项目中执行。数据表不对浏览器开放。
begin;
create schema if not exists letter_private;
revoke all on schema letter_private from public, anon, authenticated;
create table letter_private.boxes (
 id uuid primary key default gen_random_uuid(),
 key_hash text not null,
 created_at timestamptz not null default now()
);
create table letter_private.letters (
 id uuid primary key default gen_random_uuid(),
 mailbox uuid not null references letter_private.boxes(id) on delete cascade,
 body text not null check(char_length(body) between 1 and 5000),
 mood text not null check(mood in ('心里话','谢谢你','有点想你','小小祝福')),
 created_at timestamptz not null default now()
);
create index letter_mailbox_time on letter_private.letters(mailbox,created_at desc);
alter table letter_private.boxes enable row level security;
alter table letter_private.letters enable row level security;
revoke all on all tables in schema letter_private from public,anon,authenticated;
create function public.letter_box_create() returns jsonb language plpgsql security definer set search_path='' as $$
declare k text; b uuid;
begin
 perform pg_advisory_xact_lock(782391468);
 if (select count(*) from letter_private.boxes where created_at>now()-interval '1 hour')>=50 then raise exception 'creation_busy'; end if;
 k:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 insert into letter_private.boxes(key_hash) values(encode(sha256(convert_to(k,'UTF8')),'hex')) returning id into b;
 return jsonb_build_object('id',b,'key',k);
end $$;
create function public.letter_box_exists(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from letter_private.boxes where id=p_id) then raise exception 'mailbox_not_found'; end if;
 return true;
end $$;
create function public.letter_send(p_id uuid,p_body text,p_mood text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_body is null or char_length(trim(p_body)) not between 1 and 5000 or p_mood is null or p_mood not in ('心里话','谢谢你','有点想你','小小祝福') then raise exception 'invalid_letter'; end if;
 perform 1 from letter_private.boxes where id=p_id for update;
 if not found then raise exception 'mailbox_not_found'; end if;
 if (select count(*) from letter_private.letters where mailbox=p_id and created_at>now()-interval '1 minute')>=10 then raise exception 'mailbox_busy'; end if;
 insert into letter_private.letters(mailbox,body,mood) values(p_id,trim(p_body),p_mood);
 return true;
end $$;
create function public.letter_box_read(p_id uuid,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_key is null or not exists(select 1 from letter_private.boxes where id=p_id and key_hash=encode(sha256(convert_to(p_key,'UTF8')),'hex')) then raise exception 'invalid_key'; end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb) into result from (select id,body,mood,created_at from letter_private.letters where mailbox=p_id order by created_at desc limit 200) t;
 return result;
end $$;
create function public.letter_delete(p_id uuid,p_key text,p_letter uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_key is null or not exists(select 1 from letter_private.boxes where id=p_id and key_hash=encode(sha256(convert_to(p_key,'UTF8')),'hex')) then raise exception 'invalid_key'; end if;
 delete from letter_private.letters where id=p_letter and mailbox=p_id;
 return true;
end $$;
revoke all on function public.letter_box_create(),public.letter_box_exists(uuid),public.letter_send(uuid,text,text),public.letter_box_read(uuid,text),public.letter_delete(uuid,text,uuid) from public;
grant execute on function public.letter_box_create(),public.letter_box_exists(uuid),public.letter_send(uuid,text,text),public.letter_box_read(uuid,text),public.letter_delete(uuid,text,uuid) to anon,authenticated;
commit;
