INSERT INTO public.settings (key, value, label)
VALUES ('custom_payment_methods', '[]', 'Custom Payment Methods')
ON CONFLICT (key) DO NOTHING;

DROP POLICY IF EXISTS "tenant_select_custom_payment_methods" ON public.settings;
CREATE POLICY "tenant_select_custom_payment_methods" ON public.settings
  FOR SELECT TO authenticated
  USING (
    key = 'custom_payment_methods'
    AND public.current_app_role() = 'tenant'
  );
