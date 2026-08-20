import { supabase } from "@/integrations/supabase/client";
import {
  CATALOG_VERSION,
  PLAYBOOK_VERSION,
  type Commitment,
  type OfferId,
  type OfertaComercial,
} from "@/types/lead";

const API_BASE = "https://api.simbiosedigital.com";

export type CatalogAddon = {
  id: string;
  label: string;
  recurring_brl?: number;
  setup_brl: number;
  unit_brl?: number;
  eligible_offers: OfferId[];
};

export type CatalogOffer = {
  id: OfferId;
  label: OfertaComercial;
  audience: string;
  billing_type: "one_time" | "recurring";
  price_brl?: number;
  base_monthly_brl?: number;
  setup_brl?: number;
  implementation_business_days: number;
  commitment_options?: Exclude<Commitment, "unico">[];
  includes: string[];
  excludes: string[];
};

export type AddonSelection = { id: string; quantity: number };

export type CommercialQuote = {
  playbook_version: typeof PLAYBOOK_VERSION;
  catalog_version: typeof CATALOG_VERSION;
  offer_id: OfferId;
  offer_label: OfertaComercial;
  billing_type: "one_time" | "recurring";
  commitment: Commitment;
  commitment_months: number;
  base_monthly_brl: number;
  discount_percent: number;
  discounted_base_monthly_brl: number;
  addons: Array<{
    id: string;
    label: string;
    quantity: number;
    recurring_brl: number;
    setup_brl: number;
    unit_brl: number;
  }>;
  setup_brl: number;
  recurring_monthly_brl: number;
  unit_services_brl: number;
  due_at_signature_brl: number;
  due_at_go_live_brl: number;
  minimum_commitment_total_brl: number;
  implementation_business_days: number;
  includes: string[];
  excludes: string[];
};

export type CommercialCatalog = {
  playbookVersion: typeof PLAYBOOK_VERSION;
  catalogVersion: typeof CATALOG_VERSION;
  offers: CatalogOffer[];
  catalog: {
    addons: CatalogAddon[];
    commitment_discounts: Record<"mensal" | "trimestral" | "anual", number>;
    legacy_offers: Array<{ id: string; label: string; mode: "read_only" }>;
  };
};

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("sessão expirada — faça login de novo");
  return token;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.detail || body?.error || `HTTP ${response.status}`);
  return body as T;
}

export async function carregarCatalogoComercial(): Promise<CommercialCatalog> {
  const body = await api<CommercialCatalog & { ok: true }>("/api/comercial/catalogo");
  if (body.playbookVersion !== PLAYBOOK_VERSION || body.catalogVersion !== CATALOG_VERSION) {
    throw new Error("catálogo comercial incompatível com o CRM");
  }
  return body;
}

export async function calcularCotacaoComercial(
  leadCnpj: string,
  offerId: OfferId,
  commitment: Commitment,
  addons: AddonSelection[],
): Promise<{ quote_id: string; quote: CommercialQuote }> {
  const body = await api<{ ok: true; quote_id: string; quote: CommercialQuote }>(
    "/api/comercial/cotacao",
    {
      method: "POST",
      body: JSON.stringify({ lead_cnpj: leadCnpj, offer_id: offerId, commitment, addons }),
    },
  );
  if (body.quote.playbook_version !== PLAYBOOK_VERSION || body.quote.catalog_version !== CATALOG_VERSION) {
    throw new Error("cotação retornou versão incompatível");
  }
  return body;
}

export function formatBrl(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
