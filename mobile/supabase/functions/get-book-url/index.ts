
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Missing Supabase environment variables.");
    return respond({ error: "Server configuration error." }, 500);
  }

  const authorization = request.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return respond({ error: "Please sign in to read this book." }, 401);
  }

  const token = authorization.slice(7).trim();

  try {
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !user) {
      return respond(
        { error: "Your session is invalid. Please sign in again." },
        401,
      );
    }

    // Server-only client. Never expose this key to the mobile or web app.
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const body = await request.json().catch(() => null);
    const bookId = body?.bookId;

    if (typeof bookId !== "string" || !bookId.trim()) {
      return respond({ error: "A valid bookId is required." }, 400);
    }

    const { data: book, error: bookError } = await admin
      .from("books")
      .select("id, is_paid, price, currency, file_path")
      .eq("id", bookId)
      .maybeSingle();

    if (bookError) {
      console.error("Book lookup failed:", bookError.message);
      return respond({ error: "Could not verify this book." }, 500);
    }

    if (
      !book ||
      typeof book.file_path !== "string" ||
      !book.file_path.trim()
    ) {
      return respond({ error: "Book or PDF file not found." }, 404);
    }

    // Paid books require a verified purchase or admin grant.
    if (book.is_paid) {
      const { data: purchase, error: purchaseError } = await admin
        .from("purchases")
        .select("id")
        .eq("user_id", user.id)
        .eq("book_id", book.id)
        .in("status", ["granted", "completed"])
        .maybeSingle();

      if (purchaseError) {
        console.error("Purchase verification failed:", purchaseError.message);
        return respond({ error: "Could not verify book access." }, 500);
      }

      if (!purchase) {
        return respond(
          {
            error: "You need access to this paid book before reading it.",
            code: "PURCHASE_REQUIRED",
            bookId: book.id,
            price: book.price,
            currency: book.currency,
          },
          403,
        );
      }
    }

    // Create a short-lived URL from the private bucket.
    const { data: signed, error: signedError } = await admin.storage
      .from("book-files")
      .createSignedUrl(book.file_path, 300);

    if (signedError || !signed?.signedUrl) {
      console.error("Signed URL creation failed:", {
        message: signedError?.message,
        name: signedError?.name,
        bucket: "book-files",
        path: book.file_path,
      });

      return respond(
        {
          error: "Could not create a PDF link.",
          details: signedError?.message || "No signed URL was returned.",
        },
        500,
      );
    }

    return respond({
      bookId: book.id,
      signedUrl: signed.signedUrl,
      expiresIn: 300,
      isPaid: book.is_paid,
    });
  } catch (error) {
    console.error("get-book-url failed:", error);
    return respond({ error: "Unexpected server error." }, 500);
  }
});
