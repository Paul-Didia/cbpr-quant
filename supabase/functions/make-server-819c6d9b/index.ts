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
  "*",
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

// Delete user account
const handleDeleteAccount = async (c: Context) => {
  console.log('Delete account request received');

  const { error, user } = await verifyUser(c.req.header('Authorization'));

  if (error || !user) {
    console.log('Delete account auth verification failed:', error);
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    await kv.del(`user:${user.id}:profile`);
    await kv.del(`user:${user.id}:favorites`);

    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(user.id);

    if (deleteUserError) {
      console.log('Delete account auth error:', deleteUserError);
      return c.json({ error: deleteUserError.message }, 400);
    }

    console.log('Account deleted successfully:', user.id);
    return c.json({ success: true });
  } catch (error) {
    console.log('Delete account error:', error);
    return c.json({ error: 'Failed to delete account' }, 500);
  }
};

app.post("/make-server-819c6d9b/auth/delete-account", handleDeleteAccount);

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

// ===== GROUPS ROUTES =====

app.get("/make-server-819c6d9b/groups", async (c: Context) => {
  const { error, user } = await verifyUser(c.req.header('Authorization'));

  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const { data: createdGroups, error: createdGroupsError } = await supabase
      .from('groups')
      .select('id, name, created_by')
      .eq('created_by', user.id);

    if (createdGroupsError) {
      console.log('Created groups fetch error:', createdGroupsError);
      return c.json({ error: createdGroupsError.message }, 500);
    }

    const { data: memberships, error: membershipsError } = await supabase
      .from('group_members')
      .select('group_id, role')
      .eq('user_id', user.id);

    if (membershipsError) {
      console.log('Memberships fetch warning:', membershipsError);
    }

    const membershipRows = membershipsError ? [] : memberships || [];
    const createdGroupIds = (createdGroups || []).map((group: any) => group.id);
    const membershipGroupIds = membershipRows.map((membership: any) => membership.group_id);
    const groupIds = Array.from(new Set([...createdGroupIds, ...membershipGroupIds])).filter(Boolean);

    if (groupIds.length === 0) {
      return c.json({ groups: [] });
    }

    const { data: groupRows, error: groupRowsError } = await supabase
      .from('groups')
      .select('id, name, created_by')
      .in('id', groupIds);

    if (groupRowsError) {
      console.log('Groups fetch error:', groupRowsError);
      return c.json({ error: groupRowsError.message }, 500);
    }

    const { data: memberRows, error: memberRowsError } = await supabase
      .from('group_members')
      .select('group_id, user_id, role')
      .in('group_id', groupIds);

    if (memberRowsError) {
      console.log('Members fetch warning:', memberRowsError);
    }

    const safeMemberRows = memberRowsError ? [] : memberRows || [];

    const groups = (groupRows || []).map((group: any) => {
      const membership = membershipRows.find((row: any) => row.group_id === group.id);
      const userRole = group.created_by === user.id || membership?.role === 'owner' ? 'owner' : 'member';
      const members = safeMemberRows
        .filter((member: any) => member.group_id === group.id)
        .map((member: any) => ({
          id: member.user_id,
          label: member.user_id === user.id ? user.email || 'Utilisateur' : `Membre ${String(member.user_id).slice(0, 6)}`,
          role: member.role === 'owner' ? 'owner' : 'member',
        }));

      return {
        id: group.id,
        name: group.name,
        role: userRole,
        members: members.length > 0
          ? members
          : [
              {
                id: user.id,
                label: user.email || 'Utilisateur',
                role: userRole,
              },
            ],
      };
    });

    return c.json({ groups });
  } catch (error) {
    console.log('Groups route error:', error);
    return c.json({ error: 'Failed to fetch groups' }, 500);
  }
});

