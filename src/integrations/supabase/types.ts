export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// Snapshot da tabela `leads` exposta pelo projeto Supabase em produção.
// A chave é `cnpj` (text); as colunas UUID `id`, `owner_id` e `sdr_id` nunca
// existiram nesse projeto. Manter esse contrato aqui evita que novas escritas
// aparentemente tipadas voltem a usar o schema do protótipo antigo.
export type LeadDatabaseRow = {
  bairro: string | null
  celular1: string | null
  celular2: string | null
  cep: string | null
  cidade: string | null
  cnae: string | null
  cnae_descricao: string | null
  cnae_grupo: string | null
  cnae_setor: string | null
  cnpj: string
  complemento: string | null
  contato_nome: string | null
  created_at: string
  data_abertura: string | null
  data_proximo_passo: string | null
  data_reuniao_agendada: string | null
  data_ultimo_contato: string | null
  decisor_confirmado: boolean
  email1: string | null
  email2: string | null
  estagio_funil: string | null
  execution_score: number | null
  fantasia: string | null
  faz_anuncios: boolean
  fit_score: number | null
  fit_score_breakdown: Json
  ganho_override_em: string | null
  ganho_override_motivo: string | null
  ganho_override_por: string | null
  ig_handle: string | null
  ig_seguidores: number | null
  instagram_ativo: boolean
  lead_score: number | null
  legacy_estagio_funil: string | null
  legacy_status_sdr: string | null
  logradouro: string | null
  lp_origem: string | null
  meeting_event_id: string | null
  motivo_perda: string | null
  motivo_perda_detalhe: string | null
  no_show_reagenda_tentativas: number
  numero: string | null
  observacoes_closer: string | null
  observacoes_sdr: string | null
  oferta_comercial: string | null
  origem_lead: string | null
  pagamento_em: string | null
  payment_status: string
  pesquisa_realizada: boolean
  pipeline_review_required: boolean
  playbook_version: string
  porte_equipe: string | null
  possui_site: boolean
  proposta_enviada_em: string | null
  qtde_funcionarios: number | null
  razao_social: string | null
  responsavel_closer: string | null
  responsavel_sdr: string | null
  reuniao_url: string | null
  setor_publico: boolean | null
  situacao: string | null
  stage_changed_at: string | null
  status_cadencia: string
  status_sdr: string
  telefone1: string | null
  telefone2: string | null
  tentativas_followup: number | null
  tipo_empresa: string | null
  tipo_lead: string | null
  tipo_logradouro: string | null
  uf: string | null
  updated_at: string | null
  url_instagram: string | null
  url_site: string | null
  whatsapp_automacao: boolean
  whatsapp_humano: boolean
  aceite_em: string | null
  [key: `socio${number}_${string}`]: string | null
}

export type LeadDatabaseInsert = Partial<LeadDatabaseRow> & { cnpj: string }

type ServerControlledLeadField =
  | "aceite_em"
  | "data_reuniao_agendada"
  | "decisor_confirmado"
  | "execution_score"
  | "fit_score"
  | "fit_score_breakdown"
  | "ganho_override_em"
  | "ganho_override_motivo"
  | "ganho_override_por"
  | "meeting_event_id"
  | "no_show_reagenda_tentativas"
  | "pagamento_em"
  | "payment_status"
  | "proposta_enviada_em"
  | "reuniao_url"
  | "stage_changed_at"

