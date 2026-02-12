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

    const apiKey = req.headers.get("x-api-key");

    // GET: fetch selectors (no email required)
    if (req.method === "GET") {
      let userId: string | null = null;
      if (apiKey) {
        const { data } = await supabase
          .from("profiles")
          .select("id")
          .eq("api_key", apiKey)
          .maybeSingle();
        if (data) userId = data.id;
      }

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

    // POST: log a heartbeat with identity verification
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Valid x-api-key header required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { doc_identifier, title, domain, url, email } = await req.json();
    if (!doc_identifier || !domain) {
      return new Response(JSON.stringify({ error: "doc_identifier and domain required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify identity: api_key + email must match the same profile
    if (!email) {
      return new Response(JSON.stringify({ error: "Identity mismatch. Heartbeat rejected." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profileMatch } = await supabase
      .from("profiles")
      .select("id")
      .eq("api_key", apiKey)
      .ilike("email", email)
      .maybeSingle();

    if (!profileMatch) {
      return new Response(JSON.stringify({ error: "Identity mismatch. Heartbeat rejected." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = profileMatch.id;

    // Upsert document
    const upsertData: Record<string, unknown> = { doc_identifier, title, domain, user_id: userId };
    if (url) upsertData.url = url;
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .upsert(upsertData, { onConflict: "doc_identifier", ignoreDuplicates: false })
      .select("id")
      .single();
    if (docError) throw docError;

    // Insert heartbeat
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
