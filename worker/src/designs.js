import { getAuthenticatedUser, jsonResponse } from './auth.js';

export async function handleListDesigns(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);

  const index = await env.DESIGNS.get(`userdesigns:${user.id}`, 'json');
  if (!index || !index.designIds.length) {
    return jsonResponse({ designs: [] });
  }

  const designs = [];
  for (const designId of index.designIds) {
    const design = await env.DESIGNS.get(`design:${designId}`, 'json');
    if (design) {
      const { stateJSON, ...meta } = design;
      designs.push(meta);
    }
  }

  designs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return jsonResponse({ designs });
}

export async function handleCreateDesign(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);

  const body = await request.json();
  const { name, species, tailType, length, stateJSON, thumbnail } = body;

  if (!name || !stateJSON) {
    return jsonResponse({ error: 'Name and design state are required' }, 400);
  }

  const designId = crypto.randomUUID();

  let thumbnailKey = null;
  if (thumbnail) {
    thumbnailKey = `thumbs/${designId}.jpg`;
    const base64Data = thumbnail.replace(/^data:image\/\w+;base64,/, '');
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    await env.THUMBNAILS.put(thumbnailKey, binaryData, {
      httpMetadata: { contentType: 'image/jpeg' },
    });
  }

  const design = {
    id: designId,
    userId: user.id,
    name,
    species: species || 'custom',
    tailType: tailType || 'paddle',
    length: length || 8.0,
    stateJSON,
    thumbnailKey,
    public: false,
    exportCount: 0,
    viewCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await env.DESIGNS.put(`design:${designId}`, JSON.stringify(design));

  const index = await env.DESIGNS.get(`userdesigns:${user.id}`, 'json')
    || { designIds: [] };
  index.designIds.push(designId);
  await env.DESIGNS.put(`userdesigns:${user.id}`, JSON.stringify(index));

  user.designCount = (user.designCount || 0) + 1;
  await env.USERS.put(`user:${user.id}`, JSON.stringify(user));

  const { stateJSON: _, ...meta } = design;
  return jsonResponse(meta, 201);
}

export async function handleGetDesign(request, env, designId) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);

  const design = await env.DESIGNS.get(`design:${designId}`, 'json');
  if (!design) return jsonResponse({ error: 'Design not found' }, 404);
  if (design.userId !== user.id) return jsonResponse({ error: 'Not authorized' }, 403);

  return jsonResponse(design);
}

export async function handleUpdateDesign(request, env, designId) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);

  const design = await env.DESIGNS.get(`design:${designId}`, 'json');
  if (!design) return jsonResponse({ error: 'Design not found' }, 404);
  if (design.userId !== user.id) return jsonResponse({ error: 'Not authorized' }, 403);

  const body = await request.json();
  const { name, species, tailType, length, stateJSON, thumbnail } = body;

  if (name !== undefined) design.name = name;
  if (species !== undefined) design.species = species;
  if (tailType !== undefined) design.tailType = tailType;
  if (length !== undefined) design.length = length;
  if (stateJSON !== undefined) design.stateJSON = stateJSON;
  design.updatedAt = new Date().toISOString();

  if (thumbnail) {
    design.thumbnailKey = `thumbs/${designId}.jpg`;
    const base64Data = thumbnail.replace(/^data:image\/\w+;base64,/, '');
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    await env.THUMBNAILS.put(design.thumbnailKey, binaryData, {
      httpMetadata: { contentType: 'image/jpeg' },
    });
  }

  await env.DESIGNS.put(`design:${designId}`, JSON.stringify(design));

  const { stateJSON: _, ...meta } = design;
  return jsonResponse(meta);
}

export async function handleDeleteDesign(request, env, designId) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);

  const design = await env.DESIGNS.get(`design:${designId}`, 'json');
  if (!design) return jsonResponse({ error: 'Design not found' }, 404);
  if (design.userId !== user.id) return jsonResponse({ error: 'Not authorized' }, 403);

  await env.DESIGNS.delete(`design:${designId}`);

  if (design.thumbnailKey) {
    await env.THUMBNAILS.delete(design.thumbnailKey);
  }

  if (design.public) {
    await env.DESIGNS.delete(`public:${designId}`);
  }

  const index = await env.DESIGNS.get(`userdesigns:${user.id}`, 'json');
  if (index) {
    index.designIds = index.designIds.filter(id => id !== designId);
    await env.DESIGNS.put(`userdesigns:${user.id}`, JSON.stringify(index));
  }

  user.designCount = Math.max(0, (user.designCount || 1) - 1);
  await env.USERS.put(`user:${user.id}`, JSON.stringify(user));

  return jsonResponse({ ok: true });
}

export async function handleToggleShare(request, env, designId) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);

  const design = await env.DESIGNS.get(`design:${designId}`, 'json');
  if (!design) return jsonResponse({ error: 'Design not found' }, 404);
  if (design.userId !== user.id) return jsonResponse({ error: 'Not authorized' }, 403);

  design.public = !design.public;
  design.updatedAt = new Date().toISOString();
  await env.DESIGNS.put(`design:${designId}`, JSON.stringify(design));

  if (design.public) {
    await env.DESIGNS.put(`public:${designId}`, JSON.stringify({
      userId: user.id,
      designId,
    }));
  } else {
    await env.DESIGNS.delete(`public:${designId}`);
  }

  return jsonResponse({
    public: design.public,
    shareUrl: design.public ? `https://swimbaitdesigner.com/d/${designId}` : null,
  });
}

export async function handlePublicDesign(request, env, designId) {
  const publicRecord = await env.DESIGNS.get(`public:${designId}`, 'json');
  if (!publicRecord) return jsonResponse({ error: 'Design not found or not shared' }, 404);

  const design = await env.DESIGNS.get(`design:${designId}`, 'json');
  if (!design) return jsonResponse({ error: 'Design not found' }, 404);

  design.viewCount = (design.viewCount || 0) + 1;
  await env.DESIGNS.put(`design:${designId}`, JSON.stringify(design));

  const { userId, ...publicDesign } = design;
  return jsonResponse(publicDesign);
}