app.post("/make-server-819c6d9b/groups", async (c: Context) => {
  const { error, user } = await verifyUser(c.req.header('Authorization'));

  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const { name, password } = await c.req.json();
    const trimmedName = String(name || '').trim();
    const trimmedPassword = String(password || '').trim();

    if (!trimmedName || !trimmedPassword) {
      return c.json({ error: 'Group name and password are required' }, 400);
    }

    const groupId = crypto.randomUUID();

    const { data: group, error: groupError } = await supabase
      .from('groups')
      .insert({
        id: groupId,
        name: trimmedName,
        password: trimmedPassword,
        created_by: user.id,
      })
      .select('id, name, created_by')
      .single();

    if (groupError) {
      console.log('Create group error:', groupError);
      return c.json({ error: groupError.message }, 500);
    }

    const { error: memberError } = await supabase
      .from('group_members')
      .insert({
        group_id: groupId,
        user_id: user.id,
        role: 'owner',
      });

    if (memberError) {
      console.log('Create group member error:', memberError);
      await supabase.from('groups').delete().eq('id', groupId);
      return c.json({ error: memberError.message }, 500);
    }

    return c.json({
      group: {
        id: group.id,
        name: group.name,
        role: 'owner',
        members: [
          {
            id: user.id,
            label: user.email || 'Utilisateur',
            role: 'owner',
          },
        ],
      },
    });
  } catch (error) {
    console.log('Create group route error:', error);
    return c.json({ error: 'Failed to create group' }, 500);
  }
});

app.post("/make-server-819c6d9b/groups/join", async (c: Context) => {
  const { error, user } = await verifyUser(c.req.header('Authorization'));

  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const { groupId, password } = await c.req.json();
    const groupIdentifier = String(groupId || '').trim();
    const trimmedPassword = String(password || '').trim();

    if (!groupIdentifier || !trimmedPassword) {
      return c.json({ error: 'Group identifier and password are required' }, 400);
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(groupIdentifier);

    let groupQuery = supabase
      .from('groups')
      .select('id, name, created_by')
      .eq('password', trimmedPassword);

    groupQuery = isUuid
      ? groupQuery.eq('id', groupIdentifier)
      : groupQuery.eq('name', groupIdentifier);

    const { data: group, error: groupError } = await groupQuery.maybeSingle();

    if (groupError) {
      console.log('Find group error:', groupError);
      return c.json({ error: groupError.message }, 500);
    }

    if (!group?.id) {
      return c.json({ error: 'Group not found or invalid password' }, 404);
    }

    const role = group.created_by === user.id ? 'owner' : 'member';

    const { error: memberError } = await supabase
      .from('group_members')
      .upsert({
        group_id: group.id,
        user_id: user.id,
        role,
      }, {
        onConflict: 'group_id,user_id',
      });

    if (memberError) {
      console.log('Join group error:', memberError);
      return c.json({ error: memberError.message }, 500);
    }

    const { data: memberRows, error: memberRowsError } = await supabase
      .from('group_members')
      .select('group_id, user_id, role')
      .eq('group_id', group.id);

    const members = memberRowsError
      ? [
          {
            id: user.id,
            label: user.email || 'Utilisateur',
            role,
          },
        ]
      : (memberRows || []).map((member: any) => ({
          id: member.user_id,
          label: member.user_id === user.id ? user.email || 'Utilisateur' : `Membre ${String(member.user_id).slice(0, 6)}`,
          role: member.role === 'owner' ? 'owner' : 'member',
        }));

    return c.json({
      group: {
        id: group.id,
        name: group.name,
        role,
        members,
      },
    });
  } catch (error) {
    console.log('Join group route error:', error);
    return c.json({ error: 'Failed to join group' }, 500);
  }
});

app.delete("/make-server-819c6d9b/groups/:groupId/members/:userId", async (c: Context) => {
  const { error, user } = await verifyUser(c.req.header('Authorization'));

  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const groupId = c.req.param('groupId');
    const targetUserId = c.req.param('userId');

    if (!groupId || !targetUserId) {
      return c.json({ error: 'Group id and user id are required' }, 400);
    }

    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id, created_by')
      .eq('id', groupId)
      .maybeSingle();

    if (groupError) {
      console.log('Find group for member delete error:', groupError);
      return c.json({ error: groupError.message }, 500);
    }

    if (!group?.id) {
      return c.json({ error: 'Group not found' }, 404);
    }

    const isOwner = group.created_by === user.id;
    const isLeavingSelf = targetUserId === user.id;

    if (!isOwner && !isLeavingSelf) {
      return c.json({ error: 'Only group owner can remove another member' }, 403);
    }

    if (isOwner && isLeavingSelf) {
      const { error: deleteMembersError } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId);

      if (deleteMembersError) {
        console.log('Delete group members error:', deleteMembersError);
        return c.json({ error: deleteMembersError.message }, 500);
      }

      const { error: deleteGroupError } = await supabase
        .from('groups')
        .delete()
        .eq('id', groupId);

      if (deleteGroupError) {
        console.log('Delete group error:', deleteGroupError);
        return c.json({ error: deleteGroupError.message }, 500);
      }

      return c.json({ success: true, deletedGroup: true });
    }

    const { error: deleteMemberError } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', targetUserId);

    if (deleteMemberError) {
      console.log('Delete group member error:', deleteMemberError);
      return c.json({ error: deleteMemberError.message }, 500);
    }

    return c.json({ success: true });
  } catch (error) {
    console.log('Delete group member route error:', error);
    return c.json({ error: 'Failed to remove group member' }, 500);
  }
});

