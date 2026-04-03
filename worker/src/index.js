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

    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://swimbaitdesigner.com',
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
