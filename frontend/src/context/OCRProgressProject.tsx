import React, { useState } from "react";


export default function OCRProgressThing() {
  const [documents, setDocuments] = useState([])
  const [projects, setProjects] = useState([])

  return (<div className="w-300 h-32 bg-blue-50 rounded-2xl">
    Progress of projects
  </div>)
}