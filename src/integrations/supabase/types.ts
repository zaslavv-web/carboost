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
          assignment_id: string | null
          auto_generated: boolean
          company_id: string | null
          created_at: string
          deadline: string | null
          description: string | null
          id: string
          progress: number
          status: string
          step_order: number | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assignment_id?: string | null
          auto_generated?: boolean
          company_id?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          progress?: number
          status?: string
          step_order?: number | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assignment_id?: string | null
          auto_generated?: boolean
          company_id?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          progress?: number
          status?: string
          step_order?: number | null
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
      career_step_scenarios: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          instructions: string | null
          min_files: number
          min_test_score: number
          reinforced_instructions: string | null
          requires_comment: boolean
          requires_files: boolean
          requires_test: boolean
          step_order: number
          template_id: string
          test_id: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          instructions?: string | null
          min_files?: number
          min_test_score?: number
          reinforced_instructions?: string | null
          requires_comment?: boolean
          requires_files?: boolean
          requires_test?: boolean
          step_order: number
          template_id: string
          test_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          instructions?: string | null
          min_files?: number
          min_test_score?: number
          reinforced_instructions?: string | null
          requires_comment?: boolean
          requires_files?: boolean
          requires_test?: boolean
          step_order?: number
          template_id?: string
          test_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      career_step_submission_files: {
        Row: {
          file_name: string | null
          file_size: number | null
          file_url: string
          id: string
          submission_id: string
          uploaded_at: string
        }
        Insert: {
          file_name?: string | null
          file_size?: number | null
          file_url: string
          id?: string
          submission_id: string
          uploaded_at?: string
        }
        Update: {
          file_name?: string | null
          file_size?: number | null
          file_url?: string
          id?: string
          submission_id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_step_submission_files_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "career_step_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      career_step_submissions: {
        Row: {
          assignment_id: string
          attempt_no: number
          comment: string | null
          company_id: string | null
          created_at: string
          id: string
          is_reinforced: boolean
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          step_order: number
          template_id: string
          test_attempt_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assignment_id: string
          attempt_no?: number
          comment?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          is_reinforced?: boolean
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          step_order: number
          template_id: string
          test_attempt_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assignment_id?: string
          attempt_no?: number
          comment?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          is_reinforced?: boolean
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          step_order?: number
          template_id?: string
          test_attempt_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      closed_question_tests: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean
          position_id: string | null
          questions: Json
          source_file_name: string | null
          source_file_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean
          position_id?: string | null
          questions?: Json
          source_file_name?: string | null
          source_file_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          position_id?: string | null
          questions?: Json
          source_file_name?: string | null
          source_file_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "closed_question_tests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closed_question_tests_position_id_fkey"
            columns: ["position_id"]
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
      company_currency_settings: {
        Row: {
          company_id: string
          created_at: string
          currency_icon: string
          currency_name: string
          id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          currency_icon?: string
          currency_name?: string
          id?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          currency_icon?: string
          currency_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_onboarding_settings: {
        Row: {
          auto_assign_tests: boolean
          auto_assign_tracks: boolean
          company_id: string
          created_at: string
          id: string
          updated_at: string
          welcome_bonus_amount: number
          welcome_bonus_enabled: boolean
        }
        Insert: {
          auto_assign_tests?: boolean
          auto_assign_tracks?: boolean
          company_id: string
          created_at?: string
          id?: string
          updated_at?: string
          welcome_bonus_amount?: number
          welcome_bonus_enabled?: boolean
        }
        Update: {
          auto_assign_tests?: boolean
          auto_assign_tracks?: boolean
          company_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          welcome_bonus_amount?: number
          welcome_bonus_enabled?: boolean
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
      currency_balances: {
        Row: {
          balance: number
          company_id: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          company_id: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          company_id?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      currency_transactions: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          kind: string
          reference_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind: string
          reference_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: string
          reference_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      demo_requests: {
        Row: {
          company: string | null
          created_at: string
          email: string
          headcount: number | null
          id: string
          name: string
          notes: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          headcount?: number | null
          id?: string
          name: string
          notes?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          headcount?: number | null
          id?: string
          name?: string
          notes?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
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
      email_domain_position_mappings: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string
          email_domain: string
          id: string
          position_id: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by: string
          email_domain: string
          id?: string
          position_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string
          email_domain?: string
          id?: string
          position_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_domain_position_mappings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_domain_position_mappings_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
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
      employee_invitations: {
        Row: {
          claimed_at: string | null
          claimed_user_id: string | null
          company_id: string
          created_at: string
          department: string | null
          email: string
          full_name: string | null
          id: string
          invited_by: string
          position_id: string | null
          requested_role: string
          status: string
          token: string
          token_hash: string | null
          updated_at: string
        }
        Insert: {
          claimed_at?: string | null
          claimed_user_id?: string | null
          company_id: string
          created_at?: string
          department?: string | null
          email: string
          full_name?: string | null
          id?: string
          invited_by: string
          position_id?: string | null
          requested_role?: string
          status?: string
          token?: string
          token_hash?: string | null
          updated_at?: string
        }
        Update: {
          claimed_at?: string | null
          claimed_user_id?: string | null
          company_id?: string
          created_at?: string
          department?: string | null
          email?: string
          full_name?: string | null
          id?: string
          invited_by?: string
          position_id?: string | null
          requested_role?: string
          status?: string
          token?: string
          token_hash?: string | null
          updated_at?: string
        }
        Relationships: []
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
      employee_risk_scores: {
        Row: {
          attrition_risk: number
          burnout_risk: number
          company_id: string
          computed_at: string
          engagement_score: number
          factors: Json
          id: string
          recommendations: Json
          risk_level: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attrition_risk?: number
          burnout_risk?: number
          company_id: string
          computed_at?: string
          engagement_score?: number
          factors?: Json
          id?: string
          recommendations?: Json
          risk_level?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attrition_risk?: number
          burnout_risk?: number
          company_id?: string
          computed_at?: string
          engagement_score?: number
          factors?: Json
          id?: string
          recommendations?: Json
          risk_level?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gamification_reward_types: {
        Row: {
          category: string
          company_id: string | null
          created_at: string
          created_by: string
          description: string | null
          gift_content: string | null
          icon: string | null
          id: string
          image_url: string | null
          is_active: boolean
          monetary_amount: number | null
          monetary_currency: string | null
          non_monetary_description: string | null
          non_monetary_title: string | null
          points: number
          reward_kind: string
          title: string
          trigger_events: Json
          trigger_mode: string
          updated_at: string
        }
        Insert: {
          category?: string
          company_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          gift_content?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          monetary_amount?: number | null
          monetary_currency?: string | null
          non_monetary_description?: string | null
          non_monetary_title?: string | null
          points?: number
          reward_kind?: string
          title: string
          trigger_events?: Json
          trigger_mode?: string
          updated_at?: string
        }
        Update: {
          category?: string
          company_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          gift_content?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          monetary_amount?: number | null
          monetary_currency?: string | null
          non_monetary_description?: string | null
          non_monetary_title?: string | null
          points?: number
          reward_kind?: string
          title?: string
          trigger_events?: Json
          trigger_mode?: string
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
      hr_task_assignees: {
        Row: {
          created_at: string
          id: string
          individual_status: string
          reward_paid: boolean
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          individual_status?: string
          reward_paid?: boolean
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          individual_status?: string
          reward_paid?: boolean
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "hr_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_tasks: {
        Row: {
          category: string
          company_id: string
          created_at: string
          created_by: string
          deadline: string | null
          description: string | null
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          reward_coins: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          company_id: string
          created_at?: string
          created_by: string
          deadline?: string | null
          description?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reward_coins?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          company_id?: string
          created_at?: string
          created_by?: string
          deadline?: string | null
          description?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reward_coins?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      peer_recognition_reactions: {
        Row: {
          created_at: string
          id: string
          reaction: string
          recognition_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reaction?: string
          recognition_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reaction?: string
          recognition_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "peer_recognition_reactions_recognition_id_fkey"
            columns: ["recognition_id"]
            isOneToOne: false
            referencedRelation: "peer_recognitions"
            referencedColumns: ["id"]
          },
        ]
      }
      peer_recognitions: {
        Row: {
          category: string
          coin_reward: number
          company_id: string
          created_at: string
          from_user_id: string
          id: string
          message: string
          to_user_id: string
        }
        Insert: {
          category?: string
          coin_reward?: number
          company_id: string
          created_at?: string
          from_user_id: string
          id?: string
          message: string
          to_user_id: string
        }
        Update: {
          category?: string
          coin_reward?: number
          company_id?: string
          created_at?: string
          from_user_id?: string
          id?: string
          message?: string
          to_user_id?: string
        }
        Relationships: []
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
          pending_position_id: string | null
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
          pending_position_id?: string | null
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
          pending_position_id?: string | null
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
            foreignKeyName: "profiles_pending_position_id_fkey"
            columns: ["pending_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
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
      shop_cart_items: {
        Row: {
          company_id: string
          created_at: string
          id: string
          product_id: string
          quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          product_id: string
          quantity?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "shop_products"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string
          product_title: string
          quantity: number
          subtotal: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id: string
          product_title: string
          quantity: number
          subtotal: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string
          product_title?: string
          quantity?: number
          subtotal?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "shop_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "shop_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_orders: {
        Row: {
          cancel_reason: string | null
          company_id: string
          created_at: string
          fulfilled_at: string | null
          fulfilled_by: string | null
          id: string
          status: string
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_reason?: string | null
          company_id: string
          created_at?: string
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          status?: string
          total_amount: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_reason?: string | null
          company_id?: string
          created_at?: string
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          status?: string
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shop_products: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          max_per_period: number | null
          max_per_user: number | null
          period_kind: string
          price: number
          stock: number | null
          title: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          max_per_period?: number | null
          max_per_user?: number | null
          period_kind?: string
          price: number
          stock?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          max_per_period?: number | null
          max_per_user?: number | null
          period_kind?: string
          price?: number
          stock?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: []
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
      test_attempts: {
        Row: {
          answers: Json
          company_id: string | null
          competency_breakdown: Json
          created_at: string
          id: string
          score: number
          test_id: string | null
          test_source: string
          total: number
          user_id: string
        }
        Insert: {
          answers?: Json
          company_id?: string | null
          competency_breakdown?: Json
          created_at?: string
          id?: string
          score?: number
          test_id?: string | null
          test_source?: string
          total?: number
          user_id: string
        }
        Update: {
          answers?: Json
          company_id?: string | null
          competency_breakdown?: Json
          created_at?: string
          id?: string
          score?: number
          test_id?: string | null
          test_source?: string
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_attempts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_attempts_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "closed_question_tests"
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
      award_currency: {
        Args: {
          _amount: number
          _company_id: string
          _description?: string
          _kind: string
          _reference_id?: string
          _user_id: string
        }
        Returns: string
      }
      build_employee_artifacts: { Args: { _user_id: string }; Returns: string }
      bulk_invite_employees: { Args: { _invites: Json }; Returns: Json }
      create_shop_order: { Args: { _items: Json }; Returns: string }
      delete_user: { Args: { _target_user_id: string }; Returns: undefined }
      find_company_by_name: { Args: { _name: string }; Returns: string }
      fulfill_shop_order: {
        Args: { _approve: boolean; _order_id: string; _reason?: string }
        Returns: undefined
      }
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      grant_rewards_for_event: {
        Args: {
          _company_id: string
          _description?: string
          _event_code: string
          _user_id: string
        }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      notify_career_event: {
        Args: {
          _company_id: string
          _description: string
          _ntype: string
          _title: string
          _user_id: string
        }
        Returns: undefined
      }
      register_company: { Args: { _name: string }; Returns: string }
      reject_user: { Args: { _target_user_id: string }; Returns: undefined }
      review_career_step: {
        Args: { _approve: boolean; _reason?: string; _submission_id: string }
        Returns: undefined
      }
      submit_career_step: {
        Args: {
          _assignment_id: string
          _comment?: string
          _file_urls?: Json
          _test_attempt_id?: string
        }
        Returns: string
      }
      submit_demo_request: {
        Args: {
          _company?: string
          _email: string
          _headcount?: number
          _name: string
          _source?: string
        }
        Returns: string
      }
      sync_step_goals_to_personal: {
        Args: { _assignment_id: string }
        Returns: undefined
      }
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
