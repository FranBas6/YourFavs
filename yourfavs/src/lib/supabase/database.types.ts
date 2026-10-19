
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "activity": {
                  Row: {
                    "id": string,"logged_at": string,"media_type": string,"meta": Json | null,"tmdb_id": number,"user_id": string,"verb": string
                  }
                  Insert: {
                    "id"?: string,"logged_at"?: string,"media_type": string,"meta"?: Json | null,"tmdb_id": number,"user_id"?: string,"verb": string
                  }
                  Update: {
                    "id"?: string,"logged_at"?: string,"media_type"?: string,"meta"?: Json | null,"tmdb_id"?: number,"user_id"?: string,"verb"?: string
                  }
                  Relationships: [
                    
                  ]
                },"actor_favs": {
                  Row: {
                    "added_at": string,"person_id": number,"position": number | null,"user_id": string
                  }
                  Insert: {
                    "added_at"?: string,"person_id": number,"position"?: number | null,"user_id"?: string
                  }
                  Update: {
                    "added_at"?: string,"person_id"?: number,"position"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"app_state": {
                  Row: {
                    "claimed_at": number,"data": NonNullable<Json>,"key": string,"updated_at": string
                  }
                  Insert: {
                    "claimed_at"?: number,"data"?: NonNullable<Json>,"key": string,"updated_at"?: string
                  }
                  Update: {
                    "claimed_at"?: number,"data"?: NonNullable<Json>,"key"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"blocks": {
                  Row: {
                    "blocked_id": string,"blocker_id": string,"created_at": string
                  }
                  Insert: {
                    "blocked_id": string,"blocker_id": string,"created_at"?: string
                  }
                  Update: {
                    "blocked_id"?: string,"blocker_id"?: string,"created_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"custom_list_items": {
                  Row: {
                    "added_at": string,"list_id": string,"media_type": Database["public"]['Enums']["media_type"],"position": number | null,"poster_path": string | null,"title": string | null,"tmdb_id": number,"user_id": string
                  }
                  Insert: {
                    "added_at"?: string,"list_id": string,"media_type": Database["public"]['Enums']["media_type"],"position"?: number | null,"poster_path"?: string | null,"title"?: string | null,"tmdb_id": number,"user_id"?: string
                  }
                  Update: {
                    "added_at"?: string,"list_id"?: string,"media_type"?: Database["public"]['Enums']["media_type"],"position"?: number | null,"poster_path"?: string | null,"title"?: string | null,"tmdb_id"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "custom_list_items_user_id_list_id_fkey"
      columns: ["user_id","list_id"]
isOneToOne: false
      referencedRelation: "custom_lists"
      referencedColumns: ["user_id","id"]
    }
                  ]
                },"custom_lists": {
                  Row: {
                    "color_stamp": string | null,"cover": Json | null,"created_at": string,"description": string,"icon": string | null,"id": string,"is_public": boolean,"item_count": number,"name": string,"position": number | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "color_stamp"?: string | null,"cover"?: Json | null,"created_at"?: string,"description"?: string,"icon"?: string | null,"id"?: string,"is_public"?: boolean,"item_count"?: number,"name": string,"position"?: number | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "color_stamp"?: string | null,"cover"?: Json | null,"created_at"?: string,"description"?: string,"icon"?: string | null,"id"?: string,"is_public"?: boolean,"item_count"?: number,"name"?: string,"position"?: number | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"followed_people": {
                  Row: {
                    "added_at": string,"name": string | null,"person_id": number,"profile_path": string | null,"user_id": string
                  }
                  Insert: {
                    "added_at"?: string,"name"?: string | null,"person_id": number,"profile_path"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "added_at"?: string,"name"?: string | null,"person_id"?: number,"profile_path"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"follows": {
                  Row: {
                    "created_at": string,"followee_id": string,"follower_id": string
                  }
                  Insert: {
                    "created_at"?: string,"followee_id": string,"follower_id": string
                  }
                  Update: {
                    "created_at"?: string,"followee_id"?: string,"follower_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"friend_requests": {
                  Row: {
                    "created_at": string,"from_id": string,"id": number,"rejected_at": string | null,"resolved_at": string | null,"status": string,"to_id": string
                  }
                  Insert: {
                    "created_at"?: string,"from_id": string,"id"?: never,"rejected_at"?: string | null,"resolved_at"?: string | null,"status"?: string,"to_id": string
                  }
                  Update: {
                    "created_at"?: string,"from_id"?: string,"id"?: never,"rejected_at"?: string | null,"resolved_at"?: string | null,"status"?: string,"to_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"friendships": {
                  Row: {
                    "a_id": string,"b_id": string,"ended_at": string | null,"ended_by": string | null,"since": string
                  }
                  Insert: {
                    "a_id": string,"b_id": string,"ended_at"?: string | null,"ended_by"?: string | null,"since"?: string
                  }
                  Update: {
                    "a_id"?: string,"b_id"?: string,"ended_at"?: string | null,"ended_by"?: string | null,"since"?: string
                  }
                  Relationships: [
                    
                  ]
                },"library_items": {
                  Row: {
                    "added_at": string,"collection": string,"media_type": Database["public"]['Enums']["media_type"],"opinion": string | null,"position": number | null,"rating": number | null,"tmdb_id": number,"user_id": string
                  }
                  Insert: {
                    "added_at"?: string,"collection": string,"media_type"?: never,"opinion"?: string | null,"position"?: number | null,"rating"?: number | null,"tmdb_id": number,"user_id"?: string
                  }
                  Update: {
                    "added_at"?: string,"collection"?: string,"media_type"?: never,"opinion"?: string | null,"position"?: number | null,"rating"?: number | null,"tmdb_id"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"media_tags": {
                  Row: {
                    "media_type": Database["public"]['Enums']["media_type"],"notes": string,"tags": (string)[],"tmdb_id": number,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "media_type": Database["public"]['Enums']["media_type"],"notes"?: string,"tags"?: (string)[],"tmdb_id": number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "media_type"?: Database["public"]['Enums']["media_type"],"notes"?: string,"tags"?: (string)[],"tmdb_id"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notification_subs": {
                  Row: {
                    "added_at": string,"media_type": Database["public"]['Enums']["media_type"],"tmdb_id": number,"user_id": string
                  }
                  Insert: {
                    "added_at"?: string,"media_type": Database["public"]['Enums']["media_type"],"tmdb_id": number,"user_id"?: string
                  }
                  Update: {
                    "added_at"?: string,"media_type"?: Database["public"]['Enums']["media_type"],"tmdb_id"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notifications": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"href": string | null,"id": string,"poster_path": string | null,"read": boolean,"subtitle": string | null,"title": string | null,"type": string,"user_id": string
                  }
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"href"?: string | null,"id": string,"poster_path"?: string | null,"read"?: boolean,"subtitle"?: string | null,"title"?: string | null,"type": string,"user_id"?: string
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"href"?: string | null,"id"?: string,"poster_path"?: string | null,"read"?: boolean,"subtitle"?: string | null,"title"?: string | null,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profile_hidden_titles": {
                  Row: {
                    "hidden_at": string,"media_type": Database["public"]['Enums']["media_type"],"poster_path": string | null,"title": string | null,"tmdb_id": number,"user_id": string
                  }
                  Insert: {
                    "hidden_at"?: string,"media_type": Database["public"]['Enums']["media_type"],"poster_path"?: string | null,"title"?: string | null,"tmdb_id": number,"user_id"?: string
                  }
                  Update: {
                    "hidden_at"?: string,"media_type"?: Database["public"]['Enums']["media_type"],"poster_path"?: string | null,"title"?: string | null,"tmdb_id"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"display_name": string | null,"email": string | null,"firebase_uid": string | null,"home_layout": Json | null,"id": string,"language": string | null,"notif_prefs": Json | null,"onboarding": string | null,"platforms": (number)[] | null,"platforms_filter_default": boolean | null,"public_archetype": Json | null,"public_bio": string | null,"public_four": NonNullable<Json>,"public_handle": string | null,"public_handle_changed_at": string | null,"public_indexable": boolean,"public_sections": NonNullable<Json>,"public_since": string | null,"public_visibility": string,"referral_suggestion_dismissed": boolean,"referred_by": string | null,"region": string | null,"spoiler_free": boolean | null,"spoilers": Json | null,"theme": string | null,"updated_at": string
                  }
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"display_name"?: string | null,"email"?: string | null,"firebase_uid"?: string | null,"home_layout"?: Json | null,"id": string,"language"?: string | null,"notif_prefs"?: Json | null,"onboarding"?: string | null,"platforms"?: (number)[] | null,"platforms_filter_default"?: boolean | null,"public_archetype"?: Json | null,"public_bio"?: string | null,"public_four"?: NonNullable<Json>,"public_handle"?: string | null,"public_handle_changed_at"?: string | null,"public_indexable"?: boolean,"public_sections"?: NonNullable<Json>,"public_since"?: string | null,"public_visibility"?: string,"referral_suggestion_dismissed"?: boolean,"referred_by"?: string | null,"region"?: string | null,"spoiler_free"?: boolean | null,"spoilers"?: Json | null,"theme"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"display_name"?: string | null,"email"?: string | null,"firebase_uid"?: string | null,"home_layout"?: Json | null,"id"?: string,"language"?: string | null,"notif_prefs"?: Json | null,"onboarding"?: string | null,"platforms"?: (number)[] | null,"platforms_filter_default"?: boolean | null,"public_archetype"?: Json | null,"public_bio"?: string | null,"public_four"?: NonNullable<Json>,"public_handle"?: string | null,"public_handle_changed_at"?: string | null,"public_indexable"?: boolean,"public_sections"?: NonNullable<Json>,"public_since"?: string | null,"public_visibility"?: string,"referral_suggestion_dismissed"?: boolean,"referred_by"?: string | null,"region"?: string | null,"spoiler_free"?: boolean | null,"spoilers"?: Json | null,"theme"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ratings": {
                  Row: {
                    "created_at": string,"media_type": Database["public"]['Enums']["media_type"],"score": number,"tmdb_id": number,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"media_type": Database["public"]['Enums']["media_type"],"score": number,"tmdb_id": number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"media_type"?: Database["public"]['Enums']["media_type"],"score"?: number,"tmdb_id"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"spoiler_prefs": {
                  Row: {
                    "spoiler_free": boolean,"tmdb_id": number,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "spoiler_free": boolean,"tmdb_id": number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "spoiler_free"?: boolean,"tmdb_id"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_state": {
                  Row: {
                    "data": NonNullable<Json>,"key": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "data": NonNullable<Json>,"key": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "data"?: NonNullable<Json>,"key"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"watch_log": {
                  Row: {
                    "episode": number | null,"id": string,"logged_at": string,"media_type": Database["public"]['Enums']["media_type"],"note": string | null,"rewatch": boolean,"season": number | null,"source": string | null,"tmdb_id": number,"user_id": string,"watched_on": string
                  }
                  Insert: {
                    "episode"?: number | null,"id"?: string,"logged_at"?: string,"media_type": Database["public"]['Enums']["media_type"],"note"?: string | null,"rewatch"?: boolean,"season"?: number | null,"source"?: string | null,"tmdb_id": number,"user_id"?: string,"watched_on": string
                  }
                  Update: {
                    "episode"?: number | null,"id"?: string,"logged_at"?: string,"media_type"?: Database["public"]['Enums']["media_type"],"note"?: string | null,"rewatch"?: boolean,"season"?: number | null,"source"?: string | null,"tmdb_id"?: number,"user_id"?: string,"watched_on"?: string
                  }
                  Relationships: [
                    
                  ]
                },"watched_episodes": {
                  Row: {
                    "episode": number,"season": number,"serie_id": number,"user_id": string,"watched_at": string | null
                  }
                  Insert: {
                    "episode": number,"season": number,"serie_id": number,"user_id"?: string,"watched_at"?: string | null
                  }
                  Update: {
                    "episode"?: number,"season"?: number,"serie_id"?: number,"user_id"?: string,"watched_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "claim_app_state":
{ Args: { "p_key": string,"p_ttl_ms": number }; Returns: Json
                           },
"renumber_actor_favs":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"renumber_list_positions":
{ Args: { "p_collection": string }; Returns: undefined
                           },
"reorder_custom_list_items":
{ Args: { "p_item_ids": (string)[],"p_list_id": string }; Returns: undefined
                           },
"reorder_custom_lists":
{ Args: { "p_ids": (string)[] }; Returns: undefined
                           },
"shift_actor_fav_positions":
{ Args: { "p_delta": number,"p_from": number,"p_to": number }; Returns: undefined
                           },
"shift_list_positions":
{ Args: { "p_collection": string,"p_delta": number,"p_from": number,"p_to": number }; Returns: undefined
                           },
"social_are_friends":
{ Args: { "p_x": string,"p_y": string }; Returns: boolean
                           },
"social_block":
{ Args: { "p_me": string,"p_them": string }; Returns: undefined
                           },
"social_cancel_request":
{ Args: { "p_me": string,"p_them": string }; Returns: undefined
                           },
"social_follow":
{ Args: { "p_me": string,"p_them": string }; Returns: string
                           },
"social_make_friends":
{ Args: { "p_x": string,"p_y": string }; Returns: undefined
                           },
"social_notify":
{ Args: { "p_actor": string,"p_id": string,"p_to": string,"p_type": string }; Returns: undefined
                           },
"social_people":
{ Args: { "p_ids": (string)[] }; Returns: {
              "archetype": Json,"handle": string,"has_avatar": boolean,"id": string,"name": string,"updated_at": string
            }[]
                           },
"social_respond_request":
{ Args: { "p_accept": boolean,"p_from": string,"p_me": string }; Returns: string
                           },
"social_restore_friend":
{ Args: { "p_me": string,"p_them": string }; Returns: boolean
                           },
"social_search":
{ Args: { "p_limit": number,"p_me": string,"p_q": string }; Returns: {
              "id": string
            }[]
                           },
"social_send_request":
{ Args: { "p_me": string,"p_them": string }; Returns: string
                           },
"social_unfollow":
{ Args: { "p_me": string,"p_them": string }; Returns: undefined
                           },
"social_unfriend":
{ Args: { "p_me": string,"p_them": string }; Returns: undefined
                           }
          }
          Enums: {
            "media_type": "movie"|"tv"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "media_type": ["movie", "tv"]
          }
        }
} as const

