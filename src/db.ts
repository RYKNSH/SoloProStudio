import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

import { CONFIG } from "./config.js";

const SUPABASE_URL = CONFIG.SUPABASE.URL;
const SUPABASE_KEY = CONFIG.SUPABASE.KEY;

let supabase: any = null;

if (SUPABASE_URL && SUPABASE_KEY && SUPABASE_URL !== "your_supabase_url") {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log("[DB] Supabase Client Initialized");
} else {
    console.warn("[DB] Supabase credentials missing. Persistent context will be disabled.");
}

export type UserContext = {
    user_id: string;
    context: string;
    updated_at: string;
};

export async function getUserContext(userId: string): Promise<string> {
    if (!supabase) return "";

    try {
        const { data, error } = await supabase
            .from("user_context")
            .select("context")
            .eq("user_id", userId)
            .single();

        if (error) {
            if (error.code !== "PGRST116") { // 116 = No rows returned (not strictly an error for us)
                console.error("[DB] Error fetching context:", error.message);
            }
            return "";
        }

        return data?.context || "";
    } catch (e) {
        console.error("[DB] Unexpected error:", e);
        return "";
    }
}

export async function saveUserContext(userId: string, context: string): Promise<boolean> {
    if (!supabase) return false;

    try {
        const { error } = await supabase
            .from("user_context")
            .upsert({
                user_id: userId,
                context: context,
                updated_at: new Date().toISOString()
            });

        if (error) {
            console.error("[DB] Error saving context:", error.message);
            return false;
        }
        return true;
    } catch (e) {
        console.error("[DB] Unexpected save error:", e);
        return false;
    }
}
