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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          achievement_date: string | null
          company_id: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          title: string
          user_id: string
        }
        Insert: {
          achievement_date?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          title: string
          user_id: string
        }
        Update: {
          achievement_date?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "achievements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_scenarios: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string
          description: string | null
          file_url: string | null
          id: string
          is_active: boolean
          scenario_data: Json
          title: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean
          scenario_data?: Json
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean
          scenario_data?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_scenarios_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          assessment_data: Json | null
          assessment_type: string
          change_value: string | null
          company_id: string | null
          created_at: string
          id: string
          score: number | null
          user_id: string
        }
        Insert: {
          assessment_data?: Json | null
          assessment_type?: string
          change_value?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          score?: number | null
          user_id: string
        }
        Update: {
          assessment_data?: Json | null
          assessment_type?: string
          change_value?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          score?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      career_goals: {
        Row: {
          company_id: string | null
          created_at: string
          deadline: string | null
          description: string | null
          id: string
          progress: number
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          progress?: number
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          progress?: number
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_goals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      career_level_actions: {
        Row: {
          action_order: number
          action_text: string
          category: string | null
          created_at: string
          id: string
          is_required: boolean
          template_id: string
        }
        Insert: {
          action_order?: number
          action_text: string
          category?: string | null
          created_at?: string
          id?: string
          is_required?: boolean
          template_id: string
        }
        Update: {
          action_order?: number
          action_text?: string
          category?: string | null
          created_at?: string
          id?: string
          is_required?: boolean
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_level_actions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "career_track_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      career_track_templates: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string
          description: string | null
          estimated_months: number | null
          from_position_id: string | null
          id: string
          is_active: boolean
          motivation_text: string | null
          steps: Json
          title: string
          to_position_id: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          estimated_months?: number | null
          from_position_id?: string | null
          id?: string
          is_active?: boolean
          motivation_text?: string | null
          steps?: Json
          title: string
          to_position_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          estimated_months?: number | null
          from_position_id?: string | null
          id?: string
          is_active?: boolean
          motivation_text?: string | null
          steps?: Json
          title?: string
          to_position_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_track_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "career_track_templates_from_position_id_fkey"
            columns: ["from_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "career_track_templates_to_position_id_fkey"
            columns: ["to_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      competencies: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          skill_name: string
          skill_value: number
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          skill_name: string
          skill_value?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          skill_name?: string
          skill_value?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competencies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          company_id: string | null
          created_at: string
          description: string | null
          head_user_id: string | null
          id: string
          name: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          head_user_id?: string | null
          id?: string
          name: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          head_user_id?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_career_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          company_id: string | null
          current_step: number
          id: string
          personal_motivation: string | null
          status: string
          template_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          company_id?: string | null
          current_step?: number
          id?: string
          personal_motivation?: string | null
          status?: string
          template_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          company_id?: string | null
          current_step?: number
          id?: string
          personal_motivation?: string | null
          status?: string
          template_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_career_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_career_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "career_track_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_rewards: {
        Row: {
          awarded_at: string
          awarded_by: string | null
          company_id: string | null
          created_at: string
          description: string | null
          id: string
          reward_type_id: string
          user_id: string
        }
        Insert: {
          awarded_at?: string
          awarded_by?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          reward_type_id: string
          user_id: string
        }
        Update: {
          awarded_at?: string
          awarded_by?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          reward_type_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_rewards_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_rewards_reward_type_id_fkey"
            columns: ["reward_type_id"]
            isOneToOne: false
            referencedRelation: "gamification_reward_types"
            referencedColumns: ["id"]
          },
        ]
      }
      gamification_reward_types: {
        Row: {
          category: string
          company_id: string | null
          created_at: string
          created_by: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          points: number
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          company_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          points?: number
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          company_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          points?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gamification_reward_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_checklist_items: {
        Row: {
          company_id: string | null
          created_at: string
          deadline: string | null
          goal_id: string
          id: string
          is_done: boolean
          text: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          deadline?: string | null
          goal_id: string
          id?: string
          is_done?: boolean
          text: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          deadline?: string | null
          goal_id?: string
          id?: string
          is_done?: boolean
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_checklist_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_checklist_items_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "career_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_documents: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string
          description: string | null
          document_type: string
          extracted_data: Json | null
          file_name: string | null
          file_url: string | null
          id: string
          processing_status: string
          scenario_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          document_type: string
          extracted_data?: Json | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          processing_status?: string
          scenario_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          document_type?: string
          extracted_data?: Json | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          processing_status?: string
          scenario_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_documents_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "assessment_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          company_id: string | null
          created_at: string
          description: string | null
          id: string
          is_read: boolean
          notification_type: string
          title: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_read?: boolean
          notification_type?: string
          title: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_read?: boolean
          notification_type?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      position_career_paths: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string
          estimated_months: number | null
          from_position_id: string
          id: string
          requirements: Json | null
          strategy_description: string | null
          to_position_id: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by: string
          estimated_months?: number | null
          from_position_id: string
          id?: string
          requirements?: Json | null
          strategy_description?: string | null
          to_position_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string
          estimated_months?: number | null
          from_position_id?: string
          id?: string
          requirements?: Json | null
          strategy_description?: string | null
          to_position_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "position_career_paths_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_career_paths_from_position_id_fkey"
            columns: ["from_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_career_paths_to_position_id_fkey"
            columns: ["to_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          company_id: string | null
          competency_profile: Json | null
          created_at: string
          created_by: string
          department: string | null
          description: string | null
          id: string
          psychological_profile: Json | null
          title: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          competency_profile?: Json | null
          created_at?: string
          created_by: string
          department?: string | null
          description?: string | null
          id?: string
          psychological_profile?: Json | null
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          competency_profile?: Json | null
          created_at?: string
          created_by?: string
          department?: string | null
          description?: string | null
          id?: string
          psychological_profile?: Json | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          created_at: string
          department: string | null
          full_name: string
          hire_date: string | null
          id: string
          is_verified: boolean
          overall_score: number | null
          position: string | null
          position_id: string | null
          requested_role: string
          role_readiness: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          department?: string | null
          full_name?: string
          hire_date?: string | null
          id?: string
          is_verified?: boolean
          overall_score?: number | null
          position?: string | null
          position_id?: string | null
          requested_role?: string
          role_readiness?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          department?: string | null
          full_name?: string
          hire_date?: string | null
          id?: string
          is_verified?: boolean
          overall_score?: number | null
          position?: string | null
          position_id?: string | null
          requested_role?: string
          role_readiness?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          admin_response: string | null
          ai_suggestion: string | null
          company_id: string | null
          created_at: string
          description: string | null
          id: string
          priority: string
          responded_at: string | null
          responded_by: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_response?: string | null
          ai_suggestion?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_response?: string | null
          ai_suggestion?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          company_id: string | null
          created_at: string
          employee_id: string
          id: string
          manager_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          employee_id: string
          id?: string
          manager_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          manager_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
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
      assign_role: {
        Args: {
          _new_role: Database["public"]["Enums"]["app_role"]
          _target_user_id: string
        }
        Returns: undefined
      }
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      reject_user: { Args: { _target_user_id: string }; Returns: undefined }
      verify_user: { Args: { _target_user_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "employee" | "manager" | "hrd" | "superadmin" | "company_admin"
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
      app_role: ["employee", "manager", "hrd", "superadmin", "company_admin"],
    },
  },
} as const
