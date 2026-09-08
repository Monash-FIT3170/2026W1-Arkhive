import { apiUrl } from './apiBase';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import type { Project, ProjectDetail } from '../models/Project';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (isSupabaseConfigured) {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        headers['Authorization'] = `Bearer ${data.session.access_token}`;
      }
    } catch {
      // Supabase auth not initialized or offline
    }
  }

  return headers;
}

/**
 * Creates a new project in the backend database.
 */
export async function createProject(name: string): Promise<Project> {
  const headers = await getAuthHeaders();
  const response = await fetch(apiUrl('/api/projects'), {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to create project (${response.status})`);
  }

  return await response.json();
}

/**
 * Lists all projects owned by the currently authenticated user.
 */
export async function listProjects(): Promise<Project[]> {
  const headers = await getAuthHeaders();
  const response = await fetch(apiUrl('/api/projects'), {
    method: 'GET',
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch projects (${response.status})`);
  }

  return await response.json();
}

/**
 * Retrieves a single project and its documents.
 */
export async function getProject(id: string): Promise<ProjectDetail> {
  const headers = await getAuthHeaders();
  const response = await fetch(apiUrl(`/api/projects/${encodeURIComponent(id)}`), {
    method: 'GET',
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch project (${response.status})`);
  }

  return await response.json();
}

/**
 * Updates a project's name.
 */
export async function updateProject(id: string, name: string): Promise<Project> {
  const headers = await getAuthHeaders();
  const response = await fetch(apiUrl(`/api/projects/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers,
    credentials: 'include',
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to update project (${response.status})`);
  }

  return await response.json();
}

/**
 * Deletes a project and its documents/R2 storage.
 */
export async function deleteProject(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetch(apiUrl(`/api/projects/${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to delete project (${response.status})`);
  }
}
