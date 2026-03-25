-- Update lead to "Reunião Agendada" as if SDR scheduled a meeting
UPDATE leads SET 
  status_sdr = 'Reunião Agendada',
  estagio_funil = 'Reunião Agendada',
  status_cadencia = 'concluido',
  dia_cadencia = 1,
  sdr_id = '8cdaa893-1034-4e75-92e9-768ac827e488',
  data_proximo_passo = now() + interval '2 days'
WHERE id = 'ac4dc957-a55d-43f8-8905-00078352b5f2';

-- Insert activity record
INSERT INTO atividades (lead_id, tipo_atividade, resultado, nota, sdr_id)
VALUES (
  'ac4dc957-a55d-43f8-8905-00078352b5f2',
  'Ligação',
  'Agendou Reunião',
  'Lead demonstrou interesse. Reunião agendada para próxima semana.',
  '8cdaa893-1034-4e75-92e9-768ac827e488'
);