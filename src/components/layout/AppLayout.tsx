import React, { useState } from 'react';
import Sidebar from './Sidebar';
import TopNav from './TopNav';
import ActivityTrackingNotice from './ActivityTrackingNotice';

interface AppLayoutProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  children: React.ReactNode;
}

export default function AppLayout({ currentPage, onNavigate, children }: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="app-shell min-h-screen text-slate-900" style={{ background: '#f7f8fa' }}>
      <Sidebar
        currentPage={currentPage}
        onNavigate={onNavigate}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(c => !c)}
      />
      <TopNav
        onMenuToggle={() => setSidebarCollapsed(c => !c)}
        onNavigate={onNavigate}
        sidebarCollapsed={sidebarCollapsed}
      />
      <main
        className={`pt-[72px] min-h-screen transition-all duration-300 ${
          sidebarCollapsed ? 'lg:pl-[72px]' : 'lg:pl-[260px]'
        }`}
      >
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto">
          <ActivityTrackingNotice />
          {children}
        </div>
      </main>
    </div>
  );
}
