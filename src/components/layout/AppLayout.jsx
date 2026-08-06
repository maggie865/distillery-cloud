import { Outlet } from 'react-router-dom';
import TopNav from './TopNav.jsx';

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-background w-full">
      <TopNav />
      <main className="w-full">
        <div className="p-4 md:p-8 max-w-7xl mx-auto w-full min-w-0">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
