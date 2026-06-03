import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './store/store';
import AuthInit from './components/AuthInit';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import OrgChart from './pages/OrgChart/OrgChartView';
import InstructionsList from './pages/Instructions/InstructionsList';
import InstructionDetail from './pages/Instructions/InstructionDetail';
import Statistics from './pages/Statistics/StatisticsView';
import WorkPlans from './pages/WorkPlans/WorkPlansList';
import Communication from './pages/Communication/CommunicationView';
import FinancialPlanning from './pages/FinancialPlanning/FinancialOverview';
import UsersView from './pages/Users/UsersView';
import DepartmentsView from './pages/Departments/DepartmentsView';

function App() {
  return (
    <Provider store={store}>
      <BrowserRouter>
        <AuthInit>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="org-chart" element={<OrgChart />} />
              <Route path="instructions" element={<InstructionsList />} />
              <Route path="instructions/:id" element={<InstructionDetail />} />
              <Route path="statistics" element={<Statistics />} />
              <Route path="work-plans" element={<WorkPlans />} />
              <Route path="communication" element={<Communication />} />
              <Route path="financial-planning" element={<FinancialPlanning />} />
              <Route path="users" element={<UsersView />} />
              <Route path="departments" element={<DepartmentsView />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthInit>
      </BrowserRouter>
    </Provider>
  );
}

export default App;
