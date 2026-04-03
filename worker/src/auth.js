import bcrypt from 'bcryptjs';

// ─── Helpers ──────────────────────────────────────────────────

function generateToken() {
  return crypto.randomUUID() + '-' + crypto.randomUUID();
}

function generateUserId() {
  return crypto.randomUUID();
}

function getSessionCookie(token) {
  return `session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`;
}

function clearSessionCookie() {
  return 'session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0';
}

function getSessionToken(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/session=([^;]+)/);
  return match ? match[1] : null;
}

async function getAuthenticatedUser(request, env) {
  const token = getSessionToken(request);
  if (!token) return null;

  const session = await env.USERS.get(`session:${token}`, 'json');
  if (!session) return null;

  const user = await env.USERS.get(`user:${session.userId}`, 'json');
  if (!user) return null;

  return user;
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

// ─── Validation ───────────────────────────────────────────────

function validateUsername(username) {
  if (!username || typeof username !== 'string') return 'Username is required';
  if (username.length < 3) return 'Username must be at least 3 characters';
  if (username.length > 20) return 'Username must be 20 characters or fewer';
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return 'Username can only contain letters, numbers, and underscores';
  return null;
}

function validatePassword(password) {
  if (!password || typeof password !== 'string') return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (password.length > 128) return 'Password is too long';
  return null;
}

// ─── Rate limiting ────────────────────────────────────────────

async function checkRateLimit(env, username) {
  const key = `ratelimit:login:${username.toLowerCase()}`;
  const data = await env.USERS.get(key, 'json');

  if (data && data.attempts >= 5) {
    return { limited: true, message: 'Too many login attempts. Try again in 15 minutes.' };
  }
  return { limited: false };
}

async function recordFailedAttempt(env, username) {
  const key = `ratelimit:login:${username.toLowerCase()}`;
  const data = await env.USERS.get(key, 'json') || { attempts: 0 };
  data.attempts += 1;
  data.lastAttempt = new Date().toISOString();
  await env.USERS.put(key, JSON.stringify(data), { expirationTtl: 900 });
}

async function clearRateLimit(env, username) {
  await env.USERS.delete(`ratelimit:login:${username.toLowerCase()}`);
}

// ─── Signup ───────────────────────────────────────────────────

export async function handleSignup(request, env) {
  const body = await request.json();
  const { username, password, email, displayName } = body;

  // Email is required
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return jsonResponse({ error: 'A valid email address is required' }, 400);
  }

  const usernameErr = validateUsername(username);
  if (usernameErr) return jsonResponse({ error: usernameErr }, 400);

  const passwordErr = validatePassword(password);
  if (passwordErr) return jsonResponse({ error: passwordErr }, 400);

  const existing = await env.USERS.get(`username:${username.toLowerCase()}`);
  if (existing) return jsonResponse({ error: 'Username is already taken' }, 409);

  const emailExisting = await env.USERS.get(`email:${email.toLowerCase()}`);
  if (emailExisting) return jsonResponse({ error: 'Email is already registered' }, 409);

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const userId = generateUserId();
  const user = {
    id: userId,
    username,
    email: email.toLowerCase(),
    emailVerified: false,
    hashedPassword,
    displayName: displayName || username,
    location: '',
    plan: 'free',
    createdAt: new Date().toISOString(),
    designCount: 0,
    exportCount: 0,
  };

  await env.USERS.put(`user:${userId}`, JSON.stringify(user));
  await env.USERS.put(`username:${username.toLowerCase()}`, JSON.stringify({ userId }));
  await env.USERS.put(`email:${email.toLowerCase()}`, JSON.stringify({ userId }));
  await env.DESIGNS.put(`userdesigns:${userId}`, JSON.stringify({ designIds: [] }));

  // Generate 6-digit verification code
  const code = String(Math.floor(100000 + Math.random() * 900000));

  await env.USERS.put(`verify:${email.toLowerCase()}`, JSON.stringify({
    code,
    userId,
    attempts: 0,
    createdAt: new Date().toISOString(),
  }), { expirationTtl: 900 });

  // Push to MailerLite SD Unverified group (triggers verification email automation)
  try {
    await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.MAILERLITE_API_KEY}`,
      },
      body: JSON.stringify({
        email: email.toLowerCase(),
        fields: {
          verification_code: code,
          name: displayName || username,
        },
        groups: ['183751433716237749'],
      }),
    });
  } catch (err) {
    console.error('MailerLite API error:', err);
  }

  // Create session (logged in but unverified)
  const token = generateToken();
  await env.USERS.put(`session:${token}`, JSON.stringify({
    userId,
    createdAt: new Date().toISOString(),
  }), { expirationTtl: 2592000 });

  const { hashedPassword: _, ...safeUser } = user;
  return jsonResponse({ ...safeUser, needsVerification: true }, 201, {
    'Set-Cookie': getSessionCookie(token),
  });
}

// ─── Login ────────────────────────────────────────────────────

export async function handleLogin(request, env) {
  const body = await request.json();
  const { username, password } = body;

  if (!username || !password) {
    return jsonResponse({ error: 'Username and password are required' }, 400);
  }

  const rateCheck = await checkRateLimit(env, username);
  if (rateCheck.limited) {
    return jsonResponse({ error: rateCheck.message }, 429);
  }

  const usernameRecord = await env.USERS.get(`username:${username.toLowerCase()}`, 'json');
  if (!usernameRecord) {
    await recordFailedAttempt(env, username);
    return jsonResponse({ error: 'Invalid username or password' }, 401);
  }

  const user = await env.USERS.get(`user:${usernameRecord.userId}`, 'json');
  if (!user) {
    return jsonResponse({ error: 'Invalid username or password' }, 401);
  }

  const valid = await bcrypt.compare(password, user.hashedPassword);
  if (!valid) {
    await recordFailedAttempt(env, username);
    return jsonResponse({ error: 'Invalid username or password' }, 401);
  }

  await clearRateLimit(env, username);

  const token = generateToken();
  await env.USERS.put(`session:${token}`, JSON.stringify({
    userId: user.id,
    createdAt: new Date().toISOString(),
  }), { expirationTtl: 2592000 });

  const { hashedPassword: _, ...safeUser } = user;
  return jsonResponse(safeUser, 200, {
    'Set-Cookie': getSessionCookie(token),
  });
}

// ─── Session ──────────────────────────────────────────────────

export async function handleMe(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);

  const { hashedPassword: _, ...safeUser } = user;
  return jsonResponse(safeUser);
}

export async function handleLogout(request, env) {
  const token = getSessionToken(request);
  if (token) {
    await env.USERS.delete(`session:${token}`);
  }
  return jsonResponse({ ok: true }, 200, {
    'Set-Cookie': clearSessionCookie(),
  });
}

// ─── Password change ──────────────────────────────────────────

export async function handlePasswordChange(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);

  const body = await request.json();
  const { currentPassword, newPassword } = body;

  const valid = await bcrypt.compare(currentPassword, user.hashedPassword);
  if (!valid) return jsonResponse({ error: 'Current password is incorrect' }, 401);

  const passwordErr = validatePassword(newPassword);
  if (passwordErr) return jsonResponse({ error: passwordErr }, 400);

  const salt = await bcrypt.genSalt(10);
  user.hashedPassword = await bcrypt.hash(newPassword, salt);
  await env.USERS.put(`user:${user.id}`, JSON.stringify(user));

  return jsonResponse({ ok: true });
}

// ─── Username availability check ──────────────────────────────

export async function handleCheckUsername(request, env) {
  const url = new URL(request.url);
  const username = url.searchParams.get('username');

  const err = validateUsername(username);
  if (err) return jsonResponse({ available: false, error: err });

  const existing = await env.USERS.get(`username:${username.toLowerCase()}`);
  return jsonResponse({ available: !existing });
}

// ─── Email verification ──────────────────────────────────────

export async function handleVerify(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);

  const body = await request.json();
  const { code } = body;

  if (!code || typeof code !== 'string') {
    return jsonResponse({ error: 'Verification code is required' }, 400);
  }

  const email = user.email;
  if (!email) return jsonResponse({ error: 'No email on account' }, 400);

  const verifyData = await env.USERS.get(`verify:${email}`, 'json');
  if (!verifyData) {
    return jsonResponse({ error: 'Verification code expired. Request a new one.' }, 410);
  }

  if (verifyData.attempts >= 5) {
    return jsonResponse({ error: 'Too many attempts. Request a new code.' }, 429);
  }

  if (verifyData.code !== code.trim()) {
    verifyData.attempts += 1;
    await env.USERS.put(`verify:${email}`, JSON.stringify(verifyData), {
      expirationTtl: 900,
    });
    return jsonResponse({
      error: 'Invalid code. Please try again.',
      attemptsRemaining: 5 - verifyData.attempts,
    }, 401);
  }

  // Code valid — mark verified
  user.emailVerified = true;
  await env.USERS.put(`user:${user.id}`, JSON.stringify(user));
  await env.USERS.delete(`verify:${email}`);

  // Move subscriber from SD Unverified to SD Verified in MailerLite
  try {
    // Add to SD Verified group
    await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.MAILERLITE_API_KEY}`,
      },
      body: JSON.stringify({
        email,
        groups: ['183751444707411764'],
      }),
    });

    // Remove from SD Unverified group
    const subRes = await fetch(
      `https://connect.mailerlite.com/api/subscribers/${encodeURIComponent(email)}`,
      { headers: { 'Authorization': `Bearer ${env.MAILERLITE_API_KEY}` } }
    );
    if (subRes.ok) {
      const subData = await subRes.json();
      await fetch(
        `https://connect.mailerlite.com/api/subscribers/${subData.data.id}/groups/183751433716237749`,
        { method: 'DELETE', headers: { 'Authorization': `Bearer ${env.MAILERLITE_API_KEY}` } }
      );
    }
  } catch (err) {
    console.error('MailerLite group move error:', err);
  }

  const { hashedPassword: _, ...safeUser } = user;
  return jsonResponse({ ...safeUser, verified: true });
}

export async function handleResendCode(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);

  if (user.emailVerified) {
    return jsonResponse({ error: 'Email is already verified' }, 400);
  }

  const email = user.email;
  if (!email) return jsonResponse({ error: 'No email on account' }, 400);

  // Rate limit: 1 resend per 60 seconds
  const existing = await env.USERS.get(`verify:${email}`, 'json');
  if (existing) {
    const elapsed = Date.now() - new Date(existing.createdAt).getTime();
    if (elapsed < 60000) {
      return jsonResponse({
        error: 'Please wait before requesting a new code.',
        retryAfter: Math.ceil((60000 - elapsed) / 1000),
      }, 429);
    }
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));

  await env.USERS.put(`verify:${email}`, JSON.stringify({
    code,
    userId: user.id,
    attempts: 0,
    createdAt: new Date().toISOString(),
  }), { expirationTtl: 900 });

  try {
    await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.MAILERLITE_API_KEY}`,
      },
      body: JSON.stringify({
        email,
        fields: { verification_code: code },
        groups: ['183751433716237749'],
      }),
    });
  } catch (err) {
    console.error('MailerLite resend error:', err);
  }

  return jsonResponse({ sent: true, message: 'New verification code sent.' });
}

export { getAuthenticatedUser, jsonResponse };
