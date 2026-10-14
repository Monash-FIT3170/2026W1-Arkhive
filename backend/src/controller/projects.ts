import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { supabase } from '../services/supabaseClient';
import { deletePrefix } from '../services/r2Client';

export default {
  /**
   * POST /api/projects
   * Creates a new project for the authenticated user.
   */
  createProject: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { name } = req.body;
      const ownerId = req.userId;

      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Project name is required.' });
        return;
      }

      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      const { data, error } = await supabase
        .from('projects')
        .insert({
          name: name.trim(),
          owner_id: ownerId,
        })
        .select()
        .single();

      if (error) {
        console.error('Failed to create project in Supabase:', error);
        res.status(500).json({ error: error.message });
        return;
      }

      res.status(201).json(data);
    } catch (err: any) {
      console.error('Unexpected error in createProject:', err);
      res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  },

  /**
   * GET /api/projects
   * Lists all projects owned by the authenticated user.
   */
  listProjects: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const ownerId = req.userId;

      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      const { data: projects, error } = await supabase
        .from('projects')
        .select('*')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to list projects:', error);
        res.status(500).json({ error: error.message });
        return;
      }

      if (!projects || projects.length === 0) {
        res.json([]);
        return;
      }

      const projectIds = projects.map((p) => p.id);

      const { data: documents, error: docsError } = await supabase
        .from('documents')
        .select('id, project_id, filename, storage_path, created_at')
        .in('project_id', projectIds)
        .order('created_at', { ascending: false });

      if (docsError) {
        console.error('Failed to list project documents:', docsError);
        res.json(
          projects.map((p) => ({
            ...p,
            document_count: 0,
            page_count: 0,
            documents: [],
          }))
        );
        return;
      }

      const documentIds = (documents || []).map((d) => d.id);
      let pagesByDocument = new Map<string, unknown[]>();

      if (documentIds.length > 0) {
        const { data: pages, error: pagesError } = await supabase
          .from('document_pages')
          .select('id, document_id, page_index, status')
          .in('document_id', documentIds)
          .order('page_index', { ascending: true });

        if (!pagesError && pages) {
          pagesByDocument = pages.reduce((map, page) => {
            const list = map.get(page.document_id) ?? [];
            list.push(page);
            map.set(page.document_id, list);
            return map;
          }, new Map<string, unknown[]>());
        }
      }

      const docsByProject = new Map<string, any[]>();
      (documents || []).forEach((doc) => {
        const docWithPages = {
          ...doc,
          pages: pagesByDocument.get(doc.id) ?? [],
        };
        const list = docsByProject.get(doc.project_id) ?? [];
        list.push(docWithPages);
        docsByProject.set(doc.project_id, list);
      });

      const result = projects.map((project) => {
        const projectDocs = docsByProject.get(project.id) ?? [];
        const pageCount = projectDocs.reduce(
          (sum: number, doc: any) => sum + (doc.pages?.length || 0),
          0
        );
        return {
          ...project,
          document_count: projectDocs.length,
          page_count: pageCount,
          documents: projectDocs,
        };
      });

      res.json(result);
    } catch (err: any) {
      console.error('Unexpected error in listProjects:', err);
      res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  },

  /**
   * GET /api/projects/:id
   * Retrieves a single project along with its documents, ensuring user ownership.
   */
  getProject: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const ownerId = req.userId;

      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .eq('owner_id', ownerId)
        .single();

      if (projectError || !project) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }

      const { data: documents, error: docsError } = await supabase
        .from('documents')
        .select('*, pages:document_pages(*)')
        .eq('project_id', id)
        .order('created_at', { ascending: false });

      if (docsError) {
        console.error('Failed to retrieve project documents:', docsError);
        res.status(500).json({ error: docsError.message });
        return;
      }

      const documentIds = (documents || []).map((doc) => doc.id);
      let pagesByDocument = new Map<string, unknown[]>();

      if (documentIds.length > 0) {
        const { data: pages, error: pagesError } = await supabase
          .from('document_pages')
          .select('*')
          .in('document_id', documentIds)
          .order('page_index', { ascending: true });

        if (pagesError) {
          console.error('Failed to retrieve document pages:', pagesError);
          res.status(500).json({ error: pagesError.message });
          return;
        }

        pagesByDocument = (pages || []).reduce((map, page) => {
          const list = map.get(page.document_id) ?? [];
          list.push(page);
          map.set(page.document_id, list);
          return map;
        }, new Map<string, unknown[]>());
      }

      res.json({
        ...project,
        documents: (documents || []).map((doc) => ({
          ...doc,
          pages: pagesByDocument.get(doc.id) ?? [],
        })),
      });
    } catch (err: any) {
      console.error('Unexpected error in getProject:', err);
      res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  },

  /**
   * PATCH /api/projects/:id
   * Updates project details (such as name) with ownership check.
   */
  updateProject: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { name } = req.body;
      const ownerId = req.userId;

      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Updated project name is required.' });
        return;
      }

      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      const { data, error } = await supabase
        .from('projects')
        .update({ name: name.trim() })
        .eq('id', id)
        .eq('owner_id', ownerId)
        .select()
        .single();

      if (error || !data) {
        res.status(404).json({ error: 'Project not found or update failed.' });
        return;
      }

      res.json(data);
    } catch (err: any) {
      console.error('Unexpected error in updateProject:', err);
      res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  },

  /**
   * DELETE /api/projects/:id
   * Deletes a project, its documents in DB, and all associated objects in R2 storage.
   */
  deleteProject: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const ownerId = req.userId;

      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      // Verify project ownership
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('id', id)
        .eq('owner_id', ownerId)
        .single();

      if (projectError || !project) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }

      // Find all document storage paths to delete from R2
      const { data: documents } = await supabase
        .from('documents')
        .select('storage_path')
        .eq('project_id', id);

      if (documents && documents.length > 0) {
        try {
          await Promise.all(
            documents
              .filter((doc) => doc.storage_path)
              .map((doc) => deletePrefix(`${doc.storage_path}/`))
          );
        } catch (r2Err) {
          console.error('Failed to delete objects from R2 during project cleanup:', r2Err);
        }
      }

      // Delete documents rows
      await supabase.from('documents').delete().eq('project_id', id);

      // Delete project row
      const { error: deleteError } = await supabase
        .from('projects')
        .delete()
        .eq('id', id)
        .eq('owner_id', ownerId);

      if (deleteError) {
        res.status(500).json({ error: deleteError.message });
        return;
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error('Unexpected error in deleteProject:', err);
      res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  },
};
