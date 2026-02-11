import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (req.method === "GET") {
      // Return selectors for a given domain
      const url = new URL(req.url);
      const domain = url.searchParams.get("domain");
      if (!domain) {
        return new Response(JSON.stringify({ error: "domain required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data, error } = await supabase.from("selectors").select("*").eq("domain", domain).maybeSingle();
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST: log a heartbeat
    const { doc_identifier, title, domain } = await req.json();
    if (!doc_identifier || !domain) {
      return new Response(JSON.stringify({ error: "doc_identifier and domain required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upsert document
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .upsert({ doc_identifier, title, domain }, { onConflict: "doc_identifier", ignoreDuplicates: false })
      .select("id")
      .single();
    if (docError) throw docError;

    // Insert heartbeat
    const { error: hbError } = await supabase.from("heartbeats").insert({ document_id: doc.id, domain });
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
