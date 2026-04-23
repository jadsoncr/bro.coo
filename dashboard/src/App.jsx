import { useEffect, useState } from 'react';
import OperatorInterface from './components/OperatorInterface.jsx';
import OwnerDashboard from './components/OwnerDashboard.jsx';
import MasterPanel from './components/MasterPanel.jsx';
import LoginPage from './components/LoginPage.jsx';
import ConfigPage from './components/ConfigPage.jsx';
import RegisterPage from './components/RegisterPage.jsx';
import WelcomePage from './components/WelcomePage.jsx';
import OnboardingWizard from './components/OnboardingWizard.jsx';
import BillingBanner from './components/BillingBanner.jsx';
import Sidebar from './components/Sidebar.jsx';
import {
  getToken,
  clearToken,
  getOwnerConfig,
} from './lib/api.js';
import './styles.css';

// ═══ JWT decode ═══
function decodeJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return { userId: payload.userId, tenantId: payload.tenantId, role: payload.role };
  } catch { return null; }
}

function getInitialView() {
  const path = window.location.pathname;
  if (path === '/boas-vindas') return 'register';

  const token = getToken();
  if (token) {
    const claims = decodeJWT(token);
    if (claims?.role === 'MASTER') return 'master';
    if (claims?.role === 'OPERATOR') return 'operator';
    if (claims?.role === 'OWNER') return 'owner';
  }
  return 'login';
}

export default function App() {
  const [view, setView] = useState(getInitialView);
  const [activeTenantId, setActiveTenantId] = useState(null);
  const [billing, setBilling] = useState({ billingStatus: 'active', billingDueDate: null });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [tenantName, setTenantName] = useState('');
  const [userName, setUserName] = useState('');

  const userRole = (() => {
    const token = getToken();
    if (!token) return null;
    return decodeJWT(token)?.role || null;
  })();

  // Load billing + tenant info
  useEffect(() => {
    if (['operator', 'owner', 'config', 'master'].includes(view) && getToken()) {
      const role = decodeJWT(getToken())?.role;
      if (role === 'MASTER' && !activeTenantId) return;

      getOwnerConfig(activeTenantId).then(data => {
        if (data?.billingStatus) setBilling({ billingStatus: data.billingStatus, billingDueDate: data.billingDueDate });
        if (data?.nome) setTenantName(data.nome);
      }).catch(() => {
        setBilling({ billingStatus: 'active', billingDueDate: null });
      });
    }
  }, [view, activeTenantId]);

  // Set user name from token
  useEffect(() => {
    const token = getToken();
    if (token) {
      try {
        const parts = token.split('.');
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        setUserName(payload.nome || payload.email || '');
      } catch { /* ignore */ }
    }
  }, [view]);

  function handleLogin() {
    const token = getToken();
    const claims = decodeJWT(token);
    if (claims?.role === 'MASTER') setView('master');
    else if (claims?.role === 'OPERATOR') setView('operator');
    else if (claims?.role === 'OWNER') setView('owner');
    else setView('login');
  }

  function handleLogout() {
    clearToken();
    setActiveTenantId(null);
    setView('login');
  }

  // ═══ Unauthenticated views (no sidebar) ═══

  if (view === 'login') {
    return (
      <div>
        <LoginPage onLogin={handleLogin} />
        <div style={{ textAlign: 'center', padding: '10px' }}>
          <button className="secondary" type="button" onClick={() => setView('onboarding')} style={{ fontSize: 13 }}>Criar conta</button>
        </div>
      </div>
    );
  }

  if (view === 'register') {
    return (
      <div>
        <RegisterPage onRegistered={() => { handleLogin(); setView('welcome'); }} />
        <div style={{ textAlign: 'center', padding: '10px' }}>
          <button className="secondary" type="button" onClick={() => setView('login')} style={{ fontSize: 13 }}>Já tenho conta</button>
          <span style={{ margin: '0 8px', color: '#9ca3af' }}>|</span>
          <button className="secondary" type="button" onClick={() => setView('onboarding')} style={{ fontSize: 13 }}>Setup guiado</button>
        </div>
      </div>
    );
  }

  if (view === 'onboarding') {
    return (
      <OnboardingWizard onComplete={() => { handleLogin(); setView('welcome'); }} />
    );
  }

  if (view === 'welcome') {
    return (
      <WelcomePage
        onGoToDashboard={() => {
          const claims = decodeJWT(getToken());
          setView(claims?.role === 'OWNER' ? 'owner' : 'operator');
        }}
        onGoToConfig={() => setView('config')}
      />
    );
  }

  // ═══ Authenticated views (with sidebar) ═══

  function renderContent() {
    switch (view) {
      case 'master':
        return (
          <MasterPanel onViewTenant={(tenantId, viewType) => {
            setActiveTenantId(tenantId);
            setView(viewType);
          }} />
        );
      case 'owner':
        return <OwnerDashboard tenantId={userRole === 'MASTER' ? activeTenantId : null} onNavigateOperator={() => setView('operator')} />;
      case 'operator':
        return <OperatorInterface tenantId={userRole === 'MASTER' ? activeTenantId : null} />;
      case 'config':
        return <ConfigPage tenantId={userRole === 'MASTER' ? activeTenantId : null} />;
      default:
        return <OwnerDashboard tenantId={null} onNavigateOperator={() => setView('operator')} />;
    }
  }

  return (
    <div className={`app-layout${sidebarCollapsed ? ' collapsed' : ''}`}>
      <Sidebar
        view={view}
        role={userRole}
        tenantName={tenantName}
        userName={userName}
        onNavigate={setView}
        onLogout={handleLogout}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <div className="app-main">
        <BillingBanner billingStatus={billing.billingStatus} billingDueDate={billing.billingDueDate} />
        {renderContent()}
      </div>
    </div>
  );
}
