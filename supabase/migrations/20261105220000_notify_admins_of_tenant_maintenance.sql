CREATE OR REPLACE FUNCTION public.notify_property_managers_of_maintenance_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.notifications (
    user_id,
    sender_id,
    maintenance_request_id,
    title,
    message,
    type,
    link
  )
  SELECT
    recipient.user_id,
    tenant.user_id,
    NEW.id,
    'New maintenance request',
    format(
      'Tenant %s submitted a maintenance request for house %s: %s%s%s',
      tenant.full_name,
      house.house_number,
      NEW.title,
      E'\n',
      NEW.description
    ),
    'warning',
    'maintenance'
  FROM public.tenants AS tenant
  JOIN public.houses AS house ON house.id = NEW.house_id
  CROSS JOIN LATERAL (
    SELECT admin.id AS user_id
    FROM public.profiles AS admin
    WHERE admin.role = 'admin'
      AND admin.is_active
    UNION
    SELECT manager.id AS user_id
    FROM public.property_manager_houses AS assignment
    JOIN public.profiles AS manager
      ON manager.id = assignment.manager_id
      AND manager.role = 'property_manager'
      AND manager.is_active
    WHERE assignment.house_id = house.id
  ) AS recipient
  WHERE tenant.id = NEW.tenant_id
    AND tenant.house_id = NEW.house_id
    AND tenant.status = 'active';

  RETURN NEW;
END;
$$;
