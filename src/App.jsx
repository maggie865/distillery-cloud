import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ProtectedRoute from '@/components/ProtectedRoute';
import RoleRoute from '@/components/RoleRoute';
import Login from '@/pages/Login';
import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import Receiving from '@/pages/Receiving';
import Dilutions from '@/pages/Dilutions';
import Distillation from '@/pages/Distillation';
import Bottling from '@/pages/Bottling';
import Inventory from '@/pages/Inventory';
import Warehouse from '@/pages/Warehouse';
import RawMaterials from '@/pages/RawMaterials';
import BatchTracker from '@/pages/BatchTracker';
import Tanks from '@/pages/Tanks';
import BottlingFloor from '@/pages/BottlingFloor';
import DispatchHub from '@/pages/DispatchHub';
import Customers from '@/pages/Customers';
import Reports from '@/pages/Reports';
import Settings from '@/pages/Settings';
import SNSDistillation from '@/pages/SNSDistillation';
import StockTakes from '@/pages/StockTakes';
import FoodRecallManager from '@/pages/FoodRecall';
import MaintenanceRecords from '@/pages/MaintenanceRecords';
import PestControl from '@/pages/PestControl';
import Checklists from '@/pages/Checklists';
import WasteTracker from '@/pages/WasteTracker';
import TemperatureLogs from '@/pages/TemperatureLogs';
import Suppliers from '@/pages/Suppliers';
import WhiskeyBarrels from '@/pages/WhiskeyBarrels';
import UtilityTracker from '@/pages/UtilityTracker';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError?.type === 'user_not_registered') {
    return <UserNotRegisteredError />;
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<AppLayout />}>
          <Route element={<RoleRoute allowedRoles={['admin', 'user']} fallback="/bottling-floor" />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/receiving" element={<Receiving />} />
            <Route path="/dilutions" element={<Dilutions />} />
            <Route path="/distillation" element={<Distillation />} />
            <Route path="/bottling" element={<Bottling />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/warehouse" element={<Warehouse />} />
            <Route path="/raw-materials" element={<RawMaterials />} />
            <Route path="/batch-tracker" element={<BatchTracker />} />
            <Route path="/tanks" element={<Tanks />} />
            <Route path="/dispatch" element={<DispatchHub />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/sns-distillation" element={<SNSDistillation />} />
            <Route path="/stock-takes" element={<StockTakes />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/whiskey-barrels" element={<WhiskeyBarrels />} />
            <Route path="/utilities" element={<UtilityTracker />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route element={<RoleRoute allowedRoles={['admin', 'user', 'crew']} />}>
            <Route path="/bottling-floor" element={<BottlingFloor />} />
            <Route path="/food-recall" element={<FoodRecallManager />} />
            <Route path="/maintenance" element={<MaintenanceRecords />} />
            <Route path="/pest-control" element={<PestControl />} />
            <Route path="/temperature-logs" element={<TemperatureLogs />} />
            <Route path="/checklists" element={<Checklists />} />
            <Route path="/waste-tracker" element={<WasteTracker />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App