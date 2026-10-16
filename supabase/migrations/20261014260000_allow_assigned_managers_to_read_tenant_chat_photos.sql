DROP POLICY IF EXISTS "assigned_managers_read_tenant_chat_photos" ON storage.objects;
CREATE POLICY "assigned_managers_read_tenant_chat_photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'identity-documents'
    AND (storage.foldername(name))[1] = 'tenants'
    AND name LIKE 'tenants/%/photo-%'
    AND public.current_app_role() = 'property_manager'
    AND EXISTS (
      SELECT 1
      FROM public.tenants AS tenant
      JOIN public.chat_conversations AS conversation
        ON conversation.tenant_id = tenant.id
      WHERE tenant.id::text = (storage.foldername(name))[2]
        AND conversation.manager_id = (SELECT auth.uid())
        AND conversation.conversation_type = 'manager_tenant'
    )
  );
