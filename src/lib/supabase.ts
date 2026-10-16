import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type UserRole = 'admin' | 'gatekeeper' | 'tenant' | 'caretaker' | 'property_manager';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  photo_url?: string;
  staff_id?: string | null;
  national_id?: string | null;
  residential_address?: string | null;
  profile_photo_path?: string | null;
  identity_document_path?: string | null;
  signature_image_path?: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  assigned_property_id?: string | null;
  assigned_property_name?: string | null;
  assigned_property_group_id?: string | null;
}

export interface Property {
  id: string;
  name: string;
  address?: string | null;
}

export interface House {
  id: string;
  house_number: string;
  property_id?: string | null;
  properties?: Pick<Property, 'id' | 'name'> | null;
  block_wing?: string;
  floor?: string;
  category_id?: string;
  monthly_rent: number;
  security_deposit: number;
  description?: string;
  status: 'vacant' | 'occupied' | 'reserved' | 'maintenance';
  image_url?: string;
  created_at: string;
  house_categories?: { name: string };
}

export interface Tenant {
  id: string;
  user_id?: string;
  tenant_code: string;
  full_name: string;
  photo_url?: string;
  national_id?: string;
  national_id_document_path?: string | null;
  phone: string;
  email: string;
  gender?: string;
  house_id?: string;
  move_in_date?: string;
  move_out_date?: string;
  monthly_rent?: number;
  security_deposit?: number;
  num_family_members: number;
  car_make?: string;
  car_model?: string;
  car_registration?: string;
  car_color?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  status: 'active' | 'vacated' | 'blacklisted';
  notes?: string;
  created_at: string;
  houses?: { house_number: string; status: string };
}

export interface Payment {
  id: string;
  receipt_number: string;
  tenant_id: string;
  house_id: string;
  rent_month: string;
  payment_date: string;
  due_date: string;
  amount_due: number;
  amount_paid: number;
  rent_paid_amount: number;
  water_due_amount: number;
  electricity_due_amount: number;
  water_paid_amount: number;
  electricity_paid_amount: number;
  balance: number;
  late_fee: number;
  recorded_by_name?: string | null;
  recorded_by_phone?: string | null;
  payment_method?: string;
  payment_proof_url?: string;
  status: 'paid' | 'pending' | 'partial' | 'overdue';
  notes?: string;
  created_at: string;
  total_balance_due?: number;
  tenants?: { full_name: string; tenant_code: string };
  houses?: { house_number: string };
}

export interface UtilityInvoice {
  id: string;
  invoice_number: string;
  tenant_id: string;
  house_id: string;
  rent_month: string;
  rent_amount: number;
  water_amount: number;
  electricity_amount: number;
  rent_paid_amount: number;
  rent_balance: number;
  rent_credit: number;
  water_balance?: number;
  electricity_balance?: number;
  total_balance_due?: number;
  total_amount: number;
  due_date: string;
  status: 'unpaid' | 'partial' | 'paid';
  notes?: string | null;
  created_at: string;
  tenants?: {
    id?: string;
    full_name: string;
    tenant_code: string;
    user_id?: string | null;
    houses?: { house_number: string } | null;
  };
  houses?: { house_number: string };
}

export interface MaintenanceRequest {
  id: string;
  tenant_id: string;
  house_id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  image_url?: string;
  status: 'pending' | 'approved' | 'in_progress' | 'completed' | 'rejected';
  assigned_to?: string;
  admin_notes?: string;
  created_at: string;
  tenants?: { full_name: string; tenant_code: string };
  houses?: { house_number: string };
}

export interface Visitor {
  id: string;
  visitor_name: string;
  phone?: string;
  national_id?: string;
  house_id?: string;
  tenant_id?: string;
  purpose: string;
  vehicle_registration?: string;
  time_in: string;
  time_out?: string;
  status: 'inside' | 'left';
  registered_by?: string;
  created_at: string;
  number_of_visitors?: number;
  expected_departure?: string;
  notes?: string;
  visit_date?: string;
  houses?: { house_number: string };
  tenants?: { full_name: string };
}

export interface Notification {
  id: string;
  user_id: string;
  invoice_id?: string | null;
  maintenance_request_id?: string | null;
  sender_id?: string | null;
  announcement_id?: string | null;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  is_read: boolean;
  link?: string;
  created_at: string;
}

export interface RentalAgreement {
  id: string;
  agreement_number: string;
  tenant_id: string;
  house_id: string;
  lease_start_date: string;
  lease_end_date?: string;
  monthly_rent: number;
  security_deposit: number;
  terms_and_conditions?: string;
  landlord_signature?: string;
  tenant_signature?: string;
  status: 'active' | 'expired' | 'terminated';
  created_at: string;
  tenants?: { full_name: string; tenant_code: string };
  houses?: { house_number: string };
}
