begin;

create or replace function public.submit_approval_document(
  document_payload jsonb,
  line_payload jsonb,
  reference_payload jsonb default '[]'::jsonb,
  notification_payload jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  requester uuid;
  new_document_id bigint;
begin
  requester := auth.uid();

  if requester is null then
    raise exception 'login required' using errcode = '28000';
  end if;

  insert into public.approval_documents (
    template_key,
    template_title,
    title,
    status,
    requester_id,
    requester_name,
    requester_team,
    current_step,
    form_data,
    equipment_order_id,
    equipment_stage_key
  )
  values (
    document_payload->>'template_key',
    document_payload->>'template_title',
    document_payload->>'title',
    coalesce(document_payload->>'status', 'pending'),
    requester,
    coalesce(document_payload->>'requester_name', '작성자'),
    nullif(document_payload->>'requester_team', ''),
    coalesce((document_payload->>'current_step')::integer, 1),
    coalesce(document_payload->'form_data', '{}'::jsonb),
    nullif(document_payload->>'equipment_order_id', '')::bigint,
    nullif(document_payload->>'equipment_stage_key', '')
  )
  returning id into new_document_id;

  insert into public.approval_lines (
    document_id,
    step_order,
    role_label,
    approver_id,
    approver_name,
    approver_team,
    status
  )
  select
    new_document_id,
    x.step_order,
    x.role_label,
    x.approver_id,
    x.approver_name,
    x.approver_team,
    coalesce(x.status, 'pending')
  from jsonb_to_recordset(coalesce(line_payload, '[]'::jsonb)) as x(
    step_order integer,
    role_label text,
    approver_id uuid,
    approver_name text,
    approver_team text,
    status text
  );

  insert into public.approval_references (
    document_id,
    user_id,
    reference_name,
    reference_team
  )
  select
    new_document_id,
    x.user_id,
    x.reference_name,
    x.reference_team
  from jsonb_to_recordset(coalesce(reference_payload, '[]'::jsonb)) as x(
    user_id uuid,
    reference_name text,
    reference_team text
  );

  insert into public.approval_notifications (
    user_id,
    document_id,
    message
  )
  select
    x.user_id,
    new_document_id,
    x.message
  from jsonb_to_recordset(coalesce(notification_payload, '[]'::jsonb)) as x(
    user_id uuid,
    message text
  );

  return new_document_id;
end;
$$;

grant execute on function public.submit_approval_document(jsonb, jsonb, jsonb, jsonb) to authenticated;

commit;
