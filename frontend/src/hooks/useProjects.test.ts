import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useProjects } from './useProjects';
import * as projectService from '../services/projectService';
import type { Project } from '../models/Project';

vi.mock('../services/projectService');

describe('useProjects', () => {
  const initialProjects: Project[] = [
    {
      id: 'p1',
      name: 'Project 1',
      owner_id: 'user1',
      created_at: '2026-01-01',
      document_count: 3,
      page_count: 10,
      documents: [
        {
          id: 'd1',
          project_id: 'p1',
          filename: 'doc1.pdf',
          storage_path: 'path/doc1.pdf',
          created_at: '2026-01-01',
          pages: [],
        },
      ],
    },
    {
      id: 'p2',
      name: 'Project 2',
      owner_id: 'user1',
      created_at: '2026-01-02',
      document_count: 0,
      page_count: 0,
      documents: [],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches projects on mount', async () => {
    vi.mocked(projectService.listProjects).mockResolvedValueOnce(initialProjects);

    const { result } = renderHook(() => useProjects());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.projects).toEqual(initialProjects);
    expect(result.current.error).toBeNull();
  });

  it('handles fetch error on mount', async () => {
    vi.mocked(projectService.listProjects).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useProjects());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.projects).toEqual([]);
  });

  it('preserves document_count, page_count, and documents when renaming a project', async () => {
    vi.mocked(projectService.listProjects).mockResolvedValueOnce(initialProjects);
    vi.mocked(projectService.updateProject).mockResolvedValueOnce({
      id: 'p1',
      name: 'Renamed Project 1',
      owner_id: 'user1',
      created_at: '2026-01-01',
    });

    const { result } = renderHook(() => useProjects());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.rename('p1', 'Renamed Project 1');
    });

    const updated = result.current.projects.find((p) => p.id === 'p1');
    expect(updated).toBeDefined();
    expect(updated?.name).toBe('Renamed Project 1');
    expect(updated?.document_count).toBe(3);
    expect(updated?.page_count).toBe(10);
    expect(updated?.documents?.length).toBe(1);
  });

  it('initializes document_count, page_count, and documents when creating a project', async () => {
    vi.mocked(projectService.listProjects).mockResolvedValueOnce([]);
    vi.mocked(projectService.createProject).mockResolvedValueOnce({
      id: 'p3',
      name: 'Brand New',
      owner_id: 'user1',
      created_at: '2026-01-03',
    });

    const { result } = renderHook(() => useProjects());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.create('Brand New');
    });

    expect(result.current.projects).toHaveLength(1);
    expect(result.current.projects[0]).toEqual({
      id: 'p3',
      name: 'Brand New',
      owner_id: 'user1',
      created_at: '2026-01-03',
      document_count: 0,
      page_count: 0,
      documents: [],
    });
  });

  it('removes project from state upon deletion', async () => {
    vi.mocked(projectService.listProjects).mockResolvedValueOnce(initialProjects);
    vi.mocked(projectService.deleteProject).mockResolvedValueOnce();

    const { result } = renderHook(() => useProjects());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.remove('p1');
    });

    expect(result.current.projects).toHaveLength(1);
    expect(result.current.projects[0].id).toBe('p2');
  });
});