// ===== GROUP ASSETS ROUTES =====

async function ensureGroupAccess(groupId: string, userId: string) {
  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('id, created_by')
    .eq('id', groupId)
    .maybeSingle();

  if (groupError) {
    return { error: groupError.message, group: null, hasAccess: false };
  }

  if (!group?.id) {
    return { error: 'Group not found', group: null, hasAccess: false };
  }

  if (group.created_by === userId) {
    return { error: null, group, hasAccess: true };
  }

  const { data: membership, error: membershipError } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();

  if (membershipError) {
    return { error: membershipError.message, group, hasAccess: false };
  }

  return { error: null, group, hasAccess: !!membership?.group_id };
}

app.get("/make-server-819c6d9b/groups/:groupId/assets", async (c: Context) => {
  const { error, user } = await verifyUser(c.req.header('Authorization'));

  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const groupId = c.req.param('groupId');
    const access = await ensureGroupAccess(groupId, user.id);

    if (access.error) {
      return c.json({ error: access.error }, access.error === 'Group not found' ? 404 : 500);
    }

    if (!access.hasAccess) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const { data: assets, error: assetsError } = await supabase
      .from('group_assets')
      .select('id, group_id, symbol, name, asset_type, logo, added_by, added_at')
      .eq('group_id', groupId)
      .order('added_at', { ascending: false });

    if (assetsError) {
      console.log('Group assets fetch error:', assetsError);
      return c.json({ error: assetsError.message }, 500);
    }

    return c.json({ assets: assets || [] });
  } catch (error) {
    console.log('Group assets route error:', error);
    return c.json({ error: 'Failed to fetch group assets' }, 500);
  }
});

app.post("/make-server-819c6d9b/groups/:groupId/assets", async (c: Context) => {
  const { error, user } = await verifyUser(c.req.header('Authorization'));

  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const groupId = c.req.param('groupId');
    const access = await ensureGroupAccess(groupId, user.id);

    if (access.error) {
      return c.json({ error: access.error }, access.error === 'Group not found' ? 404 : 500);
    }

    if (!access.hasAccess) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const { symbol, name, assetType, logo } = await c.req.json();
    const trimmedSymbol = String(symbol || '').trim();

    if (!trimmedSymbol) {
      return c.json({ error: 'Asset symbol is required' }, 400);
    }

    const { data: asset, error: assetError } = await supabase
      .from('group_assets')
      .upsert({
        group_id: groupId,
        symbol: trimmedSymbol,
        name: name ? String(name) : null,
        asset_type: assetType ? String(assetType) : null,
        logo: logo ? String(logo) : null,
        added_by: user.id,
      }, {
        onConflict: 'group_id,symbol',
      })
      .select('id, group_id, symbol, name, asset_type, logo, added_by, added_at')
      .single();

    if (assetError) {
      console.log('Add group asset error:', assetError);
      return c.json({ error: assetError.message }, 500);
    }

    return c.json({ asset });
  } catch (error) {
    console.log('Add group asset route error:', error);
    return c.json({ error: 'Failed to add group asset' }, 500);
  }
});

