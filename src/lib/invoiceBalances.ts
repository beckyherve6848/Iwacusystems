type InvoiceBalanceRow = {
  tenant_id: string;
  rent_month: string;
  rent_balance: number | string;
  water_amount: number | string;
  electricity_amount: number | string;
};

type UtilityPaymentRow = {
  tenant_id: string;
  rent_month: string;
  water_paid_amount: number | string | null;
  electricity_paid_amount: number | string | null;
};

function monthKey(tenantId: string, rentMonth: string) {
  return `${tenantId}:${rentMonth.slice(0, 7)}`;
}

export function calculateOutstandingInvoiceBalance(
  invoices: (InvoiceBalanceRow & { id: string })[],
  payments: UtilityPaymentRow[],
) {
  const balances = calculateInvoiceChargeBalances(invoices, payments);
  return [...balances.values()].reduce((total, balance) => total + balance.total_balance_due, 0);
}

export function calculateInvoiceChargeBalances(
  invoices: (InvoiceBalanceRow & { id: string })[],
  payments: UtilityPaymentRow[],
) {
  const utilityPayments = new Map<string, { water: number; electricity: number }>();
  for (const payment of payments) {
    const key = monthKey(payment.tenant_id, payment.rent_month);
    const paid = utilityPayments.get(key) ?? { water: 0, electricity: 0 };
    paid.water += Number(payment.water_paid_amount ?? 0);
    paid.electricity += Number(payment.electricity_paid_amount ?? 0);
    utilityPayments.set(key, paid);
  }

  return new Map(invoices.map(invoice => {
    const paid = utilityPayments.get(monthKey(invoice.tenant_id, invoice.rent_month)) ?? { water: 0, electricity: 0 };
    const water_balance = Math.max(0, Number(invoice.water_amount) - paid.water);
    const electricity_balance = Math.max(0, Number(invoice.electricity_amount) - paid.electricity);
    const rent_balance = Math.max(0, Number(invoice.rent_balance));
    return [invoice.id, {
      water_balance,
      electricity_balance,
      total_balance_due: rent_balance + water_balance + electricity_balance,
    }];
  }));
}

export function calculateMonthlyInvoiceBalances(
  invoices: (InvoiceBalanceRow & { id: string })[],
  payments: UtilityPaymentRow[],
) {
  const balancesById = calculateInvoiceChargeBalances(invoices, payments);
  return new Map(invoices.flatMap(invoice => {
    const balance = balancesById.get(invoice.id);
    return balance ? [[monthKey(invoice.tenant_id, invoice.rent_month), {
      ...balance,
      rent_balance: Math.max(0, Number(invoice.rent_balance)),
      rent_credit: Math.max(0, -Number(invoice.rent_balance)),
    }] as const] : [];
  }));
}
