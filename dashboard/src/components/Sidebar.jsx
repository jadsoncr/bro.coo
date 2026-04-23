import { useMemo } from 'react';

const MENU_ITEMS = {
  MASTER: [
    { key: 'master', icon: '🏢', label: 'Consolidado' },
    { key: 'owner', icon: '📊', label: 'Dashboard' },
    { key: 'operator', icon: '💬', label: 'Operação' },
    { key: 'config', icon: '⚙️', label: 'Configurações' },
    { key: 'onboarding', icon: '🚀', label: 'Novo Cliente' },
  ],
  OWNER: [
    { key: 'owner', icon: '📊', label: 'Dashboard' },
    { key: 'operator', icon: '💬', label: 'Operação' },
    { key: 'config', icon: '⚙️', label: 'Configurações' },
  ],
  OPERATOR: [
    { key: 'operator', icon: '💬', label: 'Operação' },
  ],
};

export default function Sidebar({ view, role, tenantName, userName, onNavigate, onLogout, collapsed, onToggle }) {
  const items = useMemo(() => MENU_ITEMS[role] || MENU_ITEMS.OPERATOR, [role]);

  return (
    <aside className={`sidebar${collapsed ? ' sidebar-collapsed' : ''}`}>
      <div className="sidebar-brand" onClick={onToggle} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onToggle()}>
        <span className="sidebar-logo">B</span>
        {!collapsed && <span className="sidebar-title">BRO Revenue</span>}
      </div>

      <nav className="sidebar-nav">
        {items.map(item => (
          <button
            key={item.key}
            type="button"
            className={`sidebar-item${view === item.key ? ' active' : ''}`}
            onClick={() => onNavigate(item.key)}
            title={item.label}
          >
            <span className="sidebar-icon">{item.icon}</span>
            {!collapsed && <span className="sidebar-label">{item.label}</span>}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        {!collapsed && tenantName && (
          <div className="sidebar-tenant">{tenantName}</div>
        )}
        {!collapsed && userName && (
          <div className="sidebar-user">{userName}</div>
        )}
        <button type="button" className="sidebar-item sidebar-logout" onClick={onLogout} title="Sair">
          <span className="sidebar-icon">🚪</span>
          {!collapsed && <span className="sidebar-label">Sair</span>}
        </button>
      </div>
    </aside>
  );
}
