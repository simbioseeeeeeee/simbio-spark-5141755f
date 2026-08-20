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
import { UserPlus, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  onCreated?: () => void;
}

export function NewLeadModal({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    cnpj: "",
    razao_social: "",
    fantasia: "",
    cidade: "",
    uf: "",
    celular1: "",
    email1: "",
  });

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    const cnpj = form.cnpj.replace(/\D/g, "");
    if (cnpj.length !== 14) {
      toast({ title: "Campo obrigatório", description: "Informe um CNPJ com 14 dígitos.", variant: "destructive" });
      return;
    }
    if (!form.razao_social.trim()) {
      toast({ title: "Campo obrigatório", description: "Razão Social é obrigatória.", variant: "destructive" });
      return;
    }

    const { data: existing } = await supabase
      .from("leads")
      .select("cnpj")
      .eq("cnpj", cnpj)
      .limit(1);
    if (existing && existing.length > 0) {
      toast({ title: "CNPJ já cadastrado", description: "Já existe um lead com esse CNPJ.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("leads").insert({
        cnpj,
        razao_social: form.razao_social.trim(),
        fantasia: form.fantasia.trim() || null,
        cidade: form.cidade.trim().toUpperCase() || null,
        uf: form.uf.trim().toUpperCase() || null,
        celular1: form.celular1.trim() || null,
        email1: form.email1.trim() || null,
        status_sdr: "A Contatar",
        status_cadencia: "ativo",
      });
      if (error) throw error;

      toast({ title: "✅ Lead cadastrado!", description: `${form.razao_social} adicionado com sucesso.` });
      setForm({ cnpj: "", razao_social: "", fantasia: "", cidade: "", uf: "", celular1: "", email1: "" });
      setOpen(false);
      onCreated?.();
    } catch (err: any) {
      toast({ title: "Erro ao cadastrar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-1.5">
          <UserPlus className="h-4 w-4" />
          Cadastrar Lead Manual
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Cadastrar Nova Empresa</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="cnpj">CNPJ <span className="text-destructive">*</span></Label>
            <Input id="cnpj" placeholder="00.000.000/0001-00" value={form.cnpj} onChange={(e) => update("cnpj", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="razao_social">Razão Social <span className="text-destructive">*</span></Label>
            <Input id="razao_social" placeholder="Nome da empresa" value={form.razao_social} onChange={(e) => update("razao_social", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fantasia">Nome Fantasia</Label>
            <Input id="fantasia" placeholder="Nome fantasia" value={form.fantasia} onChange={(e) => update("fantasia", e.target.value)} />
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
            <Label htmlFor="celular1">Telefone / Celular</Label>
            <Input id="celular1" placeholder="(11) 99999-9999" value={form.celular1} onChange={(e) => update("celular1", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email1">E-mail</Label>
            <Input id="email1" type="email" placeholder="email@empresa.com" value={form.email1} onChange={(e) => update("email1", e.target.value)} />
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
