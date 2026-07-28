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
      feedback: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          kind: string
          message: string
          pushed_at: string | null
          screenshot_path: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          kind?: string
          message: string
          pushed_at?: string | null
          screenshot_path?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          kind?: string
          message?: string
          pushed_at?: string | null
          screenshot_path?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          display_name: string
          group_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          display_name: string
          group_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          display_name?: string
          group_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      hot_list: {
        Row: {
          frequency: number
          group_id: string
          item_name: string
        }
        Insert: {
          frequency?: number
          group_id: string
          item_name: string
        }
        Update: {
          frequency?: number
          group_id?: string
          item_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "hot_list_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      item_categories: {
        Row: {
          category: string
          group_id: string
          item_name: string
          source: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category: string
          group_id: string
          item_name: string
          source?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          group_id?: string
          item_name?: string
          source?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_categories_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          code: string
          created_at: string
          created_by: string
          expires_at: string | null
          group_id: string
          token: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          group_id: string
          token: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          group_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          acted_at: string | null
          acted_by: string | null
          acted_by_name: string | null
          added_by: string | null
          added_by_name: string
          attempt_count: number
          category: string
          created_at: string
          id: string
          name: string
          note: string | null
          priority: Database["public"]["Enums"]["priority"]
          quantity: number
          status: Database["public"]["Enums"]["item_status"]
          substitution_note: string | null
          trip_id: string
          unit: string | null
        }
        Insert: {
          acted_at?: string | null
          acted_by?: string | null
          acted_by_name?: string | null
          added_by?: string | null
          added_by_name: string
          attempt_count?: number
          category?: string
          created_at?: string
          id: string
          name: string
          note?: string | null
          priority?: Database["public"]["Enums"]["priority"]
          quantity?: number
          status?: Database["public"]["Enums"]["item_status"]
          substitution_note?: string | null
          trip_id: string
          unit?: string | null
        }
        Update: {
          acted_at?: string | null
          acted_by?: string | null
          acted_by_name?: string | null
          added_by?: string | null
          added_by_name?: string
          attempt_count?: number
          category?: string
          created_at?: string
          id?: string
          name?: string
          note?: string | null
          priority?: Database["public"]["Enums"]["priority"]
          quantity?: number
          status?: Database["public"]["Enums"]["item_status"]
          substitution_note?: string | null
          trip_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      join_attempts: {
        Row: {
          attempted_at: string
          user_id: string
        }
        Insert: {
          attempted_at?: string
          user_id: string
        }
        Update: {
          attempted_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string
          endpoint: string
          keys: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          keys: Json
          user_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          keys?: Json
          user_id?: string
        }
        Relationships: []
      }
      recurring_items: {
        Row: {
          active: boolean
          category: string
          default_qty: number
          group_id: string
          id: string
          last_added_at: string | null
          name: string
          recurrence_rule: string
        }
        Insert: {
          active?: boolean
          category?: string
          default_qty?: number
          group_id: string
          id?: string
          last_added_at?: string | null
          name: string
          recurrence_rule: string
        }
        Update: {
          active?: boolean
          category?: string
          default_qty?: number
          group_id?: string
          id?: string
          last_added_at?: string | null
          name?: string
          recurrence_rule?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_items_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      shops: {
        Row: {
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "shops_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          completed_at: string | null
          group_id: string
          id: string
          lastminute_until: string | null
          shop_id: string | null
          shopper_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["trip_status"]
        }
        Insert: {
          completed_at?: string | null
          group_id: string
          id?: string
          lastminute_until?: string | null
          shop_id?: string | null
          shopper_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["trip_status"]
        }
        Update: {
          completed_at?: string | null
          group_id?: string
          id?: string
          lastminute_until?: string | null
          shop_id?: string | null
          shopper_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["trip_status"]
        }
        Relationships: [
          {
            foreignKeyName: "trips_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _guard_join_attempt: { Args: never; Returns: undefined }
      cancel_shopping: { Args: { p_trip_id: string }; Returns: undefined }
      clear_history: { Args: { p_group_id: string }; Returns: undefined }
      complete_trip: { Args: { p_trip_id: string }; Returns: string }
      create_group: {
        Args: { p_display_name: string; p_name: string }
        Returns: string
      }
      create_invite: {
        Args: { p_group_id: string }
        Returns: {
          code: string
          expires_at: string
          token: string
        }[]
      }
      create_shop: {
        Args: { p_group_id: string; p_name: string }
        Returns: string
      }
      delete_account: { Args: never; Returns: undefined }
      delete_shop: { Args: { p_shop_id: string }; Returns: undefined }
      is_member: { Args: { gid: string }; Returns: boolean }
      norm_item_name: { Args: { p_name: string }; Returns: string }
      set_item_category: {
        Args: { p_category: string; p_group_id: string; p_name: string }
        Returns: undefined
      }
      join_group: {
        Args: { p_code: string; p_display_name?: string }
        Returns: string
      }
      join_group_by_token: {
        Args: { p_display_name?: string; p_token: string }
        Returns: string
      }
      leave_group: { Args: { p_group_id: string }; Returns: undefined }
      move_item_to_shop: {
        Args: { p_item_id: string; p_shop_id: string | null }
        Returns: undefined
      }
      rename_member: {
        Args: { p_display_name: string; p_group_id: string }
        Returns: undefined
      }
      rename_shop: {
        Args: { p_name: string; p_shop_id: string }
        Returns: undefined
      }
      start_shopping: {
        Args: { p_minutes: number; p_trip_id: string }
        Returns: string
      }
      take_over_shopping: { Args: { p_trip_id: string }; Returns: string }
      trip_group: { Args: { tid: string }; Returns: string }
    }
    Enums: {
      item_status:
        | "pending"
        | "bought"
        | "substituted"
        | "not_found"
        | "deleted"
      priority: "normal" | "urgent"
      trip_status: "active" | "shopping" | "completed"
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
      item_status: ["pending", "bought", "substituted", "not_found", "deleted"],
      priority: ["normal", "urgent"],
      trip_status: ["active", "shopping", "completed"],
    },
  },
} as const
