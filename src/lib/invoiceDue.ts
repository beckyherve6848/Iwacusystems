export interface InvoiceDueTenant {
  id: string;
  house_id?: string | null;
  move_in_date?: string | null;
  move_out_date?: string | null;
}

export interface InvoiceDueLease {
  tenant_id: string;
  lease_start_date: string;
  lease_end_date: string | null;
}

export interface IssuedInvoiceMonth {
  tenant_id: string;
  rent_month: string;
}

export function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthlyAnniversary(startDate: string, year: number, monthIndex: number) {
  const startDay = Number(startDate.slice(8, 10));
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(Math.min(startDay, lastDay)).padStart(2, '0')}`;
}

export function getTenantsDueForInvoice<T extends InvoiceDueTenant>(
  tenants: T[],
  invoices: IssuedInvoiceMonth[],
  activeLeases: InvoiceDueLease[],
  today: Date,
) {
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const todayString = localDateString(today);
  const invoicedTenantIds = new Set(
    invoices
      .filter(invoice => invoice.rent_month.slice(0, 7) === currentMonth)
      .map(invoice => invoice.tenant_id),
  );

  return tenants.flatMap(tenant => {
    if (!tenant.house_id || invoicedTenantIds.has(tenant.id)) return [];
    const lease = activeLeases
      .filter(item => item.tenant_id === tenant.id)
      .sort((a, b) => b.lease_start_date.localeCompare(a.lease_start_date))[0];
    const startDate = tenant.move_in_date ?? lease?.lease_start_date;
    if (!startDate || startDate.slice(0, 7) > currentMonth) return [];
    const dueDate = monthlyAnniversary(startDate, today.getFullYear(), today.getMonth());
    const endDate = lease?.lease_end_date ?? tenant.move_out_date;
    if (dueDate > todayString || (endDate && endDate < dueDate)) return [];
    return [{ tenant, dueDate }];
  });
}
