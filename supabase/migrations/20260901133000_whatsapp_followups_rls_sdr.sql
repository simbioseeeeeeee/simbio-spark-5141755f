-- 01/09/2026 — G1 do onboarding da Larissa: a fila crm_whatsapp_followups prevê
-- owner='larissa' desde 31/08, mas as policies eram manager-only — a SDR não via a
-- própria fila. Papel sdr passa a ler e atualizar APENAS as linhas owner='larissa'.
CREATE POLICY sdr_read_own_whatsapp_followups ON public.crm_whatsapp_followups
  FOR SELECT USING (has_role(auth.uid(), 'sdr'::app_role) AND owner = 'larissa');
CREATE POLICY sdr_update_own_whatsapp_followups ON public.crm_whatsapp_followups
  FOR UPDATE USING (has_role(auth.uid(), 'sdr'::app_role) AND owner = 'larissa')
  WITH CHECK (has_role(auth.uid(), 'sdr'::app_role) AND owner = 'larissa');
NOTIFY pgrst, 'reload schema';
