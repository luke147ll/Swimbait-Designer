import {
  handleSignup, handleLogin, handleMe, handleLogout,
  handlePasswordChange, handleCheckUsername,
  handleVerify, handleResendCode, jsonResponse
} from './auth.js';

import {
  handleListDesigns, handleCreateDesign, handleGetDesign,
  handleUpdateDesign, handleDeleteDesign, handleToggleShare,
  handlePublicDesign
} from './designs.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Allow both main site and mold subdomain
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = ['https://swimbaitdesigner.com', 'https://mold.swimbaitdesigner.com'];
    const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

    const corsHeaders = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Credentials': 'true',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      let response;

      // Auth routes
      if (path === '/api/auth/signup' && method === 'POST') {
        response = await handleSignup(request, env);
      } else if (path === '/api/auth/login' && method === 'POST') {
        response = await handleLogin(request, env);
      } else if (path === '/api/auth/me' && method === 'GET') {
        response = await handleMe(request, env);
      } else if (path === '/api/auth/logout' && method === 'POST') {
        response = await handleLogout(request, env);
      } else if (path === '/api/auth/password' && method === 'PUT') {
        response = await handlePasswordChange(request, env);
      } else if (path === '/api/auth/check-username' && method === 'GET') {
        response = await handleCheckUsername(request, env);
      } else if (path === '/api/auth/verify' && method === 'POST') {
        response = await handleVerify(request, env);
      } else if (path === '/api/auth/resend-code' && method === 'POST') {
        response = await handleResendCode(request, env);

      // Design routes
      } else if (path === '/api/designs' && method === 'GET') {
        response = await handleListDesigns(request, env);
      } else if (path === '/api/designs' && method === 'POST') {
        response = await handleCreateDesign(request, env);
      } else if (path.match(/^\/api\/designs\/[\w-]+$/) && method === 'GET') {
        response = await handleGetDesign(request, env, path.split('/').pop());
      } else if (path.match(/^\/api\/designs\/[\w-]+$/) && method === 'PUT') {
        response = await handleUpdateDesign(request, env, path.split('/').pop());
      } else if (path.match(/^\/api\/designs\/[\w-]+$/) && method === 'DELETE') {
        response = await handleDeleteDesign(request, env, path.split('/').pop());
      } else if (path.match(/^\/api\/designs\/[\w-]+\/share$/) && method === 'POST') {
        response = await handleToggleShare(request, env, path.split('/')[3]);

      // Thumbnail serving from R2
      } else if (path.match(/^\/api\/thumbnails\/[\w-]+$/) && method === 'GET') {
        const designId = path.split('/').pop();
        const obj = await env.THUMBNAILS.get(`thumbs/${designId}.jpg`);
        if (obj) {
          response = new Response(obj.body, {
            headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' },
          });
        } else {
          response = new Response(null, { status: 404 });
        }

      // Public design view (no auth required)
      } else if (path.match(/^\/api\/public\/[\w-]+$/) && method === 'GET') {
        response = await handlePublicDesign(request, env, path.split('/').pop());

      // Mold transfer — store primitives JSON or binary STL temporarily
      } else if (path === '/api/mold-transfer' && method === 'POST') {
        const contentType = request.headers.get('Content-Type') || '';
        const token = crypto.randomUUID().slice(0, 12);

        if (contentType.includes('application/json')) {
          // Primitives JSON — store as-is
          const text = await request.text();
          await env.USERS.put(`mold-transfer:${token}`, text, { expirationTtl: 900 });
          await env.USERS.put(`mold-transfer-type:${token}`, 'json', { expirationTtl: 900 });
          console.log(`[mold-transfer] Stored JSON (${text.length} chars), token: ${token}`);
        } else {
          // Binary STL — store as base64
          const body = await request.arrayBuffer();
          const bytes = new Uint8Array(body);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          await env.USERS.put(`mold-transfer:${token}`, btoa(binary), { expirationTtl: 900 });
          await env.USERS.put(`mold-transfer-type:${token}`, 'binary', { expirationTtl: 900 });
          console.log(`[mold-transfer] Stored binary (${body.byteLength} bytes), token: ${token}`);
        }
        response = jsonResponse({ token });

      } else if (path === '/api/mold-transfer' && method === 'GET') {
        const token = url.searchParams.get('token');
        if (!token) {
          response = jsonResponse({ error: 'Missing token' }, 400);
        } else {
          const data = await env.USERS.get(`mold-transfer:${token}`, 'text');
          const dataType = await env.USERS.get(`mold-transfer-type:${token}`, 'text') || 'binary';
          if (!data) {
            response = jsonResponse({ error: 'Transfer expired or not found' }, 404);
          } else {
            await env.USERS.delete(`mold-transfer:${token}`);
            await env.USERS.delete(`mold-transfer-type:${token}`);

            if (dataType === 'json') {
              response = new Response(data, { headers: { 'Content-Type': 'application/json' } });
            } else {
              const binary = atob(data);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              response = new Response(bytes.buffer, { headers: { 'Content-Type': 'application/octet-stream' } });
            }
          }
        }

      } else {
        response = jsonResponse({ error: 'Not found' }, 404);
      }

      for (const [key, val] of Object.entries(corsHeaders)) {
        response.headers.set(key, val);
      }
      return response;

    } catch (err) {
      return new Response(JSON.stringify({ error: 'Internal error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
