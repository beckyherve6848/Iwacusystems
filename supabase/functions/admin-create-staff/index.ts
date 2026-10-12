import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const authorization = request.headers.get('Authorization');
  const token = authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return jsonResponse(401, { error: 'Authentication is required.' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('Required Supabase function environment variables are missing.');
    return jsonResponse(500, { error: 'Staff account creation is not configured.' });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser(token);
  if (authError || !user) return jsonResponse(401, { error: 'Your session is invalid or expired.' });

  const { data: adminProfile, error: adminError } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (adminError) {
    console.error('Unable to verify staff creator role:', adminError.message);
    return jsonResponse(500, { error: 'Unable to verify administrator access.' });
  }
  if (adminProfile?.role !== 'admin') return jsonResponse(403, { error: 'Administrator access is required.' });

  let body: {
    role?: string;
    fullName?: string;
    staffId?: string;
    email?: string;
    phone?: string;
    nationalId?: string;
    residentialAddress?: string;
    propertyId?: string;
    houseId?: string;
    houseIds?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Request body must be valid JSON.' });
  }

  const role = body.role;
  const fullName = body.fullName?.trim();
  const staffId = body.staffId?.trim();
  const email = body.email?.trim().toLowerCase();
  const phone = body.phone?.trim();
  const nationalId = body.nationalId?.trim();
  const residentialAddress = body.residentialAddress?.trim();
  if (!['caretaker', 'property_manager'].includes(role ?? '')) {
    return jsonResponse(400, { error: 'Role must be caretaker or property_manager.' });
  }
  if (!fullName || fullName.length > 120 || !email || email.length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || !phone || phone.length > 40 || !nationalId || nationalId.length > 80
    || !residentialAddress || residentialAddress.length > 300
    || (staffId !== undefined && (!staffId || staffId.length > 40 || /[\r\n]/.test(staffId)))) {
    return jsonResponse(400, { error: 'Enter a valid name, email, phone, ID/passport number, and residential address.' });
  }

  const houseIds = role === 'property_manager'
    ? [...new Set((body.houseIds ?? []).filter((id): id is string => typeof id === 'string'))]
    : [];
  if (role === 'property_manager' && houseIds.length === 0) {
    return jsonResponse(400, { error: 'Assign at least one house.' });
  }

  if (staffId) {
    const { data: matchingStaffId, error: staffIdError } = await serviceClient
      .from('profiles')
      .select('id')
      .eq('staff_id', staffId)
      .maybeSingle();
    if (staffIdError) {
      console.error('Unable to check preferred staff ID availability:', staffIdError.message);
      return jsonResponse(500, { error: 'Unable to verify whether the preferred Staff ID is available.' });
    }
    if (matchingStaffId) {
      return jsonResponse(409, { error: 'That Staff ID is already in use. Choose a different Staff ID.' });
    }
  }

  let houses: { id: string; house_number: string }[] = [];
  let caretakerProperty: { id: string; name: string } | null = null;
  if (role === 'property_manager') {
    const { data, error: houseError } = await serviceClient
      .from('houses')
      .select('id, house_number')
      .in('id', houseIds);
    if (houseError) {
      console.error('Unable to validate staff house assignments:', houseError.message);
      return jsonResponse(500, { error: 'Unable to validate the selected houses.' });
    }
    if (!data || data.length !== houseIds.length) {
      return jsonResponse(400, { error: 'One or more selected houses do not exist.' });
    }
    houses = data;

    const { data: existingAssignments, error: assignmentCheckError } = await serviceClient
      .from('property_manager_houses')
      .select('house_id')
      .in('house_id', houseIds);
    if (assignmentCheckError) {
      console.error('Unable to check house assignment availability:', assignmentCheckError.message);
      return jsonResponse(500, { error: 'Unable to check whether the selected houses are available.' });
    }
    if (existingAssignments?.length) {
      return jsonResponse(409, { error: 'One or more selected houses are already assigned to another property manager.' });
    }
  } else {
    if (!body.propertyId) return jsonResponse(400, { error: 'Select a property for the caretaker.' });
    const { data, error: propertyError } = await serviceClient
      .from('properties')
      .select('id, name')
      .eq('id', body.propertyId)
      .maybeSingle();
    if (propertyError) {
      console.error('Unable to validate caretaker property assignment:', propertyError.message);
      return jsonResponse(500, { error: 'Unable to validate the selected property.' });
    }
    if (!data) return jsonResponse(400, { error: 'The selected property does not exist.' });
    caretakerProperty = data;
    const { data: propertyHouses, error: houseError } = await serviceClient
      .from('houses')
      .select('id, house_number')
      .eq('property_id', data.id)
      .order('house_number');
    if (houseError) {
      console.error('Unable to load houses for caretaker property:', houseError.message);
      return jsonResponse(500, { error: 'Unable to load the selected property houses.' });
    }
    if (!propertyHouses?.length) return jsonResponse(400, { error: 'Add at least one house to this property before assigning a caretaker.' });
    houses = propertyHouses;
  }

  const appOrigin = Deno.env.get('APP_ORIGIN');
  const { data: invited, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, phone },
    ...(appOrigin ? { redirectTo: appOrigin } : {}),
  });
  if (inviteError || !invited.user) {
    return jsonResponse(400, { error: inviteError?.message ?? 'Supabase did not return the invited user.' });
  }

  const staffProfile = {
    full_name: fullName,
    email,
    phone,
    role,
    ...(staffId ? { staff_id: staffId } : {}),
    is_active: role === 'property_manager' ? houseIds.length > 0 : true,
    national_id: nationalId,
    residential_address: residentialAddress,
    assigned_property_id: role === 'caretaker' ? houses[0].id : null,
    assigned_property_group_id: role === 'caretaker' ? caretakerProperty?.id : null,
    assigned_property_name: role === 'caretaker' ? caretakerProperty?.name : null,
    updated_at: new Date().toISOString(),
  };
  const { data: profile, error: profileError } = await serviceClient
    .from('profiles')
    .update(staffProfile)
    .eq('id', invited.user.id)
    .select('id, staff_id')
    .single();

  if (profileError || !profile) {
    console.error('Unable to complete invited staff profile:', profileError?.message);
    await serviceClient.auth.admin.deleteUser(invited.user.id);
    if (profileError?.code === '23505' && staffId) {
      return jsonResponse(409, { error: 'That Staff ID is already in use. Choose a different Staff ID.' });
    }
    return jsonResponse(500, { error: 'Could not finish the staff profile; the invitation was canceled.' });
  }

  if (role === 'property_manager') {
    const { error: assignmentError } = await serviceClient.rpc('assign_property_manager_houses', {
      target_manager_id: invited.user.id,
      target_house_ids: houseIds,
    });
    if (assignmentError) {
      console.error('Unable to assign properties to invited manager:', assignmentError.message);
      await serviceClient.auth.admin.deleteUser(invited.user.id);
      return jsonResponse(500, { error: 'Could not assign properties; the staff invitation was canceled.' });
    }
  }

  return jsonResponse(201, { id: profile.id, staffId: profile.staff_id });
});
