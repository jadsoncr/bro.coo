import { useState } from 'react';
import { setToken } from '../lib/api.js';

export default function RegisterPage({ onRegistered }) {
  const [form, setForm] = useState({
    nome: '',
    email: '',
    senha: '',
    empresa: '',
    segmento: 'advocacia',
    moeda: 'BRL',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nome || !form.email || !form.senha) {
      setError('Preencha todos os campos obrigatórios');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar conta');
      setToken(data.token);
      onRegistered();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-card" style={{ maxWidth: 480 }}>
        <div className="login-brand">
          <strong>BRO Revenue</strong>
          <span>Criar sua conta</span>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Seu nome *
            <input value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="João Silva" required />
          </label>

          <label>
            Email *
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="joao@empresa.com" required />
          </label>

          <label>
            Senha *
            <input type="password" value={form.senha} onChange={e => set('senha', e.target.value)} placeholder="Mínimo 6 caracteres" required minLength={6} />
          </label>

          <label>
            Nome da empresa
            <input value={form.empresa} onChange={e => set('empresa', e.target.value)} placeholder="Ex: Santos & Bastos Advogados" />
          </label>

          <label>
            Segmento
            <select value={form.segmento} onChange={e => set('segmento', e.target.value)}>
              <option value="advocacia">Advocacia</option>
              <option value="clinica">Clínica</option>
              <option value="imobiliaria">Imobiliária</option>
            </select>
          </label>

          <label>
            Moeda
            <select value={form.moeda} onChange={e => set('moeda', e.target.value)}>
              <option value="BRL">R$ (BRL)</option>
              <option value="EUR">€ (EUR)</option>
            </select>
          </label>

          {error && <p className="error">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? 'Criando conta...' : 'Criar conta e entrar'}
          </button>
        </form>
      </div>
    </main>
  );
}
