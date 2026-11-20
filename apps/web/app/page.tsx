import { cookies } from 'next/headers';
import ProjectDashboard from '../components/ProjectDashboard';
import { PublicLanding } from '../components/PublicLanding';

export default async function Home() {
  // Presence only: the dashboard still validates the HttpOnly session with the API.
  return (await cookies()).has('session') ? <ProjectDashboard /> : <PublicLanding />;
}
