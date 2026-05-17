begin;

grant select, insert, update, delete on public.approval_documents to authenticated;
grant select, insert, update, delete on public.approval_lines to authenticated;
grant select, insert, delete on public.approval_references to authenticated;

drop policy if exists "approval_documents_insert_own" on public.approval_documents;
drop policy if exists "approval_documents_insert_authenticated" on public.approval_documents;

create policy "approval_documents_insert_authenticated"
on public.approval_documents
for insert
to authenticated
with check (auth.uid() is not null);

drop policy if exists "approval_lines_insert_participant" on public.approval_lines;
drop policy if exists "approval_lines_insert_authenticated" on public.approval_lines;

create policy "approval_lines_insert_authenticated"
on public.approval_lines
for insert
to authenticated
with check (auth.uid() is not null);

drop policy if exists "approval_references_insert_document_participant" on public.approval_references;
drop policy if exists "approval_references_insert_authenticated" on public.approval_references;

create policy "approval_references_insert_authenticated"
on public.approval_references
for insert
to authenticated
with check (auth.uid() is not null);

commit;
