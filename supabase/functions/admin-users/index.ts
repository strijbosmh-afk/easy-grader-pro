import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify caller is authenticated
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client with caller's JWT to check identity
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller is admin using service role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: isAdmin } = await adminClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, targetUserId } = body;

    if (!action) {
      return new Response(JSON.stringify({ error: "Missing action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // List all users with their ban status
    if (action === "list") {
      const { data: { users }, error } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      if (error) throw error;
      const statuses = users.map((u) => ({
        id: u.id,
        banned: !!u.banned_until && new Date(u.banned_until) > new Date(),
        banned_until: u.banned_until,
        last_sign_in: u.last_sign_in_at,
      }));
      return new Response(JSON.stringify({ users: statuses }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "Missing targetUserId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent self-action
    if (targetUserId === caller.id) {
      return new Response(JSON.stringify({ error: "Cannot modify your own account" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "ban") {
      const { data, error } = await adminClient.auth.admin.updateUserById(targetUserId, {
        ban_duration: "876000h", // ~100 years
      });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, message: "User deactivated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "unban") {
      const { data, error } = await adminClient.auth.admin.updateUserById(targetUserId, {
        ban_duration: "none",
      });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, message: "User reactivated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const { error } = await adminClient.auth.admin.deleteUser(targetUserId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, message: "User deleted" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use: ban, unban, delete" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("admin-users error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
