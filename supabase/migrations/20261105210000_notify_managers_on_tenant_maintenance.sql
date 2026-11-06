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
    assignment.manager_id,
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
  JOIN public.property_manager_houses AS assignment ON assignment.house_id = house.id
  JOIN public.profiles AS manager
    ON manager.id = assignment.manager_id
    AND manager.role = 'property_manager'
    AND manager.is_active
  WHERE tenant.id = NEW.tenant_id
    AND tenant.house_id = NEW.house_id
    AND tenant.status = 'active';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_property_managers_on_maintenance_request
  ON public.maintenance_requests;
CREATE TRIGGER notify_property_managers_on_maintenance_request
  AFTER INSERT ON public.maintenance_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_property_managers_of_maintenance_request();
