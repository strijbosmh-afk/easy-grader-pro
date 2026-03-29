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