app.delete("/make-server-819c6d9b/groups/:groupId/assets/:symbol", async (c: Context) => {
  const { error, user } = await verifyUser(c.req.header('Authorization'));

  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const groupId = c.req.param('groupId');
    const symbol = decodeURIComponent(c.req.param('symbol') || '').trim();
    const access = await ensureGroupAccess(groupId, user.id);

    if (access.error) {
      return c.json({ error: access.error }, access.error === 'Group not found' ? 404 : 500);
    }

    if (!access.hasAccess) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    if (!symbol) {
      return c.json({ error: 'Asset symbol is required' }, 400);
    }

    const { error: deleteAssetError } = await supabase
      .from('group_assets')
      .delete()
      .eq('group_id', groupId)
      .eq('symbol', symbol);

    if (deleteAssetError) {
      console.log('Delete group asset error:', deleteAssetError);
      return c.json({ error: deleteAssetError.message }, 500);
    }

    return c.json({ success: true });
  } catch (error) {
    console.log('Delete group asset route error:', error);
    return c.json({ error: 'Failed to remove group asset' }, 500);
  }
});

// ===== GROUP MESSAGES ROUTES =====

app.get("/make-server-819c6d9b/groups/:groupId/messages", async (c: Context) => {
  const { error, user } = await verifyUser(c.req.header('Authorization'));

  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const groupId = c.req.param('groupId');
    const roomId = String(c.req.query('roomId') || 'general').trim() || 'general';
    const access = await ensureGroupAccess(groupId, user.id);

    if (access.error) {
      return c.json({ error: access.error }, access.error === 'Group not found' ? 404 : 500);
    }

    if (!access.hasAccess) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const { data: messages, error: messagesError } = await supabase
      .from('group_messages')
      .select('id, group_id, room_id, message, user_id, user_email, created_at')
      .eq('group_id', groupId)
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(100);

    if (messagesError) {
      console.log('Group messages fetch error:', messagesError);
      return c.json({ error: messagesError.message }, 500);
    }

    return c.json({ messages: messages || [] });
  } catch (error) {
    console.log('Group messages route error:', error);
    return c.json({ error: 'Failed to fetch group messages' }, 500);
  }
});

app.post("/make-server-819c6d9b/groups/:groupId/messages", async (c: Context) => {
  const { error, user } = await verifyUser(c.req.header('Authorization'));

  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const groupId = c.req.param('groupId');
    const access = await ensureGroupAccess(groupId, user.id);

    if (access.error) {
      return c.json({ error: access.error }, access.error === 'Group not found' ? 404 : 500);
    }

    if (!access.hasAccess) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const { roomId, message } = await c.req.json();
    const safeRoomId = String(roomId || 'general').trim() || 'general';
    const safeMessage = String(message || '').trim();

    if (!safeMessage) {
      return c.json({ error: 'Message is required' }, 400);
    }

    if (safeMessage.length > 1000) {
      return c.json({ error: 'Message is too long' }, 400);
    }

    const { data: insertedMessage, error: insertError } = await supabase
      .from('group_messages')
      .insert({
        group_id: groupId,
        room_id: safeRoomId,
        message: safeMessage,
        user_id: user.id,
        user_email: user.email || null,
      })
      .select('id, group_id, room_id, message, user_id, user_email, created_at')
      .single();

    if (insertError) {
      console.log('Send group message error:', insertError);
      return c.json({ error: insertError.message }, 500);
    }

    return c.json({ message: insertedMessage });
  } catch (error) {
    console.log('Send group message route error:', error);
    return c.json({ error: 'Failed to send group message' }, 500);
  }
});


// ===== ORGANIZATIONS ROUTES =====

function getMaxUsersForPlan(plan: string) {
  if (plan === 'trader') return 1;
  if (plan === 'fund') return 20;
  return 999999;
}

