import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://wnqfugrbqouvoijspwza.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InducWZ1Z3JicW91dm9panNwd3phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1ODgxOTYsImV4cCI6MjEwNjE2NDE5Nn0.qhCyS2kmmyDtdLhM1EUzFI2TENGoxUSsd_o2aU14GZE";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
