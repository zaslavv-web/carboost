import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Role = "employee" | "manager" | "hrd" | "company_admin" | "superadmin";

interface CreateUserPayload {
  full_name: string;
  email: string;
  role: Role;
  company_id?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // 1. Verify caller is authenticated and is superadmin or company_admin
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(
        JSON.stringify({ error: "Не авторизовано" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: callerRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const roles = (callerRoles || []).map((r: any) => r.role);
    const isSuperadmin = roles.includes("superadmin");
    const isCompanyAdmin = roles.includes("company_admin");
    if (!isSuperadmin && !isCompanyAdmin) {
      return new Response(
        JSON.stringify({ error: "Недостаточно прав для создания пользователей" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Validate payload
    const body = (await req.json()) as CreateUserPayload;
    const full_name = (body.full_name || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const role = body.role;
    let company_id = body.company_id || null;

    if (!full_name || full_name.length < 2) {
      return new Response(JSON.stringify({ error: "Укажите фамилию и имя" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "Некорректный email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const allowedRoles: Role[] = [
      "employee",
      "manager",
      "hrd",
      "company_admin",
      "superadmin",
    ];
    if (!allowedRoles.includes(role)) {
      return new Response(JSON.stringify({ error: "Недопустимая роль" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (role === "superadmin" && !isSuperadmin) {
      return new Response(
        JSON.stringify({ error: "Только суперадмин может назначать роль superadmin" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // company_admin can only create users in their own company
    if (!isSuperadmin) {
      const { data: callerProfile } = await admin
        .from("profiles")
        .select("company_id")
        .eq("user_id", callerId)
        .maybeSingle();
      if (!callerProfile?.company_id) {
        return new Response(
          JSON.stringify({ error: "У вас не задана компания" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      company_id = callerProfile.company_id;
    }

    // 3. Send invite (creates auth user automatically)
    const redirectTo = `${new URL(req.url).origin.replace("/functions/v1/admin-create-user", "")}`;
    // Use the request's origin header for redirect when possible
    const origin = req.headers.get("origin") || req.headers.get("referer") || "";
    const cleanOrigin = origin ? origin.replace(/\/$/, "") : "";
    const finalRedirect = cleanOrigin ? `${cleanOrigin}/login` : undefined;

    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          full_name,
          requested_role: role,
          company_id,
        },
        redirectTo: finalRedirect,
      },
    );

    if (inviteErr || !invited.user) {
      console.error("inviteUserByEmail error:", inviteErr);
      const msg = inviteErr?.message || "Не удалось создать пользователя";
      const translated = msg.includes("already been registered") || msg.includes("already exists")
        ? "Пользователь с таким email уже существует"
        : msg;
      return new Response(JSON.stringify({ error: translated }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newUserId = invited.user.id;

    // 4. Create / update profile
    const { error: profileErr } = await admin.from("profiles").upsert(
      {
        user_id: newUserId,
        full_name,
        is_verified: true,
        requested_role: role,
        company_id,
      },
      { onConflict: "user_id" },
    );
    if (profileErr) console.error("profile upsert error:", profileErr);

    // 5. Assign role
    const { error: roleErr } = await admin
      .from("user_roles")
      .upsert({ user_id: newUserId, role }, { onConflict: "user_id,role" });
    if (roleErr) console.error("role insert error:", roleErr);

    return new Response(
      JSON.stringify({
        success: true,
        user_id: newUserId,
        message: "Пользователь создан и приглашение отправлено на email",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("admin-create-user error:", e);
    return new Response(JSON.stringify({ error: e.message || "Ошибка сервера" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
