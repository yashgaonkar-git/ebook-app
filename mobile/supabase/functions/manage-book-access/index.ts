
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return respond({ error: "Method not allowed." }, 405);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !anonKey || !serviceKey) {
    return respond({ error: "Server configuration error." }, 500);
  }

  const authorization = request.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return respond({ error: "Please sign in." }, 401);
  }

  try {
    const token = authorization.slice(7).trim();

    const authClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !user) {
      return respond(
        { error: "Invalid session. Please sign in again." },
        401,
      );
    }

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify admin access on the server.
    const { data: adminRecord, error: adminError } = await admin
      .from("book_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (adminError) {
      console.error("Admin lookup failed:", adminError.message);
      return respond(
        { error: "Could not verify administrator access." },
        500,
      );
    }

    if (!adminRecord) {
      return respond(
        { error: "Administrator access required." },
        403,
      );
    }

    const body = await request.json().catch(() => null);
    const action = body?.action;

    // Admin: list pending access requests.
    if (action === "list") {
      const { data: requests, error: listError } = await admin
        .from("book_access_requests")
        .select(`
          id,
          user_id,
          book_id,
          status,
          created_at,
          books (
            title,
            price,
            currency
          )
        `)
        .eq("status", "pending")
        .order("created_at", { ascending: true });

      if (listError) {
        console.error("Request list failed:", listError.message);
        return respond(
          { error: "Could not load pending requests." },
          500,
        );
      }

      return respond({ requests: requests ?? [] });
    }

    const requestId = body?.requestId;

    if (
      typeof requestId !== "string" ||
      !requestId.trim() ||
      !["grant", "reject"].includes(action)
    ) {
      return respond(
        {
          error:
            "A valid requestId and grant/reject action are required.",
        },
        400,
      );
    }

    const { data: accessRequest, error: requestError } = await admin
      .from("book_access_requests")
      .select("id, user_id, book_id, status")
      .eq("id", requestId)
      .maybeSingle();

    if (requestError) {
      console.error("Request lookup failed:", requestError.message);
      return respond(
        { error: "Could not load the access request." },
        500,
      );
    }

    if (!accessRequest) {
      return respond({ error: "Access request not found." }, 404);
    }

    if (accessRequest.status !== "pending") {
      return respond(
        { error: "This request has already been reviewed." },
        409,
      );
    }

    const { data: book, error: bookError } = await admin
      .from("books")
      .select("id, is_paid")
      .eq("id", accessRequest.book_id)
      .maybeSingle();

    if (bookError || !book) {
      return respond(
        { error: "Could not verify the requested book." },
        500,
      );
    }

    if (!book.is_paid) {
      return respond(
        {
          error:
            "This book is free; no paid access grant is needed.",
        },
        400,
      );
    }

    // Claim the request so another admin cannot process it at the same time.
    // The temporary status is finalized below.
    const { data: claimedRequest, error: claimError } = await admin
      .from("book_access_requests")
      .update({
        status: "processing",
        reviewed_by: user.id,
      })
      .eq("id", requestId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (claimError || !claimedRequest) {
      return respond(
        {
          error:
            "This request may already be under review. Refresh and try again.",
        },
        409,
      );
    }

    if (action === "grant") {
      const { error: purchaseError } = await admin
        .from("purchases")
        .upsert(
          {
            user_id: accessRequest.user_id,
            book_id: accessRequest.book_id,
            status: "granted",
            granted_by: user.id,
          },
          { onConflict: "user_id,book_id" },
        );

      if (purchaseError) {
        console.error("Purchase grant failed:", purchaseError.message);

        await admin
          .from("book_access_requests")
          .update({
            status: "pending",
            reviewed_by: null,
          })
          .eq("id", requestId)
          .eq("status", "processing");

        return respond(
          { error: "Could not grant book access." },
          500,
        );
      }
    }

    const nextStatus = action === "grant" ? "granted" : "rejected";

    const { data: updatedRequest, error: updateError } = await admin
      .from("book_access_requests")
      .update({
        status: nextStatus,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq("id", requestId)
      .eq("status", "processing")
      .select("id, status")
      .maybeSingle();

    if (updateError || !updatedRequest) {
      console.error(
        "Request finalization failed:",
        updateError?.message,
      );

      return respond(
        {
          error:
            "The access request could not be finalized. Verify its status before retrying.",
        },
        500,
      );
    }

    return respond({
      success: true,
      requestId,
      status: nextStatus,
    });
  } catch (error) {
    console.error("manage-book-access failed:", error);
    return respond({ error: "Unexpected server error." }, 500);
  }
});
