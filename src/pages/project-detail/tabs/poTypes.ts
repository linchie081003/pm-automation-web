export type PoServiceItem = {
  id: string;
  name: string;
  qty: number;
  uom: string;
  target_delivery: string;
  warranty: string;
  unit_price: number;
};

export type PoPaymentTerm = { label: string; percent_pct: string; due_date: string };

export type PoForm = {
  po_no: string;
  po_name: string;
  buyer_name: string;
  contract_number: string;
  quotation_reference: string;
  po_due_date: string;
  po_payment_terms: PoPaymentTerm[];
  service_items: PoServiceItem[];
  po_sub_total: number | null;
};
