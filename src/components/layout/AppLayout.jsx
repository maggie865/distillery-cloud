import { Outlet } from 'react-router-dom';
import TopNav from './TopNav.jsx';
import HubSidebar from './HubSidebar.jsx';
import BottomNav from './BottomNav.jsx';

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-background w-full">
      <TopNav />
      <div className="flex w-full items-start">
        <HubSidebar />
        <main className="w-full min-w-0">
          <div className="p-4 md:p-8 pb-24 md:pb-8 max-w-7xl mx-auto w-full min-w-0">
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
