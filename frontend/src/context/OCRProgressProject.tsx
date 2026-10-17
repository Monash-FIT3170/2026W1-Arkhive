import React, { createContext, useState } from "react";
import { OcrProgressContext, type OcrProgressContextType } from './OcrProgressContext'
import type { ProjectOcrProgress } from "../models/OcrTask";

// 1. Define individual Task shape
interface OCRTask {
  id: string;
  name: string;
  status: "pending" | "processing" | "completed" | "failed";
}

// 2. Define Document shape (parent-child relationship)
interface OCRDocument {
  id: string;
  name: string;
}

// 3. Define Project shape with explicit children
interface Project {
  id: string;
  name: string;
  isProcessing: boolean;
  documents: OCRDocument[];
  tasks: OCRTask[];
  cancelTask: (id: string) => void;
  cancelAll: () => void;
  /** Removes completed / failed / cancelled tasks from the list. */
  clearFinished: () => void;

  getProjectProgress: (projectId: string) => ProjectOcrProgress;
}

export default function OCRProgressThing() {
  const [documents, setDocuments] = useState<OCRDocument[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);


  const projectContext = createContext<OcrProgressContextType | undefined>(undefined);

  return (
    <div className="p-4">
      {/* Renders when projects exist or are currently processing */}
      {isProcessing && (
        <div className="flex flex-col p-6 bg-blue-50 rounded-2xl gap-4">
          <h2 className="text-lg font-semibold text-blue-900">
            Progress of Projects
          </h2>

          {projects.map((project) => (
            <div key={project.id} className="p-4 bg-white rounded-xl shadow-sm border border-blue-100">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium text-slate-800">{project.name}</span>
                <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                  {project.isProcessing ? "Processing..." : "Complete"}
                </span>
              </div>

              <div className="mt-3 pl-4 border-l-2 border-blue-200 space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase">Documents</p>
                {project.documents.map((doc) => (
                  <div key={doc.id} className="text-sm text-slate-600">
                    {doc.name}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}