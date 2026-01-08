import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

async function verify() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;

    if (!url || !key) {
        console.error("Missing credentials in .env");
        return;
    }

    console.log(`Connecting to ${url}...`);
    const supabase = createClient(url, key);

    // Try to select from user_context
    const { data, error } = await supabase.from("user_context").select("*").limit(1);

    if (error) {
        console.error("❌ Connection/Query Failed:", error.message);
        if (error.code === "42P01") {
            console.error("👉 CAUSE: The table 'user_context' does not exist.");
        }
    } else {
        console.log("✅ Connection Successful! Table 'user_context' exists.");
    }
}

verify();
