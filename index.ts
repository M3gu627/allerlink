// Supabase Edge Function: emails a business owner after an employee approves or rejects their application.
// Deploy:  supabase functions deploy notify-business
// Secrets: supabase secrets set RESEND_API_KEY=... FROM_EMAIL="AllerLink <noreply@your-domain.com>" SITE_URL=https://your-site
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // Only signed-in employees may trigger emails.
    const asCaller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: isEmployee } = await asCaller.rpc("is_employee");
    if (!isEmployee) throw new Error("Employees only");

    // The email follows the decision saved in the database, not anything the browser claims.
    const { application_id } = await req.json();
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: app, error } = await admin
      .from("applications")
      .select("business_name, contact_person, email, status")
      .eq("id", application_id)
      .single();
    if (error) throw error;
    if (app.status !== "approved" && app.status !== "rejected") throw new Error("Application is still pending");

    const site = Deno.env.get("SITE_URL") ?? "";
    const text =
      app.status === "approved"
        ? `Hi ${app.contact_person},\n\nGood news: ${app.business_name} has been approved on AllerLink.\n` +
          `You can now log in at ${site} using "Log in / Sign up" > Business, with the email and password you registered.\n\n` +
          `AllerLink Technologies`
        : `Hi ${app.contact_person},\n\nThank you for applying. Unfortunately we could not approve ${app.business_name} at this time.\n` +
          `Please contact us if you would like to know more.\n\nAllerLink Technologies`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("FROM_EMAIL"),
        to: app.email,
        subject: app.status === "approved" ? "Your AllerLink business account is approved" : "Your AllerLink application",
        text,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    return reply({ sent: true });
  } catch (e) {
    return reply({ error: String((e as Error).message ?? e) }, 400);
  }
});
