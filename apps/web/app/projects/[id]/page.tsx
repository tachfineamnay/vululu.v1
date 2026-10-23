'use client';

import { useParams } from 'next/navigation';
import ProjectStudio from '../../../components/ProjectStudio';

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  return <ProjectStudio id={id} />;
}
