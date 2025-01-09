export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

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
          billing_provider: Database['public']['Enums']['billing_provider_enum']
          cost: string | null
          currency: string | null
          email: string
          id: string
          interval: string | null
          order_id: string
          order_type: string
          payment_email: string | null
          plan_variant: string
          status: Database['public']['Enums']['payment_status_enum']
          user_id: string
        }
        Insert: {
          billing_provider: Database['public']['Enums']['billing_provider_enum']
          cost?: string | null
          currency?: string | null
          email?: string
          id?: string
          interval?: string | null
          order_id: string
          order_type: string
          payment_email?: string | null
          plan_variant: string
          status: Database['public']['Enums']['payment_status_enum']
          user_id: string
        }
        Update: {
          billing_provider?: Database['public']['Enums']['billing_provider_enum']
          cost?: string | null
          currency?: string | null
          email?: string
          id?: string
          interval?: string | null
          order_id?: string
          order_type?: string
          payment_email?: string | null
          plan_variant?: string
          status?: Database['public']['Enums']['payment_status_enum']
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'billing_email_fkey'
            columns: ['email']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['email']
          },
          {
            foreignKeyName: 'billing_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['user_id']
          }
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
          category_id: number | null
          description: string
          id: number
          is_featured: boolean
          title: string
        }
        Insert: {
          category_id?: number | null
          description: string
          id?: number
          is_featured: boolean
          title: string
        }
        Update: {
          category_id?: number | null
          description?: string
          id?: number
          is_featured?: boolean
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: 'faq_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'faq_categories'
            referencedColumns: ['id']
          }
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
      review_platforms: {
        Row: {
          id: number
          logo: string | null
          platform_name: string | null
          slug: string | null
        }
        Insert: {
          id?: number
          logo?: string | null
          platform_name?: string | null
          slug?: string | null
        }
        Update: {
          id?: number
          logo?: string | null
          platform_name?: string | null
          slug?: string | null
        }
        Relationships: []
      }
      reviews: {
        Row: {
          avatar_image: string | null
          content: string
          country: string | null
          designation: string | null
          id: number
          is_featured: boolean
          link: string
          platform_id: number | null
          rating: number
          title: string | null
          username: string
          video_url: string | null
        }
        Insert: {
          avatar_image?: string | null
          content: string
          country?: string | null
          designation?: string | null
          id?: number
          is_featured: boolean
          link: string
          platform_id?: number | null
          rating: number
          title?: string | null
          username: string
          video_url?: string | null
        }
        Update: {
          avatar_image?: string | null
          content?: string
          country?: string | null
          designation?: string | null
          id?: number
          is_featured?: boolean
          link?: string
          platform_id?: number | null
          rating?: number
          title?: string | null
          username?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'reviews_platform_id_fkey'
            columns: ['platform_id']
            isOneToOne: false
            referencedRelation: 'review_platforms'
            referencedColumns: ['id']
          }
        ]
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
            foreignKeyName: 'role_permissions_permission_id_fkey'
            columns: ['permission_id']
            isOneToOne: false
            referencedRelation: 'permissions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'role_permissions_role_id_fkey'
            columns: ['role_id']
            isOneToOne: false
            referencedRelation: 'roles'
            referencedColumns: ['id']
          }
        ]
      }
      roles: {
        Row: {
          hierarchy: number
          id: number
          role: string
        }
        Insert: {
          hierarchy?: number
          id?: number
          role: string
        }
        Update: {
          hierarchy?: number
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
            foreignKeyName: 'user_roles_role_id_fkey'
            columns: ['role_id']
            isOneToOne: false
            referencedRelation: 'roles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'user_roles_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
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
      can_manage_user: {
        Args: {
          auth_uid: string
          target_user_id: string
        }
        Returns: boolean
      }
      can_perform_user_action: {
        Args: {
          auth_uid: string
          target_user_id: number
        }
        Returns: boolean
      }
      can_update_user: {
        Args: {
          auth_uid: string
          target_user_id: number
        }
        Returns: boolean
      }
      can_view_user: {
        Args: {
          auth_uid: string
          target_user_id: number
        }
        Returns: boolean
      }
      check_role_hierarchy: {
        Args: {
          auth_uid: string
          target_user_id: number
        }
        Returns: boolean
      }
      custom_access_token_hook: {
        Args: {
          event: Json
        }
        Returns: Json
      }
      get_user_hierarchy: {
        Args: {
          target_user_id: number
        }
        Returns: number
      }
      get_user_higher_hierarchy: {
        Args: {
          user_id: string
        }
        Returns: number
      }
      get_user_id_from_auth: {
        Args: {
          auth_uid: string
        }
        Returns: number
      }
      has_permission: {
        Args: {
          user_id: string
          required_permission: string
        }
        Returns: boolean
      }
    }
    Enums: {
      billing_provider_enum: 'stripe' | 'lemon_squeezy'
      payment_status_enum: 'pending' | 'success'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, 'public'>]

export type Tables<
  PublicTableNameOrOptions extends keyof (PublicSchema['Tables'] & PublicSchema['Views']) | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions['schema']]['Tables'] &
        Database[PublicTableNameOrOptions['schema']]['Views'])
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions['schema']]['Tables'] &
      Database[PublicTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema['Tables'] & PublicSchema['Views'])
    ? (PublicSchema['Tables'] & PublicSchema['Views'])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends keyof PublicSchema['Tables'] | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
    ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends keyof PublicSchema['Tables'] | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
    ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends keyof PublicSchema['Enums'] | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions['schema']]['Enums']
    : never = never
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions['schema']]['Enums'][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema['Enums']
    ? PublicSchema['Enums'][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends keyof PublicSchema['CompositeTypes'] | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema['CompositeTypes']
    ? PublicSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never
