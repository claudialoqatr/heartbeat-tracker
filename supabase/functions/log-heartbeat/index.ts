import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Resolve user from API key
    const apiKey = req.headers.get("x-api-key");
    let userId: string | null = null;

    if (apiKey) {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("api_key", apiKey)
        .maybeSingle();
      if (data) userId = data.id;
    }

    if (req.method === "GET") {
      const url = new URL(req.url);
      const domain = url.searchParams.get("domain");
      if (!domain) {
        return new Response(JSON.stringify({ error: "domain required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let query = supabase.from("selectors").select("*").eq("domain", domain);
      if (userId) query = query.eq("user_id", userId);
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST: log a heartbeat
    if (!userId) {
      return new Response(JSON.stringify({ error: "Valid x-api-key header required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { doc_identifier, title, domain, url } = await req.json();
    if (!doc_identifier || !domain) {
      return new Response(JSON.stringify({ error: "doc_identifier and domain required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upsert document with user_id
    const upsertData: Record<string, unknown> = { doc_identifier, title, domain, user_id: userId };
    if (url) upsertData.url = url;
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .upsert(upsertData, { onConflict: "doc_identifier", ignoreDuplicates: false })
      .select("id")
      .single();
    if (docError) throw docError;

    // Insert heartbeat with user_id
    const { error: hbError } = await supabase
      .from("heartbeats")
      .insert({ document_id: doc.id, domain, user_id: userId });
    if (hbError) throw hbError;

    return new Response(JSON.stringify({ success: true, document_id: doc.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
