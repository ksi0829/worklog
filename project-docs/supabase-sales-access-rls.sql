begin;

drop policy if exists "sales_opportunities_select_authenticated_all"
on public.sales_opportunities;
drop policy if exists "sales_opportunities_insert_authenticated_all"
on public.sales_opportunities;
drop policy if exists "sales_opportunities_update_authenticated_all"
on public.sales_opportunities;
drop policy if exists "sales_opportunities_delete_authenticated_all"
on public.sales_opportunities;

drop policy if exists "sales_activities_select_authenticated_all"
on public.sales_activities;
drop policy if exists "sales_activities_insert_authenticated_all"
on public.sales_activities;
drop policy if exists "sales_activities_update_authenticated_all"
on public.sales_activities;
drop policy if exists "sales_activities_delete_authenticated_all"
on public.sales_activities;

create or replace function public.can_access_sales_module()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.name in (
          '신영호',
          '신상민',
          '정대용',
          '김선일',
          '이양로',
          '반준영'
        )
        or p.team in ('국내영업', '해외영업')
      )
  );
$$;

grant execute on function public.can_access_sales_module()
to authenticated;

create policy "sales_opportunities_select_sales_only"
on public.sales_opportunities
for select
to authenticated
using (public.can_access_sales_module());

create policy "sales_opportunities_insert_sales_only"
on public.sales_opportunities
for insert
to authenticated
with check (public.can_access_sales_module());

create policy "sales_opportunities_update_sales_only"
on public.sales_opportunities
for update
to authenticated
using (public.can_access_sales_module())
with check (public.can_access_sales_module());

create policy "sales_opportunities_delete_sales_only"
on public.sales_opportunities
for delete
to authenticated
using (public.can_access_sales_module());

create policy "sales_activities_select_sales_only"
on public.sales_activities
for select
to authenticated
using (public.can_access_sales_module());

create policy "sales_activities_insert_sales_only"
on public.sales_activities
for insert
to authenticated
with check (public.can_access_sales_module());

create policy "sales_activities_update_sales_only"
on public.sales_activities
for update
to authenticated
using (public.can_access_sales_module())
with check (public.can_access_sales_module());

create policy "sales_activities_delete_sales_only"
on public.sales_activities
for delete
to authenticated
using (public.can_access_sales_module());

commit;
