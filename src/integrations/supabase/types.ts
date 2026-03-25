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
      leads: {
        Row: {
          bairro: string | null
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
          email1: string | null
          email2: string | null
          estagio_funil: string | null
          fantasia: string | null
          faz_anuncios: boolean
          id: string
          instagram_ativo: boolean
          logradouro: string | null
          numero: string | null
          observacoes_closer: string | null
          observacoes_sdr: string | null
          possui_site: boolean
          razao_social: string | null
          situacao: string | null
          socios: Json | null
          status_sdr: string
          telefone1: string | null
          telefone2: string | null
          uf: string | null
          url_instagram: string | null
          url_site: string | null
          valor_negocio_estimado: number | null
          whatsapp_automacao: boolean
        }
        Insert: {
          bairro?: string | null
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
          email1?: string | null
          email2?: string | null
          estagio_funil?: string | null
          fantasia?: string | null
          faz_anuncios?: boolean
          id?: string
          instagram_ativo?: boolean
          logradouro?: string | null
          numero?: string | null
          observacoes_closer?: string | null
          observacoes_sdr?: string | null
          possui_site?: boolean
          razao_social?: string | null
          situacao?: string | null
          socios?: Json | null
          status_sdr?: string
          telefone1?: string | null
          telefone2?: string | null
          uf?: string | null
          url_instagram?: string | null
          url_site?: string | null
          valor_negocio_estimado?: number | null
          whatsapp_automacao?: boolean
        }
        Update: {
          bairro?: string | null
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
          email1?: string | null
          email2?: string | null
          estagio_funil?: string | null
          fantasia?: string | null
          faz_anuncios?: boolean
          id?: string
          instagram_ativo?: boolean
          logradouro?: string | null
          numero?: string | null
          observacoes_closer?: string | null
          observacoes_sdr?: string | null
          possui_site?: boolean
          razao_social?: string | null
          situacao?: string | null
          socios?: Json | null
          status_sdr?: string
          telefone1?: string | null
          telefone2?: string | null
          uf?: string | null
          url_instagram?: string | null
          url_site?: string | null
          valor_negocio_estimado?: number | null
          whatsapp_automacao?: boolean
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
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
