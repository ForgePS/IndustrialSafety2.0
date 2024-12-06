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
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
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
      billing: {
        Row: {
          billing_provider: Database["public"]["Enums"]["billing_provider_enum"]
          cost: string | null
          email: string
          id: string
          order_id: string | null
          order_type: string
          payment_email: string | null
          status: Database["public"]["Enums"]["payment_status_enum"]
          user_id: string
        }
        Insert: {
          billing_provider: Database["public"]["Enums"]["billing_provider_enum"]
          cost?: string | null
          email?: string
          id?: string
          order_id?: string | null
          order_type: string
          payment_email?: string | null
          status: Database["public"]["Enums"]["payment_status_enum"]
          user_id: string
        }
        Update: {
          billing_provider?: Database["public"]["Enums"]["billing_provider_enum"]
          cost?: string | null
          email?: string
          id?: string
          order_id?: string | null
          order_type?: string
          payment_email?: string | null
          status?: Database["public"]["Enums"]["payment_status_enum"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_email_fkey"
            columns: ["email"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["email"]
          },
          {
            foreignKeyName: "billing_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      faq_categories: {
        Row: {
          icon: string
          id: number
          title: string
        }
        Insert: {
          icon: string
          id?: number
          title: string
        }
        Update: {
          icon?: string
          id?: number
          title?: string
        }
        Relationships: []
      }
      faqs: {
        Row: {
          categoryId: number | null
          description: string
          id: number
          isFeatured: boolean
          title: string
        }
        Insert: {
          categoryId?: number | null
          description: string
          id?: number
          isFeatured: boolean
          title: string
        }
        Update: {
          categoryId?: number | null
          description?: string
          id?: number
          isFeatured?: boolean
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "faq_category_id_fkey"
            columns: ["categoryId"]
            isOneToOne: false
            referencedRelation: "faq_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          id: number
          permission: string
        }
        Insert: {
          id?: number
          permission: string
        }
        Update: {
          id?: number
          permission?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          avatarImage: string | null
          content: string
          country: string | null
          designation: string | null
          id: number
          isFeatured: boolean
          link: string
          platform: Database["public"]["Enums"]["reviews_platform_enum"]
          rating: number
          title: string | null
          username: string
          videoUrl: string | null
        }
        Insert: {
          avatarImage?: string | null
          content: string
          country?: string | null
          designation?: string | null
          id?: number
          isFeatured: boolean
          link: string
          platform: Database["public"]["Enums"]["reviews_platform_enum"]
          rating: number
          title?: string | null
          username: string
          videoUrl?: string | null
        }
        Update: {
          avatarImage?: string | null
          content?: string
          country?: string | null
          designation?: string | null
          id?: number
          isFeatured?: boolean
          link?: string
          platform?: Database["public"]["Enums"]["reviews_platform_enum"]
          rating?: number
          title?: string | null
          username?: string
          videoUrl?: string | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          id: number
          permission_id: number
          role_id: number
        }
        Insert: {
          id?: number
          permission_id: number
          role_id: number
        }
        Update: {
          id?: number
          permission_id?: number
          role_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          id: number
          role: string
        }
        Insert: {
          id?: number
          role: string
        }
        Update: {
          id?: number
          role?: string
        }
        Relationships: []
      }
      settings_configuration: {
        Row: {
          id: number
          key: string
          value: string | null
        }
        Insert: {
          id?: number
          key: string
          value?: string | null
        }
        Update: {
          id?: number
          key?: string
          value?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          role_id: number
          user_id: number
        }
        Insert: {
          role_id: number
          user_id: number
        }
        Update: {
          role_id?: number
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          email: string
          id: number
          name: string | null
          user_id: string
        }
        Insert: {
          email: string
          id?: number
          name?: string | null
          user_id: string
        }
        Update: {
          email?: string
          id?: number
          name?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      billing_provider_enum: "stripe" | "lemon_squeezy"
      payment_status_enum: "pending" | "success"
      reviews_platform_enum: "trustpilot" | "twitter" | "g2"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

