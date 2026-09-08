import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: null },
      }),
    },
  },
  isSupabaseConfigured: false,
}));

import {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
} from './projectService';

describe('projectService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates project via POST /api/projects', async () => {
    const mockProject = { id: 'p1', name: 'My Project', owner_id: 'user1' };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockProject,
    } as any);

    const result = await createProject('My Project');

    expect(result).toEqual(mockProject);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/projects'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'My Project' }),
      })
    );
  });

  it('lists projects via GET /api/projects', async () => {
    const mockProjects = [
      { id: 'p1', name: 'P1' },
      { id: 'p2', name: 'P2' },
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockProjects,
    } as any);

    const result = await listProjects();
    expect(result).toEqual(mockProjects);
  });

  it('gets a project detail via GET /api/projects/:id', async () => {
    const mockProjectDetail = { id: 'p1', name: 'P1', documents: [] };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockProjectDetail,
    } as any);

    const result = await getProject('p1');
    expect(result).toEqual(mockProjectDetail);
  });

  it('updates project via PATCH /api/projects/:id', async () => {
    const mockUpdated = { id: 'p1', name: 'Renamed' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockUpdated,
    } as any);

    const result = await updateProject('p1', 'Renamed');
    expect(result).toEqual(mockUpdated);
  });

  it('deletes project via DELETE /api/projects/:id', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
    } as any);

    await deleteProject('p1');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/projects/p1'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
