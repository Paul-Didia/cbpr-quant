import { Hono } from "npm:hono";
import type { Context } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.ts";
import { checkTwelveDataConnection, checkStripeConnection, checkSupabaseConnection } from "./diagnostic.ts";

const app = new Hono();

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "apikey"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Helper function to verify user authentication
async function verifyUser(authHeader: string | null) {
  if (!authHeader) {
    return { error: 'No authorization header', user: null };
  }

  const token = authHeader.replace('Bearer ', '');
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  );

  const { data: { user }, error } = await supabaseClient.auth.getUser(token);
  
  if (error || !user) {
    return { error: 'Unauthorized', user: null };
  }

  return { error: null, user };
}

function getTwelveDataApiKey() {
  const apiKey = Deno.env.get('TWELVE_DATA_API_KEY');
  if (!apiKey) {
    throw new Error('Twelve Data API key not configured');
  }
  return apiKey;
}

type SubscriptionTier = 'free' | 'pro' | 'quant';

type UserProfile = {
  email?: string;
  name?: string;
  subscription?: SubscriptionTier;
  memberSince?: string;
  stripeCustomerId?: string;
};

async function getUserProfile(userId: string): Promise<UserProfile | null> {
  return (await kv.get(`user:${userId}:profile`)) as UserProfile | null;
}

async function getUserSubscription(userId: string): Promise<SubscriptionTier> {
  const profile = await getUserProfile(userId);
  return profile?.subscription || 'free';
}

function isAssetAllowed(subscription: SubscriptionTier, type?: string) {
  const normalized = (type || '').toLowerCase();

  if (subscription === 'quant') return true;

  if (subscription === 'pro') {
    return normalized !== 'forex' && normalized !== 'crypto';
  }

  // free
  return normalized === 'common stock' || normalized === 'stock' || normalized === 'equity';
}

async function fetchTwelveDataJson<T = any>(url: string): Promise<T> {
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data?.status === 'error') {
    throw new Error(data?.message || `Twelve Data request failed`);
  }

  return data as T;
}

// Health check endpoint
app.get("/make-server-819c6d9b/health", (c: Context) => {
  return c.json({ status: "ok" });
});

// Diagnostic endpoint
app.get("/make-server-819c6d9b/diagnostic", async (c: Context) => {
  const twelveDataCheck = await checkTwelveDataConnection(Deno.env.get('TWELVE_DATA_API_KEY'));
  const stripeCheck = await checkStripeConnection(Deno.env.get('STRIPE_SECRET_KEY'));
  const supabaseCheck = await checkSupabaseConnection();

  return c.json({
    timestamp: new Date().toISOString(),
    checks: {
      supabase: supabaseCheck,
      twelveData: twelveDataCheck,
      stripe: stripeCheck,
    },
    environment: {
      hasSupabaseUrl: !!Deno.env.get('SUPABASE_URL'),
      hasSupabaseAnonKey: !!Deno.env.get('SUPABASE_ANON_KEY'),
      hasSupabaseServiceRoleKey: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      hasTwelveDataApiKey: !!Deno.env.get('TWELVE_DATA_API_KEY'),
      hasStripeSecretKey: !!Deno.env.get('STRIPE_SECRET_KEY'),
    }
  });
});

// ===== AUTH ROUTES =====

// Sign up
app.post("/make-server-819c6d9b/auth/signup", async (c: Context) => {
  console.log("SIGNUP ROUTE HIT");

  try {
    const { email, password, name } = await c.req.json();
    console.log("SIGNUP PAYLOAD:", { email, name });

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name },
      email_confirm: true,
    });

    if (error) {
      console.log('Signup error:', error);
      return c.json({ error: error.message }, 400);
    }

    await kv.set(`user:${data.user.id}:profile`, {
      email,
      name,
      subscription: 'free',
      memberSince: new Date().toISOString(),
    });

    return c.json({ user: data.user });

  } catch (error) {
    console.log('Signup error:', error);
    return c.json({ error: 'Signup failed' }, 500);
  }
});

// Get user profile
app.get("/make-server-819c6d9b/auth/profile", async (c: Context) => {
  console.log('Profile request received');
  const authHeader = c.req.header('Authorization');
  console.log('Auth header present:', !!authHeader);
  
  const { error, user } = await verifyUser(authHeader);
  
  if (error || !user) {
    console.log('Auth verification failed:', error);
    return c.json({ error: 'Unauthorized' }, 401);
  }

  console.log('User verified:', user.id);
  let profile = await kv.get(`user:${user.id}:profile`);
  console.log('Profile from KV:', profile);
  
  if (!profile) {
    // User exists in Auth but not in KV store - create profile
    console.log(`Creating missing profile for user ${user.id}`);
    profile = {
      email: user.email || '',
      name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
      subscription: 'free',
      memberSince: new Date().toISOString(),
    };
    console.log('New profile to be saved:', profile);
    await kv.set(`user:${user.id}:profile`, profile);
    console.log('Profile saved successfully');
  }

  console.log('Returning profile:', profile);
  return c.json({ profile });
});

// ===== FAVORITES ROUTES =====

// Get user favorites
app.get("/make-server-819c6d9b/favorites", async (c: Context) => {
  const { error, user } = await verifyUser(c.req.header('Authorization'));
  
  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const favorites = ((await kv.get(`user:${user.id}:favorites`)) as string[] | null) || [];
  return c.json({ favorites });
});

