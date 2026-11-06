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
    request.id,
    'New maintenance request',
    format(
      'Tenant %s submitted a maintenance request for house %s: %s%s%s',
      tenant.full_name,
      house.house_number,
      request.title,
      E'\n',
      request.description
    ),
    'warning',
    'maintenance'
  FROM public.maintenance_requests AS request
  JOIN public.tenants AS tenant
    ON tenant.id = request.tenant_id
    AND tenant.house_id = request.house_id
    AND tenant.status = 'active'
  JOIN public.houses AS house ON house.id = request.house_id
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
    UNION
    SELECT caretaker.id AS user_id
    FROM public.profiles AS caretaker
    WHERE caretaker.role = 'caretaker'
      AND caretaker.is_active
      AND (
        caretaker.assigned_property_group_id = house.property_id
        OR caretaker.assigned_property_id = house.id
      )
  ) AS recipient
  WHERE request.id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_property_managers_on_maintenance_request
  ON public.maintenance_requests;
CREATE TRIGGER notify_property_managers_on_maintenance_request
  AFTER INSERT ON public.maintenance_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_property_managers_of_maintenance_request();

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
  request.id,
  'New maintenance request',
  format(
    'Tenant %s submitted a maintenance request for house %s: %s%s%s',
    tenant.full_name,
    house.house_number,
    request.title,
    E'\n',
    request.description
  ),
  'warning',
  'maintenance'
FROM public.maintenance_requests AS request
JOIN public.tenants AS tenant
  ON tenant.id = request.tenant_id
  AND tenant.house_id = request.house_id
  AND tenant.status = 'active'
JOIN public.houses AS house ON house.id = request.house_id
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
  UNION
  SELECT caretaker.id AS user_id
  FROM public.profiles AS caretaker
  WHERE caretaker.role = 'caretaker'
    AND caretaker.is_active
    AND (
      caretaker.assigned_property_group_id = house.property_id
      OR caretaker.assigned_property_id = house.id
    )
) AS recipient
WHERE request.status NOT IN ('completed', 'rejected')
  AND NOT EXISTS (
    SELECT 1
    FROM public.notifications AS existing_notification
    WHERE existing_notification.user_id = recipient.user_id
      AND existing_notification.maintenance_request_id = request.id
  );
