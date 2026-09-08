import { describe, it, expect, vi, beforeEach } from 'vitest';
import projectsController from './projects';
vi.mock('../services/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: null },
      }),
    },
  },
  isSupabaseConfigured: false,
}));
import * as r2Client from '../services/r2Client';

function createMockReqRes(
  userId: string | null = 'test-user-123',
  body = {},
  params = {},
  query = {}
) {
  const req: any = {
    userId: userId ?? undefined,
    body,
    params,
    query,
    headers: {},
  };
  let statusCode = 200;
  let jsonResponse: any = null;

  const res: any = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (data: any) => {
      jsonResponse = data;
      return res;
    },
  };

  return { req, res, getStatus: () => statusCode, getJson: () => jsonResponse };
}

describe('Projects Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createProject', () => {
    it('creates project successfully', async () => {
      const mockProject = {
        id: 'proj-1',
        name: 'Q1 Invoices',
        owner_id: 'test-user-123',
        created_at: '2026-09-08T00:00:00Z',
      };

      vi.spyOn(supabase, 'from').mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockProject, error: null }),
          }),
        }),
      } as any);

      const { req, res, getStatus, getJson } = createMockReqRes('test-user-123', {
        name: 'Q1 Invoices',
      });

      await projectsController.createProject(req, res);

      expect(getStatus()).toBe(201);
      expect(getJson()).toEqual(mockProject);
    });

    it('returns 400 when project name is missing or empty', async () => {
      const { req, res, getStatus, getJson } = createMockReqRes('test-user-123', { name: '   ' });

      await projectsController.createProject(req, res);

      expect(getStatus()).toBe(400);
      expect(getJson().error).toBeDefined();
    });

    it('returns 401 when user is not authenticated', async () => {
      const { req, res, getStatus } = createMockReqRes(null, { name: 'Test' });

      await projectsController.createProject(req, res);

      expect(getStatus()).toBe(401);
    });
  });

  describe('listProjects', () => {
    it('returns all projects for the user', async () => {
      const mockProjects = [
        { id: 'proj-1', name: 'P1', owner_id: 'test-user-123' },
        { id: 'proj-2', name: 'P2', owner_id: 'test-user-123' },
      ];

      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockProjects, error: null }),
          }),
        }),
      } as any);

      const { req, res, getStatus, getJson } = createMockReqRes('test-user-123');

      await projectsController.listProjects(req, res);

      expect(getStatus()).toBe(200);
      expect(getJson()).toEqual(mockProjects);
    });
  });

  describe('getProject', () => {
    it('returns project with its documents', async () => {
      const mockProject = { id: 'proj-1', name: 'P1', owner_id: 'test-user-123' };
      const mockDocs = [{ id: 'doc-1', filename: 'invoice.pdf', project_id: 'proj-1' }];

      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockProject, error: null }),
                }),
              }),
            }),
          } as any;
        }
        if (table === 'documents') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: mockDocs, error: null }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      const { req, res, getStatus, getJson } = createMockReqRes(
        'test-user-123',
        {},
        { id: 'proj-1' }
      );

      await projectsController.getProject(req, res);

      expect(getStatus()).toBe(200);
      expect(getJson()).toEqual({
        ...mockProject,
        documents: mockDocs,
      });
    });

    it('returns 404 when project is not found or owned by another user', async () => {
      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
            }),
          }),
        }),
      } as any);

      const { req, res, getStatus } = createMockReqRes('test-user-123', {}, { id: 'proj-unknown' });

      await projectsController.getProject(req, res);

      expect(getStatus()).toBe(404);
    });
  });

  describe('deleteProject', () => {
    it('deletes R2 objects and DB records', async () => {
      const deleteObjectsSpy = vi.spyOn(r2Client, 'deleteObjects').mockResolvedValue();

      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'proj-1' }, error: null }),
                }),
              }),
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          } as any;
        }
        if (table === 'documents') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ storage_path: 'user/proj/file1.pdf' }],
              }),
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          } as any;
        }
        return {} as any;
      });

      const { req, res, getStatus, getJson } = createMockReqRes(
        'test-user-123',
        {},
        { id: 'proj-1' }
      );

      await projectsController.deleteProject(req, res);

      expect(deleteObjectsSpy).toHaveBeenCalledWith(['user/proj/file1.pdf']);
      expect(getStatus()).toBe(200);
      expect(getJson()).toEqual({ success: true });
    });
  });
});
