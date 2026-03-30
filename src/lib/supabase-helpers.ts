import { supabase } from "@/integrations/supabase/client";

/**
 * Wrapper around supabase.functions.invoke that automatically adds
 * the x-requested-by header for CORS validation.
 */
export async function invokeEdgeFunction(
  functionName: string,
  options?: {
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  }
) {
  return supabase.functions.invoke(functionName, {
    ...options,
    headers: {
      "x-requested-by": "GradeAssist",
      ...options?.headers,
    },
  });
}

/**
 * Direct fetch to an edge function that returns a raw Response
 * (useful for streaming SSE responses).
 */
export async function streamEdgeFunction(
  functionName: string,
  body: Record<string, unknown>
): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  return fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session?.access_token}`,
      "apikey": supabaseAnonKey,
      "x-requested-by": "GradeAssist",
    },
    body: JSON.stringify(body),
  });
}
