/**
 * Diagnostic utilities for checking external integrations
 * This file can be imported in index.tsx to add diagnostic routes
 */

export async function checkTwelveDataConnection(apiKey: string | undefined): Promise<{ success: boolean; message: string }> {
  if (!apiKey) {
    return { success: false, message: 'TWELVE_DATA_API_KEY not configured' };
  }

  try {
    const response = await fetch(
      `https://api.twelvedata.com/time_series?symbol=AAPL&interval=1day&outputsize=1&apikey=${apiKey}`
    );
    
    const data = await response.json();
    
    if (data.status === 'error') {
      return { success: false, message: `Twelve Data API Error: ${data.message}` };
    }
    
    return { success: true, message: 'Twelve Data API connected successfully' };
  } catch (error) {
    return { success: false, message: `Failed to connect to Twelve Data: ${error}` };
  }
}

export async function checkStripeConnection(apiKey: string | undefined): Promise<{ success: boolean; message: string }> {
  if (!apiKey) {
    return { success: false, message: 'STRIPE_SECRET_KEY not configured (optional for demo mode)' };
  }

  try {
    const response = await fetch('https://api.stripe.com/v1/customers?limit=1', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    
    if (!response.ok) {
      return { success: false, message: `Stripe API Error: ${response.status}` };
    }
    
    return { success: true, message: 'Stripe API connected successfully' };
  } catch (error) {
    return { success: false, message: `Failed to connect to Stripe: ${error}` };
  }
}

export async function checkSupabaseConnection(): Promise<{ success: boolean; message: string }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseKey) {
    return { success: false, message: 'Supabase environment variables not configured' };
  }
  
  return { success: true, message: 'Supabase connected successfully' };
}
