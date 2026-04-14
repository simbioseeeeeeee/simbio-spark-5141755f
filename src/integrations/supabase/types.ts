export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

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
          created_at: string
          id: string
          lead_id: string
          nota: string | null
          owner_id: string | null
          resultado: string
          sdr_id: string | null
          tipo_atividade: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          nota?: string | null
          owner_id?: string | null
          resultado: string
          sdr_id?: string | null
          tipo_atividade: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          nota?: string | null
          owner_id?: string | null
          resultado?: string
          sdr_id?: string | null
          tipo_atividade?: string
        }
        Relationships: [
          {
            foreignKeyName: "atividades_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
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
        Row: {
          bairro: string | null
          canal_preferido: string
          celular1: string | null
          celular2: string | null
          cep: string | null
          cidade: string | null
          cnae_descricao: string | null
          cnpj: string | null
          complemento: string | null
          created_at: string
          data_abertura: string | null
          data_proximo_passo: string | null
          dia_cadencia: number
          email1: string | null
          email2: string | null
          estagio_funil: string | null
          fantasia: string | null
          faz_anuncios: boolean
          id: string
          instagram_ativo: boolean
          lead_score: number | null
          logradouro: string | null
          numero: string | null
          observacoes_closer: string | null
          observacoes_sdr: string | null
          owner_id: string | null
          pesquisa_realizada: boolean
          possui_site: boolean
          razao_social: string | null
          sdr_id: string | null
          situacao: string | null
          socios: Json | null
          status_cadencia: string
          status_sdr: string
          telefone1: string | null
          telefone2: string | null
          uf: string | null
          url_instagram: string | null
          url_site: string | null
          valor_negocio_estimado: number | null
          whatsapp_automacao: boolean
          whatsapp_humano: boolean
        }
        Insert: {
          bairro?: string | null
          canal_preferido?: string
          celular1?: string | null
          celular2?: string | null
          cep?: string | null
          cidade?: string | null
          cnae_descricao?: string | null
          cnpj?: string | null
          complemento?: string | null
          created_at?: string
          data_abertura?: string | null
          data_proximo_passo?: string | null
          dia_cadencia?: number
          email1?: string | null
          email2?: string | null
          estagio_funil?: string | null
          fantasia?: string | null
          faz_anuncios?: boolean
          id?: string
          instagram_ativo?: boolean
          lead_score?: number | null
          logradouro?: string | null
          numero?: string | null
          observacoes_closer?: string | null
          observacoes_sdr?: string | null
          owner_id?: string | null
          pesquisa_realizada?: boolean
          possui_site?: boolean
          razao_social?: string | null
          sdr_id?: string | null
          situacao?: string | null
          socios?: Json | null
          status_cadencia?: string
          status_sdr?: string
          telefone1?: string | null
          telefone2?: string | null
          uf?: string | null
          url_instagram?: string | null
          url_site?: string | null
          valor_negocio_estimado?: number | null
          whatsapp_automacao?: boolean
          whatsapp_humano?: boolean
        }
        Update: {
          bairro?: string | null
          canal_preferido?: string
          celular1?: string | null
          celular2?: string | null
          cep?: string | null
          cidade?: string | null
          cnae_descricao?: string | null
          cnpj?: string | null
          complemento?: string | null
          created_at?: string
          data_abertura?: string | null
          data_proximo_passo?: string | null
          dia_cadencia?: number
          email1?: string | null
          email2?: string | null
          estagio_funil?: string | null
          fantasia?: string | null
          faz_anuncios?: boolean
          id?: string
          instagram_ativo?: boolean
          lead_score?: number | null
          logradouro?: string | null
          numero?: string | null
          observacoes_closer?: string | null
          observacoes_sdr?: string | null
          owner_id?: string | null
          pesquisa_realizada?: boolean
          possui_site?: boolean
          razao_social?: string | null
          sdr_id?: string | null
          situacao?: string | null
          socios?: Json | null
          status_cadencia?: string
          status_sdr?: string
          telefone1?: string | null
          telefone2?: string | null
          uf?: string | null
          url_instagram?: string | null
          url_site?: string | null
          valor_negocio_estimado?: number | null
          whatsapp_automacao?: boolean
          whatsapp_humano?: boolean
        }
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
        Returns: {
          bairro: string | null
          canal_preferido: string
          celular1: string | null
          celular2: string | null
          cep: string | null
          cidade: string | null
          cnae_descricao: string | null
          cnpj: string | null
          complemento: string | null
          created_at: string
          data_abertura: string | null
          data_proximo_passo: string | null
          dia_cadencia: number
          email1: string | null
          email2: string | null
          estagio_funil: string | null
          fantasia: string | null
          faz_anuncios: boolean
          id: string
          instagram_ativo: boolean
          lead_score: number | null
          logradouro: string | null
          numero: string | null
          observacoes_closer: string | null
          observacoes_sdr: string | null
          owner_id: string | null
          pesquisa_realizada: boolean
          possui_site: boolean
          razao_social: string | null
          sdr_id: string | null
          situacao: string | null
          socios: Json | null
          status_cadencia: string
          status_sdr: string
          telefone1: string | null
          telefone2: string | null
          uf: string | null
          url_instagram: string | null
          url_site: string | null
          valor_negocio_estimado: number | null
          whatsapp_automacao: boolean
          whatsapp_humano: boolean
        }[]
        SetofOptions: {
          from: "*"
          to: "leads"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_cadencia_concluidas_hoje: {
        Args: { p_cidade?: string }
        Returns: {
          bairro: string | null
          canal_preferido: string
          celular1: string | null
          celular2: string | null
          cep: string | null
          cidade: string | null
          cnae_descricao: string | null
          cnpj: string | null
          complemento: string | null
          created_at: string
          data_abertura: string | null
          data_proximo_passo: string | null
          dia_cadencia: number
          email1: string | null
          email2: string | null
          estagio_funil: string | null
          fantasia: string | null
          faz_anuncios: boolean
          id: string
          instagram_ativo: boolean
          lead_score: number | null
          logradouro: string | null
          numero: string | null
          observacoes_closer: string | null
          observacoes_sdr: string | null
          owner_id: string | null
          pesquisa_realizada: boolean
          possui_site: boolean
          razao_social: string | null
          sdr_id: string | null
          situacao: string | null
          socios: Json | null
          status_cadencia: string
          status_sdr: string
          telefone1: string | null
          telefone2: string | null
          uf: string | null
          url_instagram: string | null
          url_site: string | null
          valor_negocio_estimado: number | null
          whatsapp_automacao: boolean
          whatsapp_humano: boolean
        }[]
        SetofOptions: {
          from: "*"
          to: "leads"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_cadencia_hoje: {
        Args: { p_cidade?: string }
        Returns: {
          bairro: string | null
          canal_preferido: string
          celular1: string | null
          celular2: string | null
          cep: string | null
          cidade: string | null
          cnae_descricao: string | null
          cnpj: string | null
          complemento: string | null
          created_at: string
          data_abertura: string | null
          data_proximo_passo: string | null
          dia_cadencia: number
          email1: string | null
          email2: string | null
          estagio_funil: string | null
          fantasia: string | null
          faz_anuncios: boolean
          id: string
          instagram_ativo: boolean
          lead_score: number | null
          logradouro: string | null
          numero: string | null
          observacoes_closer: string | null
          observacoes_sdr: string | null
          owner_id: string | null
          pesquisa_realizada: boolean
          possui_site: boolean
          razao_social: string | null
          sdr_id: string | null
          situacao: string | null
          socios: Json | null
          status_cadencia: string
          status_sdr: string
          telefone1: string | null
          telefone2: string | null
          uf: string | null
          url_instagram: string | null
          url_site: string | null
          valor_negocio_estimado: number | null
          whatsapp_automacao: boolean
          whatsapp_humano: boolean
        }[]
        SetofOptions: {
          from: "*"
          to: "leads"
          isOneToOne: false
          isSetofReturn: true
        }
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
          cidade: string
          created_at: string
          fantasia: string
          id: string
          razao_social: string
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
