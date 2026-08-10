export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          entity: string
          entity_id: string | null
          id: number
          occurred_at: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          entity: string
          entity_id?: string | null
          id?: number
          occurred_at?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          entity?: string
          entity_id?: string | null
          id?: number
          occurred_at?: string
        }
        Relationships: []
      }
      client_invites: {
        Row: {
          accepted_at: string | null
          client_id: string
          coach_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          revoked_at: string | null
          token: string | null
          token_hash: string | null
        }
        Insert: {
          accepted_at?: string | null
          client_id: string
          coach_id: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          revoked_at?: string | null
          token?: string | null
          token_hash?: string | null
        }
        Update: {
          accepted_at?: string | null
          client_id?: string
          coach_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          token?: string | null
          token_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_invites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invites_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          coach_id: string
          condition: string | null
          created_at: string
          date_of_birth: string | null
          email: string
          first_name_hint: string | null
          goal: string | null
          height_cm: number | null
          id: string
          last_name_hint: string | null
          profile_id: string | null
          sex: string | null
          started_on: string
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
        }
        Insert: {
          coach_id: string
          condition?: string | null
          created_at?: string
          date_of_birth?: string | null
          email: string
          first_name_hint?: string | null
          goal?: string | null
          height_cm?: number | null
          id?: string
          last_name_hint?: string | null
          profile_id?: string | null
          sex?: string | null
          started_on?: string
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Update: {
          coach_id?: string
          condition?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string
          first_name_hint?: string | null
          goal?: string | null
          height_cm?: number | null
          id?: string
          last_name_hint?: string | null
          profile_id?: string | null
          sex?: string | null
          started_on?: string
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coaches: {
        Row: {
          created_at: string
          id: string
          practice_name: string
        }
        Insert: {
          created_at?: string
          id: string
          practice_name: string
        }
        Update: {
          created_at?: string
          id?: string
          practice_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaches_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          client_id: string
          granted_at: string
          id: string
          policy_version: string
          revoked_at: string | null
          type: Database["public"]["Enums"]["consent_type"]
        }
        Insert: {
          client_id: string
          granted_at?: string
          id?: string
          policy_version: string
          revoked_at?: string | null
          type: Database["public"]["Enums"]["consent_type"]
        }
        Update: {
          client_id?: string
          granted_at?: string
          id?: string
          policy_version?: string
          revoked_at?: string | null
          type?: Database["public"]["Enums"]["consent_type"]
        }
        Relationships: [
          {
            foreignKeyName: "consents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          first_name: string
          id: string
          last_name: string
          locale: string
          role: Database["public"]["Enums"]["user_role"]
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          first_name: string
          id: string
          last_name: string
          locale?: string
          role: Database["public"]["Enums"]["user_role"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          first_name?: string
          id?: string
          last_name?: string
          locale?: string
          role?: Database["public"]["Enums"]["user_role"]
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_my_invite: { Args: never; Returns: string }
      create_client_invite: {
        Args: {
          p_condition?: string
          p_email: string
          p_first_name: string
          p_goal?: string
          p_last_name: string
        }
        Returns: {
          client_id: string
          invite_id: string
          token: string
        }[]
      }
      delete_my_account: { Args: never; Returns: undefined }
      has_health_consent: { Args: { p_client: string }; Returns: boolean }
      is_coach_of: { Args: { target_client: string }; Returns: boolean }
      is_the_client: { Args: { target_client: string }; Returns: boolean }
      record_consent: {
        Args: {
          p_types: Database["public"]["Enums"]["consent_type"][]
          p_version: string
        }
        Returns: undefined
      }
    }
    Enums: {
      client_status: "invited" | "active" | "paused" | "archived"
      consent_type: "tos" | "privacy" | "health_data_processing"
      user_role: "coach" | "client"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      client_status: ["invited", "active", "paused", "archived"],
      consent_type: ["tos", "privacy", "health_data_processing"],
      user_role: ["coach", "client"],
    },
  },
} as const

