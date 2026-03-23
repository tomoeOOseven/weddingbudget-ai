// middleware/authMiddleware.js
// Verifies Supabase JWT tokens on protected backend routes.
// Attaches req.user (auth payload) and req.profile (role, name) to the request.

const { createClient } = require('@supabase/supabase-js');

// Service-role client — bypasses RLS, used only server-side
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

/**
 * requireAuth — verifies any valid Supabase session token.
 * Use on any route that needs a logged-in user (client or admin).
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or malformed Authorization header.' });
    }

    const token = authHeader.split(' ')[1];

    // Verify the JWT against Supabase
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    // Fetch the profile row (has role, name, is_active)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, role, full_name, email, is_active')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(401).json({ error: 'User profile not found.' });
    }

    if (!profile.is_active) {
      return res.status(403).json({ error: 'Account is deactivated.' });
    }

    req.user    = user;
    req.profile = profile;
    next();
  } catch (err) {
    console.error('[authMiddleware] Unexpected error:', err.message);
    res.status(500).json({ error: 'Authentication service error.' });
  }
}

/**
 * requireAdmin — extends requireAuth; additionally checks that role is admin/super_admin.
 * Use on all /api/admin/* routes and any data-write endpoints.
 */
async function requireAdmin(req, res, next) {
  await requireAuth(req, res, async () => {
    const role = req.profile?.role;
    if (role !== 'admin' && role !== 'super_admin') {
      return res.status(403).json({
        error: 'Admin access required.',
        yourRole: role ?? 'none',
      });
    }
    next();
  });
}

/**
 * requireSuperAdmin — only super_admins can trigger sensitive actions
 * (e.g. promoting other users, rolling back models, deleting sources).
 */
async function requireSuperAdmin(req, res, next) {
  await requireAuth(req, res, async () => {
    if (req.profile?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super-admin access required.' });
    }
    next();
  });
}

/**
 * requireClient — ensures only client accounts can access client-only data routes.
 */
async function requireClient(req, res, next) {
  await requireAuth(req, res, async () => {
    if (req.profile?.role !== 'client') {
      return res.status(403).json({ error: 'Client access required.' });
    }
    next();
  });
}

module.exports = { requireAuth, requireAdmin, requireSuperAdmin, requireClient, supabaseAdmin };