// Add favorite
app.post("/make-server-819c6d9b/favorites", async (c: Context) => {
  const { error, user } = await verifyUser(c.req.header('Authorization'));
  
  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { assetId } = await c.req.json();
  const favorites = ((await kv.get(`user:${user.id}:favorites`)) as string[] | null) || [];
  
  if (!favorites.includes(assetId)) {
    if (favorites.length >= 15) {
      return c.json(
        {
          error: "Maximum 15 favorites allowed",
          limit: 15,
          currentCount: favorites.length,
        },
        400,
      );
    }

    favorites.push(assetId);
    await kv.set(`user:${user.id}:favorites`, favorites);
  }

  return c.json({ favorites });
});

// Remove favorite
app.delete("/make-server-819c6d9b/favorites/:assetId", async (c: Context) => {
  const { error, user } = await verifyUser(c.req.header('Authorization'));
  
  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const assetId = c.req.param('assetId');
  const favorites = ((await kv.get(`user:${user.id}:favorites`)) as string[] | null) || [];
  const updatedFavorites = favorites.filter((id: string) => id !== assetId);
  
  await kv.set(`user:${user.id}:favorites`, updatedFavorites);

  return c.json({ favorites: updatedFavorites });
});

// ===== TWELVE DATA API ROUTES =====

// Get asset data from Twelve Data
app.get("/make-server-819c6d9b/assets/:symbol", async (c: Context) => {
  const { error, user } = await verifyUser(c.req.header('Authorization'));
  
  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const symbol = c.req.param('symbol');
  const apiKey = Deno.env.get('TWELVE_DATA_API_KEY');

  if (!apiKey) {
    return c.json({ error: 'Twelve Data API key not configured' }, 500);
  }

  try {
    // Fetch real-time quote
    const quoteResponse = await fetch(
      `https://api.twelvedata.com/quote?symbol=${symbol}&apikey=${apiKey}`
    );
    const quoteData = await quoteResponse.json();

    if (quoteData.status === 'error') {
      return c.json({ error: quoteData.message }, 400);
    }

    // Fetch logo
    const logoResponse = await fetch(
      `https://api.twelvedata.com/logo?symbol=${symbol}&apikey=${apiKey}`
    );
    const logoData = await logoResponse.json();

    return c.json({
      quote: quoteData,
      logo: logoData.url || null,
    });
  } catch (error) {
    console.log('Twelve Data API error:', error);
    return c.json({ error: 'Failed to fetch asset data' }, 500);
  }
});

// Search assets from Twelve Data
app.get("/make-server-819c6d9b/assets/search/:query", async (c: Context) => {
  const { error, user } = await verifyUser(c.req.header('Authorization'));
  
  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const query = c.req.param('query');
  const apiKey = Deno.env.get('TWELVE_DATA_API_KEY');

  if (!apiKey) {
    return c.json({ error: 'Twelve Data API key not configured' }, 500);
  }

  try {
    const response = await fetch(
      `https://api.twelvedata.com/symbol_search?symbol=${query}&apikey=${apiKey}`
    );
    const data = await response.json();

    return c.json(data);
  } catch (error) {
    console.log('Twelve Data search error:', error);
    return c.json({ error: 'Failed to search assets' }, 500);
  }
});

// ===== STRIPE SUBSCRIPTION ROUTES =====

// Get user subscription status from Stripe
app.get("/make-server-819c6d9b/subscription", async (c: Context) => {
  const { error, user } = await verifyUser(c.req.header('Authorization'));
  
  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');

  if (!stripeKey) {
    // If no Stripe key, return subscription from profile
    const profile = await getUserProfile(user.id);
    return c.json({ subscription: profile?.subscription || 'free' });
  }

  try {
    // Get user's Stripe customer ID from profile
    const profile = await getUserProfile(user.id);
    const stripeCustomerId = profile?.stripeCustomerId;

    if (!stripeCustomerId) {
      return c.json({ subscription: 'free' });
    }

    // Fetch subscription from Stripe
    const response = await fetch(
      `https://api.stripe.com/v1/customers/${stripeCustomerId}/subscriptions`,
      {
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
        },
      }
    );

    const data = await response.json();

    if (data.data && data.data.length > 0) {
      const subscription = data.data[0];
      
      // Map Stripe product/price to our subscription tiers
      let tier: SubscriptionTier = 'free';
      if (subscription.status === 'active') {
        // You'll need to map your Stripe price IDs to tiers
        // This is a placeholder logic
        const metadata = subscription.items.data[0]?.price?.metadata;
        tier = (metadata?.tier as SubscriptionTier) || 'pro';
      }

      // Update profile with latest subscription
      await kv.set(`user:${user.id}:profile`, {
        ...profile,
        subscription: tier,
      });

      return c.json({ subscription: tier, stripeData: subscription });
    }

    return c.json({ subscription: 'free' });
  } catch (error) {
    console.log('Stripe subscription error:', error);
    return c.json({ error: 'Failed to fetch subscription' }, 500);
  }
});

// Update subscription (for demo/testing)
app.post("/make-server-819c6d9b/subscription", async (c: Context) => {
  const { error, user } = await verifyUser(c.req.header('Authorization'));
  
  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { subscription } = await c.req.json();
  const profile = await getUserProfile(user.id);
  
  await kv.set(`user:${user.id}:profile`, {
    ...profile,
    subscription,
  });

  return c.json({ subscription });
});

Deno.serve(app.fetch);