async function buildOrganizationDashboard(organizationId: string) {
  const { data: organization, error: organizationError } = await supabase
    .from('organizations')
    .select('id, name, subscription_plan, max_users, subscription_active, stripe_customer_id, stripe_subscription_id, created_at')
    .eq('id', organizationId)
    .maybeSingle();

  if (organizationError) {
    throw new Error(organizationError.message);
  }

  if (!organization?.id) {
    throw new Error('Organization not found');
  }

  const { data: members, error: membersError } = await supabase
    .from('organization_members')
    .select('id, organization_id, user_id, email, role, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });

  if (membersError) {
    throw new Error(membersError.message);
  }

  const safeMembers = members || [];

  return {
    organization,
    members: safeMembers,
    used_users: safeMembers.length,
    max_users: organization.max_users || getMaxUsersForPlan(organization.subscription_plan),
  };
}

app.post("/make-server-819c6d9b/organizations/login", async (c: Context) => {
  try {
    const { name, password } = await c.req.json();
    const organizationName = String(name || '').trim();
    const organizationPassword = String(password || '').trim();

    if (!organizationName || !organizationPassword) {
      return c.json({ error: 'Organization name and password are required' }, 400);
    }

    const { data: organization, error: organizationError } = await supabase
      .from('organizations')
      .select('id, subscription_active')
      .eq('name', organizationName)
      .eq('password', organizationPassword)
      .maybeSingle();

    if (organizationError) {
      console.log('Enterprise login error:', organizationError);
      return c.json({ error: organizationError.message }, 500);
    }

    if (!organization?.id) {
      return c.json({ error: 'Invalid organization credentials' }, 401);
    }

    if (!organization.subscription_active) {
      return c.json({ error: 'Organization subscription inactive' }, 403);
    }

    const dashboard = await buildOrganizationDashboard(organization.id);
    return c.json(dashboard);
  } catch (error) {
    console.log('Enterprise login route error:', error);
    return c.json({ error: 'Failed to login organization' }, 500);
  }
});

app.get("/make-server-819c6d9b/organizations/:organizationId", async (c: Context) => {
  const { error, user } = await verifyUser(c.req.header('Authorization'));

  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const organizationId = c.req.param('organizationId');

    const { data: membership, error: membershipError } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('email', String(user.email || '').toLowerCase())
      .maybeSingle();

    if (membershipError) {
      console.log('Organization dashboard membership error:', membershipError);
      return c.json({ error: membershipError.message }, 500);
    }

    if (!membership?.id) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const dashboard = await buildOrganizationDashboard(organizationId);
    return c.json(dashboard);
  } catch (error) {
    console.log('Organization dashboard route error:', error);
    return c.json({ error: 'Failed to fetch organization dashboard' }, 500);
  }
});

app.post("/make-server-819c6d9b/organizations/:organizationId/members", async (c: Context) => {
  try {
    const organizationId = c.req.param('organizationId');
    const { email, role } = await c.req.json();
    const safeEmail = String(email || '').trim().toLowerCase();
    const safeRole = role === 'admin' ? 'admin' : 'member';

    if (!safeEmail) {
      return c.json({ error: 'Email is required' }, 400);
    }

    const dashboard = await buildOrganizationDashboard(organizationId);
    const maxUsers = dashboard.max_users || getMaxUsersForPlan(dashboard.organization.subscription_plan);

    const alreadyExists = dashboard.members.some((member: any) => member.email === safeEmail);

    if (!alreadyExists && dashboard.used_users >= maxUsers) {
      return c.json({ error: 'Organization user limit reached' }, 400);
    }

    const { data: member, error: memberError } = await supabase
      .from('organization_members')
      .upsert({
        organization_id: organizationId,
        email: safeEmail,
        role: safeRole,
      }, {
        onConflict: 'organization_id,email',
      })
      .select('id, organization_id, user_id, email, role, created_at')
      .single();

    if (memberError) {
      console.log('Add organization member error:', memberError);
      return c.json({ error: memberError.message }, 500);
    }

    return c.json({ member });
  } catch (error) {
    console.log('Add organization member route error:', error);
    return c.json({ error: 'Failed to add organization member' }, 500);
  }
});

app.delete("/make-server-819c6d9b/organizations/:organizationId/members/:memberId", async (c: Context) => {
  try {
    const organizationId = c.req.param('organizationId');
    const memberId = c.req.param('memberId');

    const { data: member, error: memberCheckError } = await supabase
      .from('organization_members')
      .select('id, role')
      .eq('id', memberId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (memberCheckError) {
      console.log('Find organization member error:', memberCheckError);
      return c.json({ error: memberCheckError.message }, 500);
    }

    if (!member?.id) {
      return c.json({ error: 'Member not found' }, 404);
    }

    if (member.role === 'owner') {
      return c.json({ error: 'Organization owner cannot be removed' }, 400);
    }

    const { error: deleteError } = await supabase
      .from('organization_members')
      .delete()
      .eq('id', memberId)
      .eq('organization_id', organizationId);

    if (deleteError) {
      console.log('Delete organization member error:', deleteError);
      return c.json({ error: deleteError.message }, 500);
    }

    return c.json({ success: true });
  } catch (error) {
    console.log('Delete organization member route error:', error);
    return c.json({ error: 'Failed to remove organization member' }, 500);
  }
});

Deno.serve(app.fetch);