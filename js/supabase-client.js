// ==========================================================================
// MAKTABA — CLIENT SUPABASE
// ==========================================================================
// Ce fichier initialise la connexion entre Maktaba et la base de données Supabase.
// La clé "anon" est publique par nature : elle est protégée par les règles RLS,
// pas par le secret de cette clé.

let SUPABASE_URL = "https://lgeuhyculypnfmiyvpxd.supabase.co";
let SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnZXVoeWN1bHlwbmZtaXl2cHhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MzgwMjgsImV4cCI6MjEwNDIxNDAyOH0.igv5w6H8v3CS4_it6iiVeyiUd5qdzFXL7QTuro3bgFM";

let supabaseClient = null;

// Le script "@supabase/supabase-js" doit être chargé AVANT ce fichier
// (il expose window.supabase). On vérifie avant d'initialiser pour éviter
// une erreur bloquante si le CDN est injoignable (réseau coupé, adblock...).
if (typeof window.supabase !== "undefined") {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
    console.error(
        "Maktaba : la librairie Supabase n'a pas pu être chargée. " +
        "Vérifiez votre connexion internet ou que le CDN jsdelivr n'est pas bloqué."
    );
}
