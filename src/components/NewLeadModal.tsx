import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  onCreated?: () => void;
}

// 25/08: CNPJ deixou de ser obrigatório — lead atendido no WhatsApp não tem CNPJ à mão.
// Sem CNPJ, a RPC gera o código pela origem (WA-/IG-/IND-/CIMI-/MAN- + telefone) e
// exige telefone. Com CNPJ, continua igual.
const ORIGENS: { value: string; label: string }[] = [
  { value: "whatsapp_uchat", label: "WhatsApp (chegou pela Larissa / número comercial)" },
  { value: "instagram_manual", label: "Instagram (DM)" },
  { value: "indicacao", label: "Indicação" },
  { value: "evento_cimi360", label: "Evento (CIMI 360)" },
  { value: "live_simbiose", label: "Live" },
  { value: "outros", label: "Outros" },
];

export function NewLeadModal({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    origem: "whatsapp_uchat",
    cnpj: "",
    razao_social: "",
    fantasia: "",
    contato_nome: "",
    cidade: "",
    uf: "",
    celular1: "",
    email1: "",
    observacoes_sdr: "",
  });

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    const cnpj = form.cnpj.replace(/\D/g, "");
    const fone = form.celular1.replace(/\D/g, "");
    if (cnpj && cnpj.length !== 14) {
      toast({ title: "CNPJ inválido", description: "Se informar CNPJ, ele precisa ter 14 dígitos — ou deixe em branco.", variant: "destructive" });
      return;
    }
    if (!cnpj && fone.length < 10) {
      toast({ title: "Campo obrigatório", description: "Sem CNPJ, informe o telefone com DDD (é ele que identifica o lead).", variant: "destructive" });
      return;
    }
    const nomeEmpresa = form.razao_social.trim() || form.fantasia.trim() || form.contato_nome.trim();
    if (!nomeEmpresa) {
      toast({ title: "Campo obrigatório", description: "Informe a empresa ou, pelo menos, o nome da pessoa.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("crm_create_manual_lead", {
        p_cnpj: cnpj,  // string vazia = sem CNPJ (undefined faria o PostgREST não achar a função)
        p_razao_social: nomeEmpresa,
        p_fantasia: form.fantasia.trim() || undefined,
        p_contato_nome: form.contato_nome.trim() || undefined,
        p_cidade: form.cidade.trim() || undefined,
        p_uf: form.uf.trim() || undefined,
        p_celular: fone || undefined,
        p_email: form.email1.trim() || undefined,
        p_origem: form.origem,
        p_observacoes: form.observacoes_sdr.trim() || undefined,
      });
      if (error) throw error;

      const codigo = (data as { cnpj?: string } | null)?.cnpj;
      toast({ title: "✅ Lead cadastrado!", description: `${nomeEmpresa} adicionado${codigo ? ` (${codigo})` : ""}.` });
      setForm({
        origem: "whatsapp_uchat", cnpj: "", razao_social: "", fantasia: "", contato_nome: "", cidade: "", uf: "",
        celular1: "", email1: "", observacoes_sdr: "",
      });
      setOpen(false);
      onCreated?.();
    } catch (err: unknown) {
      toast({
        title: "Erro ao cadastrar",
        description: err instanceof Error ? err.message : "Não foi possível cadastrar o lead.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-1.5">
          <UserPlus className="h-4 w-4" />
          Novo lead
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Cadastrar novo lead</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="origem">Como chegou <span className="text-destructive">*</span></Label>
            <Select value={form.origem} onValueChange={(v) => update("origem", v)}>
              <SelectTrigger id="origem"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ORIGENS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="celular1">Telefone / WhatsApp <span className="text-destructive">*</span></Label>
            <Input id="celular1" placeholder="(11) 99999-9999" value={form.celular1} onChange={(e) => update("celular1", e.target.value)} />
            <p className="text-xs text-muted-foreground">Sem CNPJ, é o telefone que identifica o lead. Se já existir ficha com esse número, o sistema avisa.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contato_nome">Pessoa de contato</Label>
            <Input id="contato_nome" placeholder="Nome de quem falou com a gente" value={form.contato_nome} onChange={(e) => update("contato_nome", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="razao_social">Empresa / imobiliária</Label>
            <Input id="razao_social" placeholder="Nome da empresa (ou deixe em branco se ainda não souber)" value={form.razao_social} onChange={(e) => update("razao_social", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fantasia">Nome fantasia</Label>
            <Input id="fantasia" placeholder="Como a empresa é conhecida" value={form.fantasia} onChange={(e) => update("fantasia", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cnpj">CNPJ <span className="text-xs font-normal text-muted-foreground">(opcional)</span></Label>
            <Input id="cnpj" placeholder="00.000.000/0001-00 — só se tiver" value={form.cnpj} onChange={(e) => update("cnpj", e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="cidade">Cidade</Label>
              <Input id="cidade" placeholder="Cidade" value={form.cidade} onChange={(e) => update("cidade", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="uf">UF</Label>
              <Input id="uf" placeholder="SP" maxLength={2} value={form.uf} onChange={(e) => update("uf", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email1">E-mail</Label>
            <Input id="email1" type="email" placeholder="email@empresa.com" value={form.email1} onChange={(e) => update("email1", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="observacoes_sdr">Contexto inicial</Label>
            <Textarea id="observacoes_sdr" rows={3} placeholder="Como chegou, interesse ou próximo passo..." value={form.observacoes_sdr} onChange={(e) => update("observacoes_sdr", e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
