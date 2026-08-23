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
      assignments: {
        Row: {
          client_id: string
          coach_id: string
          created_at: string
          id: string
          program_id: string
          start_date: string
          status: string
        }
        Insert: {
          client_id: string
          coach_id: string
          created_at?: string
          id?: string
          program_id: string
          start_date: string
          status?: string
        }
        Update: {
          client_id?: string
          coach_id?: string
          created_at?: string
          id?: string
          program_id?: string
          start_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
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
          breastfeeding: boolean
          coach_id: string
          condition: string | null
          created_at: string
          date_of_birth: string | null
          delivery_type: Database["public"]["Enums"]["delivery_type"]
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
          weeks_postpartum: number | null
        }
        Insert: {
          breastfeeding?: boolean
          coach_id: string
          condition?: string | null
          created_at?: string
          date_of_birth?: string | null
          delivery_type?: Database["public"]["Enums"]["delivery_type"]
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
          weeks_postpartum?: number | null
        }
        Update: {
          breastfeeding?: boolean
          coach_id?: string
          condition?: string | null
          created_at?: string
          date_of_birth?: string | null
          delivery_type?: Database["public"]["Enums"]["delivery_type"]
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
          weeks_postpartum?: number | null
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
      daily_reads: {
        Row: {
          client_id: string
          created_at: string
          id: string
          read_on: string
          read_window: Database["public"]["Enums"]["read_window"]
          readiness: number
          symptom: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          read_on: string
          read_window: Database["public"]["Enums"]["read_window"]
          readiness: number
          symptom?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          read_on?: string
          read_window?: Database["public"]["Enums"]["read_window"]
          readiness?: number
          symptom?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_reads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          archived_at: string | null
          category: Database["public"]["Enums"]["exercise_category"]
          coach_id: string | null
          created_at: string
          cues: string[]
          equipment: string
          id: string
          muscle_groups: string[]
          name: string
          notes: string | null
          updated_at: string
          video_path: string | null
        }
        Insert: {
          archived_at?: string | null
          category?: Database["public"]["Enums"]["exercise_category"]
          coach_id?: string | null
          created_at?: string
          cues?: string[]
          equipment?: string
          id?: string
          muscle_groups?: string[]
          name: string
          notes?: string | null
          updated_at?: string
          video_path?: string | null
        }
        Update: {
          archived_at?: string | null
          category?: Database["public"]["Enums"]["exercise_category"]
          coach_id?: string | null
          created_at?: string
          cues?: string[]
          equipment?: string
          id?: string
          muscle_groups?: string[]
          name?: string
          notes?: string | null
          updated_at?: string
          video_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercises_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      food_logs: {
        Row: {
          carbs_g: number
          client_id: string
          created_at: string
          description: string
          fat_g: number
          food_id: string | null
          id: string
          kcal: number
          logged_on: string
          meal: Database["public"]["Enums"]["meal_slot"]
          protein_g: number
          quantity_g: number | null
          source: Database["public"]["Enums"]["food_log_source"]
        }
        Insert: {
          carbs_g?: number
          client_id: string
          created_at?: string
          description: string
          fat_g?: number
          food_id?: string | null
          id?: string
          kcal: number
          logged_on: string
          meal: Database["public"]["Enums"]["meal_slot"]
          protein_g?: number
          quantity_g?: number | null
          source: Database["public"]["Enums"]["food_log_source"]
        }
        Update: {
          carbs_g?: number
          client_id?: string
          created_at?: string
          description?: string
          fat_g?: number
          food_id?: string | null
          id?: string
          kcal?: number
          logged_on?: string
          meal?: Database["public"]["Enums"]["meal_slot"]
          protein_g?: number
          quantity_g?: number | null
          source?: Database["public"]["Enums"]["food_log_source"]
        }
        Relationships: [
          {
            foreignKeyName: "food_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_logs_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
        ]
      }
      foods: {
        Row: {
          barcode: string | null
          brand: string | null
          carbs_100g: number
          coach_id: string | null
          created_at: string
          fat_100g: number
          id: string
          kcal_100g: number
          name: string
          protein_100g: number
          serving_g: number | null
          serving_name: string | null
          source: Database["public"]["Enums"]["food_source"]
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          carbs_100g?: number
          coach_id?: string | null
          created_at?: string
          fat_100g?: number
          id?: string
          kcal_100g: number
          name: string
          protein_100g?: number
          serving_g?: number | null
          serving_name?: string | null
          source: Database["public"]["Enums"]["food_source"]
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          carbs_100g?: number
          coach_id?: string | null
          created_at?: string
          fat_100g?: number
          id?: string
          kcal_100g?: number
          name?: string
          protein_100g?: number
          serving_g?: number | null
          serving_name?: string | null
          source?: Database["public"]["Enums"]["food_source"]
        }
        Relationships: [
          {
            foreignKeyName: "foods_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          client_id: string
          created_at: string
          id: string
          read_at: string | null
          sender: Database["public"]["Enums"]["user_role"]
          session_id: string | null
        }
        Insert: {
          body: string
          client_id: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender: Database["public"]["Enums"]["user_role"]
          session_id?: string | null
        }
        Update: {
          body?: string
          client_id?: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender?: Database["public"]["Enums"]["user_role"]
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      metrics: {
        Row: {
          client_id: string
          created_at: string
          external_id: string | null
          id: string
          recorded_at: string
          source: Database["public"]["Enums"]["metric_source"]
          type: Database["public"]["Enums"]["metric_type"]
          value: number
        }
        Insert: {
          client_id: string
          created_at?: string
          external_id?: string | null
          id?: string
          recorded_at: string
          source?: Database["public"]["Enums"]["metric_source"]
          type: Database["public"]["Enums"]["metric_type"]
          value: number
        }
        Update: {
          client_id?: string
          created_at?: string
          external_id?: string | null
          id?: string
          recorded_at?: string
          source?: Database["public"]["Enums"]["metric_source"]
          type?: Database["public"]["Enums"]["metric_type"]
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_targets: {
        Row: {
          carbs_g: number
          client_id: string
          coach_id: string
          created_at: string
          effective_from: string
          fat_g: number
          id: string
          kcal: number
          note: string | null
          protein_g: number
        }
        Insert: {
          carbs_g: number
          client_id: string
          coach_id: string
          created_at?: string
          effective_from: string
          fat_g: number
          id?: string
          kcal: number
          note?: string | null
          protein_g: number
        }
        Update: {
          carbs_g?: number
          client_id?: string
          coach_id?: string
          created_at?: string
          effective_from?: string
          fat_g?: number
          id?: string
          kcal?: number
          note?: string | null
          protein_g?: number
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_targets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_targets_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
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
      program_days: {
        Row: {
          day_no: number
          discipline: string
          id: string
          notes: string | null
          program_id: string
          title: string
          week_no: number
        }
        Insert: {
          day_no: number
          discipline?: string
          id?: string
          notes?: string | null
          program_id: string
          title: string
          week_no: number
        }
        Update: {
          day_no?: number
          discipline?: string
          id?: string
          notes?: string | null
          program_id?: string
          title?: string
          week_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "program_days_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_items: {
        Row: {
          block: string
          exercise_id: string
          id: string
          notes: string | null
          order_index: number
          program_day_id: string
          reps: string
          rest_sec: number
          sets: number
          target_load_kg: number | null
          target_rpe: number | null
          tempo: string | null
        }
        Insert: {
          block?: string
          exercise_id: string
          id?: string
          notes?: string | null
          order_index?: number
          program_day_id: string
          reps?: string
          rest_sec?: number
          sets?: number
          target_load_kg?: number | null
          target_rpe?: number | null
          tempo?: string | null
        }
        Update: {
          block?: string
          exercise_id?: string
          id?: string
          notes?: string | null
          order_index?: number
          program_day_id?: string
          reps?: string
          rest_sec?: number
          sets?: number
          target_load_kg?: number | null
          target_rpe?: number | null
          tempo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "program_items_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_items_program_day_id_fkey"
            columns: ["program_day_id"]
            isOneToOne: false
            referencedRelation: "program_days"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          archived_at: string | null
          coach_id: string
          created_at: string
          description: string | null
          duration_weeks: number
          id: string
          is_template: boolean
          name: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          coach_id: string
          created_at?: string
          description?: string | null
          duration_weeks?: number
          id?: string
          is_template?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          coach_id?: string
          created_at?: string
          description?: string | null
          duration_weeks?: number
          id?: string
          is_template?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          assignment_id: string | null
          client_id: string
          client_notes: string | null
          coach_feedback: string | null
          completed_at: string | null
          created_at: string
          discipline: string
          duration_sec: number | null
          id: string
          pain_after: number | null
          pain_before: number | null
          program_day_id: string | null
          scheduled_date: string
          session_rpe: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["session_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assignment_id?: string | null
          client_id: string
          client_notes?: string | null
          coach_feedback?: string | null
          completed_at?: string | null
          created_at?: string
          discipline?: string
          duration_sec?: number | null
          id?: string
          pain_after?: number | null
          pain_before?: number | null
          program_day_id?: string | null
          scheduled_date: string
          session_rpe?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string | null
          client_id?: string
          client_notes?: string | null
          coach_feedback?: string | null
          completed_at?: string | null
          created_at?: string
          discipline?: string
          duration_sec?: number | null
          id?: string
          pain_after?: number | null
          pain_before?: number | null
          program_day_id?: string | null
          scheduled_date?: string
          session_rpe?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_program_day_id_fkey"
            columns: ["program_day_id"]
            isOneToOne: false
            referencedRelation: "program_days"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_my_invite: { Args: never; Returns: string }
      assign_program: {
        Args: {
          p_client_id: string
          p_program_id: string
          p_start_date: string
        }
        Returns: string
      }
      create_client_invite: {
        Args: {
          p_breastfeeding?: boolean
          p_condition?: string
          p_delivery_type?: Database["public"]["Enums"]["delivery_type"]
          p_email: string
          p_first_name: string
          p_goal?: string
          p_last_name: string
          p_weeks_postpartum?: number
        }
        Returns: {
          client_id: string
          invite_id: string
          token: string
        }[]
      }
      delete_my_account: { Args: never; Returns: undefined }
      get_session_plan: {
        Args: { p_session_id: string }
        Returns: {
          block: string
          cues: string[]
          exercise_id: string
          exercise_name: string
          item_id: string
          notes: string
          reps: string
          rest_sec: number
          sets: number
          target_load_kg: number
          target_rpe: number
          tempo: string
        }[]
      }
      has_health_consent: { Args: { p_client: string }; Returns: boolean }
      import_health_metrics: { Args: { p_samples: Json }; Returns: number }
      is_coach_of: { Args: { target_client: string }; Returns: boolean }
      is_the_client: { Args: { target_client: string }; Returns: boolean }
      nutrition_days: {
        Args: { p_client: string; p_from: string; p_to: string }
        Returns: {
          carbs_g: number
          day: string
          entries: number
          fat_g: number
          kcal: number
          protein_g: number
          target_kcal: number
          target_protein_g: number
        }[]
      }
      nutrition_target_on: {
        Args: { p_client: string; p_on: string }
        Returns: {
          carbs_g: number
          client_id: string
          coach_id: string
          created_at: string
          effective_from: string
          fat_g: number
          id: string
          kcal: number
          note: string | null
          protein_g: number
        }
        SetofOptions: {
          from: "*"
          to: "nutrition_targets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
      delivery_type:
        | "vaginal"
        | "assisted_vaginal"
        | "caesarean"
        | "not_applicable"
      exercise_category:
        | "pelvic_floor"
        | "strength"
        | "plyometric"
        | "running"
        | "mobility"
      food_log_source: "barcode" | "search" | "custom" | "quick"
      food_source: "off" | "custom"
      meal_slot: "breakfast" | "lunch" | "dinner" | "snack"
      metric_source: "manual" | "healthkit" | "coach"
      metric_type:
        | "weight_kg"
        | "body_fat_pct"
        | "waist_cm"
        | "resting_hr"
        | "hrv_ms"
        | "bp_systolic"
        | "bp_diastolic"
        | "spo2_pct"
        | "sleep_min"
        | "steps"
        | "vo2max"
      read_window: "morning" | "midday" | "evening"
      session_status: "scheduled" | "in_progress" | "completed" | "skipped"
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
      delivery_type: [
        "vaginal",
        "assisted_vaginal",
        "caesarean",
        "not_applicable",
      ],
      exercise_category: [
        "pelvic_floor",
        "strength",
        "plyometric",
        "running",
        "mobility",
      ],
      food_log_source: ["barcode", "search", "custom", "quick"],
      food_source: ["off", "custom"],
      meal_slot: ["breakfast", "lunch", "dinner", "snack"],
      metric_source: ["manual", "healthkit", "coach"],
      metric_type: [
        "weight_kg",
        "body_fat_pct",
        "waist_cm",
        "resting_hr",
        "hrv_ms",
        "bp_systolic",
        "bp_diastolic",
        "spo2_pct",
        "sleep_min",
        "steps",
        "vo2max",
      ],
      read_window: ["morning", "midday", "evening"],
      session_status: ["scheduled", "in_progress", "completed", "skipped"],
      user_role: ["coach", "client"],
    },
  },
} as const

