export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      purchases: {
        Row: {
          id: string;
          stripe_session_id: string;
          stripe_payment_intent_id: string | null;
          amount_paid_cents: number;
          cells_purchased: number;
          cell_indices: number[];
          photo_uploaded: boolean;
          photo_key: string | null;
          photo_url: string | null;
          created_at: string;
          uploaded_at: string | null;
        };
        Insert: {
          id?: string;
          stripe_session_id: string;
          stripe_payment_intent_id?: string | null;
          amount_paid_cents: number;
          cells_purchased: number;
          cell_indices?: number[];
          photo_uploaded?: boolean;
          photo_key?: string | null;
          photo_url?: string | null;
          created_at?: string;
          uploaded_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["purchases"]["Insert"]>;
      };
    };
    Views: {
      mosaic_stats: {
        Row: {
          total_purchases: number;
          total_cells_filled: number;
          total_revenue_usd: number;
        };
      };
    };
  };
}