export type LeadDatabaseUpdate = Partial<Omit<LeadDatabaseRow, "cnpj" | ServerControlledLeadField>>

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      atividades: {
        Row: {
          call_id: string | null
          canal: string | null
          created_at: string
          created_by: string | null
          direcao: string | null
          duracao_segundos: number | null
          gravacao_url: string | null
          id: string
          lead_cnpj: string
          message_key: string | null
          metadados: Json
          nota: string | null
          origem: string | null
          playbook_version: string
          resultado: string | null
          status_vapi: string | null
          tipo_atividade: string
        }
        Insert: {
          call_id?: string | null
          canal?: string | null
          created_at?: string
          created_by?: string | null
          direcao?: string | null
          duracao_segundos?: number | null
          gravacao_url?: string | null
          id?: string
          lead_cnpj: string
          message_key?: string | null
          metadados?: Json
          nota?: string | null
          origem?: string | null
          playbook_version?: string
          resultado?: string | null
          status_vapi?: string | null
          tipo_atividade: string
        }
        Update: {
          call_id?: string | null
          canal?: string | null
          created_at?: string
          created_by?: string | null
          direcao?: string | null
          duracao_segundos?: number | null
          gravacao_url?: string | null
          id?: string
          lead_cnpj?: string
          message_key?: string | null
          metadados?: Json
          nota?: string | null
          origem?: string | null
          playbook_version?: string
          resultado?: string | null
          status_vapi?: string | null
          tipo_atividade?: string
        }
        Relationships: []
      }
      kpi_daily_snapshots: {
        Row: {
          atividades: number
          cidade: string | null
          created_at: string
          fechamentos: number
          id: string
          leads_qualificados: number
          reunioes: number
          snapshot_date: string
          valor_pipeline: number
        }
        Insert: {
          atividades?: number
          cidade?: string | null
          created_at?: string
          fechamentos?: number
          id?: string
          leads_qualificados?: number
          reunioes?: number
          snapshot_date?: string
          valor_pipeline?: number
        }
        Update: {
          atividades?: number
          cidade?: string | null
          created_at?: string
          fechamentos?: number
          id?: string
          leads_qualificados?: number
          reunioes?: number
          snapshot_date?: string
          valor_pipeline?: number
        }
        Relationships: []
      }
      leads: {
        Row: LeadDatabaseRow
        Insert: LeadDatabaseInsert
        Update: LeadDatabaseUpdate
        Relationships: []
      }
      manager_targets: {
        Row: {
          atividades: number
          created_at: string
          desq_limite: number
          fechamentos: number
          id: string
          leads: number
          pipeline: number
          reunioes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          atividades?: number
          created_at?: string
          desq_limite?: number
          fechamentos?: number
          id?: string
          leads?: number
          pipeline?: number
          reunioes?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          atividades?: number
          created_at?: string
          desq_limite?: number
          fechamentos?: number
          id?: string
          leads?: number
          pipeline?: number
          reunioes?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          nome: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      distinct_cidades: {
        Args: { p_uf?: string }
        Returns: {
          cidade: string
        }[]
      }
      distinct_ufs: {
        Args: never
        Returns: {
          uf: string
        }[]
      }
      get_activity_breakdown: {
        Args: { p_cidade?: string; p_days?: number }
        Returns: {
          tipo: string
          total: number
        }[]
      }
      get_activity_trend: {
        Args: { p_cidade?: string; p_days?: number }
        Returns: {
          dia: string
          total_atividades: number
          total_reunioes: number
        }[]
      }
      get_cadencia_amanha: {
        Args: { p_cidade?: string }
        Returns: LeadDatabaseRow[]
        SetofOptions: {
          from: "*"
          to: "leads"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_cadencia_concluidas_hoje: {
        Args: { p_cidade?: string }
        Returns: LeadDatabaseRow[]
        SetofOptions: {
          from: "*"
          to: "leads"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_cadencia_hoje: {
        Args: { p_cidade?: string }
        Returns: LeadDatabaseRow[]
        SetofOptions: {
          from: "*"
          to: "leads"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_call_kpis: {
        Args: { p_cidade?: string; p_days?: number }
        Returns: {
          duracao_media: number
          reunioes_via_ligacao: number
          taxa_atendimento: number
          total_ligacoes: number
        }[]
      }
      get_call_trend: {
        Args: { p_cidade?: string; p_days?: number }
        Returns: {
          atendidas: number
          dia: string
          nao_atendidas: number
          total: number
        }[]
      }
      get_calls_list:
        | {
            Args: {
              p_cidade?: string
              p_days?: number
              p_limit?: number
              p_resultado?: string
            }
            Returns: {
              atividade_id: string
              cidade: string
              created_at: string
              de_numero: string
              duracao_segundos: number
              fantasia: string
              lead_id: string
              nota: string
              para_numero: string
              razao_social: string
              resultado: string
              sentimento: string
              transcricao: string
              url_gravacao: string
            }[]
          }
        | {
            Args: {
              p_cidade?: string
              p_days?: number
              p_limit?: number
              p_resultado?: string
              p_sdr_id?: string
            }
            Returns: {
              atividade_id: string
              cidade: string
              created_at: string
              de_numero: string
              duracao_segundos: number
              fantasia: string
              lead_id: string
              nota: string
              para_numero: string
              razao_social: string
              resultado: string
              sdr_id: string
              sentimento: string
              transcricao: string
              url_gravacao: string
            }[]
          }
      get_conversion_funnel: {
        Args: { p_cidade?: string }
        Returns: {
          etapa: string
          total: number
        }[]
      }
      get_daily_metrics: {
        Args: { p_cidade?: string }
        Returns: {
          conexoes_hoje: number
          pesquisas_hoje: number
          reunioes_hoje: number
          tentativas_hoje: number
        }[]
      }
      get_disqualification_trend: {
        Args: { p_cidade?: string; p_days?: number }
        Returns: {
          desq_geral: number
          desq_sem_budget: number
          desq_sem_interesse: number
          desq_sem_perfil: number
          dia: string
          total_desq: number
        }[]
      }
      get_followups_kpis: {
        Args: { p_cidade?: string }
        Returns: {
          atrasados: number
          hoje: number
          proximos_3_dias: number
        }[]
      }
      get_followups_list: {
        Args: {
          p_cidade?: string
          p_estagio_funil?: string
          p_limit?: number
          p_responsavel_id?: string
          p_sort?: string
          p_status_sdr?: string
        }
        Returns: {
          celular1: string
          cidade: string
          data_proximo_passo: string
          email1: string
          estagio_funil: string
          fantasia: string
          id: string
          observacoes_closer: string
          observacoes_sdr: string
          owner_id: string
          razao_social: string
          sdr_id: string
          status_sdr: string
          telefone1: string
          uf: string
          ultimo_contato_em: string
          ultimo_contato_tipo: string
        }[]
      }
      get_kpi_alerts: {
        Args: {
          p_cidade?: string
          p_target_atividades?: number
          p_target_fechamentos?: number
          p_target_leads?: number
          p_target_pipeline?: number
          p_target_reunioes?: number
        }
        Returns: {
          consecutive_days: number
          current_value: number
          daily_target: number
          kpi_name: string
        }[]
      }
      get_lead_atividades: {
        Args: { p_lead_id: string; p_limit?: number }
        Returns: {
          created_at: string
          id: string
          nota: string
          resultado: string
          tipo_atividade: string
        }[]
      }
      get_leaderboard: {
        Args: { p_cidade?: string; p_days?: number }
        Returns: {
          nome: string
          role: string
          total_atividades: number
          total_reunioes: number
          user_id: string
        }[]
      }
      get_leads_last_contact: {
        Args: { p_lead_ids: string[] }
        Returns: {
          lead_id: string
          ultimo_contato_em: string
          ultimo_contato_tipo: string
        }[]
      }
      get_manager_analytics: {
        Args: { p_cidade?: string; p_days?: number }
        Returns: {
          desq_geral: number
          desq_sem_budget: number
          desq_sem_interesse: number
          desq_sem_perfil: number
          total_atividades: number
          total_desqualificados: number
          total_fechamentos: number
          total_leads_qualificados: number
          total_reunioes: number
          valor_pipeline: number
        }[]
      }
      get_pipeline_by_stage: {
        Args: { p_cidade?: string }
        Returns: {
          estagio: string
          total_leads: number
          valor_total: number
        }[]
      }
      get_reuniao_inconsistencies: {
        Args: { p_cidade?: string }
        Returns: {
          cidade: string | null
          cnpj: string
          created_at: string
          data_reuniao_agendada: string | null
          fantasia: string | null
          meeting_event_id: string | null
          razao_social: string | null
          reuniao_url: string | null
        }[]
      }
      get_sdr_performance: {
        Args: { p_cidade?: string; p_days?: number }
        Returns: {
          emails: number
          ligacoes: number
          nome: string
          pesquisas: number
          reunioes: number
          user_id: string
          whatsapps: number
        }[]
      }
      get_user_role: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      lead_has_reuniao_activity: {
        Args: { p_lead_id: string }
        Returns: boolean
      }
      snapshot_daily_kpis: { Args: { p_cidade?: string }; Returns: undefined }
    }
    Enums: {
      app_role: "sdr" | "closer" | "manager"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["sdr", "closer", "manager"],
    },
  },
} as const
