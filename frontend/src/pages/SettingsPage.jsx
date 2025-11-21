import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Header } from '../components/Header';
import '../styles/SettingsPage.css';

/**
 * SettingsPage - Manage application settings
 * 
 * Features:
 * 1. Auto-receipt creation rules (by keywords or senders)
 * 2. Saved payment purposes templates
 * 3. Default receipt settings
 */
function SettingsPage() {
  const navigate = useNavigate();
  const { selectedUserIndex, selectedBank } = useAuth();
  
  // Auto-receipt rules state
  const [autoReceiptRules, setAutoReceiptRules] = useState([]);
  const [showAddRuleModal, setShowAddRuleModal] = useState(false);
  const [newRule, setNewRule] = useState({
    type: 'keyword', // 'keyword' or 'sender'
    value: '',
    serviceName: '',
    enabled: true
  });
  
  // Saved payment purposes state
  const [savedPurposes, setSavedPurposes] = useState([]);
  const [showAddPurposeModal, setShowAddPurposeModal] = useState(false);
  const [newPurpose, setNewPurpose] = useState('');
  
  const [successMessage, setSuccessMessage] = useState(null);

  // Load settings from localStorage on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = () => {
    // Load auto-receipt rules
    const storedRules = localStorage.getItem('syntax_auto_receipt_rules');
    if (storedRules) {
      try {
        setAutoReceiptRules(JSON.parse(storedRules));
      } catch (err) {
        console.error('Error loading auto-receipt rules:', err);
      }
    }

    // Load saved payment purposes
    const storedPurposes = localStorage.getItem('syntax_saved_purposes');
    if (storedPurposes) {
      try {
        setSavedPurposes(JSON.parse(storedPurposes));
      } catch (err) {
        console.error('Error loading saved purposes:', err);
      }
    }
  };

  const saveAutoReceiptRules = (rules) => {
    localStorage.setItem('syntax_auto_receipt_rules', JSON.stringify(rules));
    setAutoReceiptRules(rules);
  };

  const saveSavedPurposes = (purposes) => {
    localStorage.setItem('syntax_saved_purposes', JSON.stringify(purposes));
    setSavedPurposes(purposes);
  };

  // Auto-receipt rules handlers
  const handleAddRule = () => {
    if (!newRule.value.trim() || !newRule.serviceName.trim()) {
      alert('Заполните все поля');
      return;
    }

    const rule = {
      id: Date.now(),
      type: newRule.type,
      value: newRule.value.trim(),
      serviceName: newRule.serviceName.trim(),
      enabled: true,
      createdAt: new Date().toISOString()
    };

    const updatedRules = [...autoReceiptRules, rule];
    saveAutoReceiptRules(updatedRules);
    
    setNewRule({ type: 'keyword', value: '', serviceName: '', enabled: true });
    setShowAddRuleModal(false);
    showSuccess('Правило добавлено');
  };

  const handleToggleRule = (ruleId) => {
    const updatedRules = autoReceiptRules.map(rule => 
      rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule
    );
    saveAutoReceiptRules(updatedRules);
  };

  const handleDeleteRule = (ruleId) => {
    if (confirm('Удалить это правило?')) {
      const updatedRules = autoReceiptRules.filter(rule => rule.id !== ruleId);
      saveAutoReceiptRules(updatedRules);
      showSuccess('Правило удалено');
    }
  };

  // Saved purposes handlers
  const handleAddPurpose = () => {
    if (!newPurpose.trim()) {
      alert('Введите назначение платежа');
      return;
    }

    if (savedPurposes.includes(newPurpose.trim())) {
      alert('Такое назначение уже существует');
      return;
    }

    const updatedPurposes = [...savedPurposes, newPurpose.trim()];
    saveSavedPurposes(updatedPurposes);
    
    setNewPurpose('');
    setShowAddPurposeModal(false);
    showSuccess('Назначение платежа добавлено');
  };

  const handleDeletePurpose = (purpose) => {
    if (confirm(`Удалить "${purpose}"?`)) {
      const updatedPurposes = savedPurposes.filter(p => p !== purpose);
      saveSavedPurposes(updatedPurposes);
      showSuccess('Назначение платежа удалено');
    }
  };

  const showSuccess = (message) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  return (
    <div className="settings-page">
      <Header />
      
      <div className="page-title-section">
        <h1>⚙️ Настройки</h1>
        <p className="header-subtitle">Управление автоматизацией и шаблонами</p>
      </div>

      {successMessage && (
        <div className="alert alert-success">
          ✅ {successMessage}
        </div>
      )}

      {/* Current User Info */}
      {selectedUserIndex && (
        <section className="settings-section user-info-section">
          <div className="user-info-card">
            <div className="user-info-header">
              <div className="user-info-icon">👤</div>
              <div className="user-info-content">
                <div className="user-info-label">Текущий пользователь</div>
                <div className="user-info-value">
                  {selectedBank?.toUpperCase()}{selectedUserIndex}
                </div>
                {selectedBank && (
                  <div className="user-info-bank">
                    Банк: <span className="bank-badge">{selectedBank.toUpperCase()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Auto-receipt rules section */}
      <section className="settings-section">
        <div className="section-header">
          <div>
            <h2>🤖 Автоматическое создание чеков</h2>
            <p className="section-description">
              Настройте правила для автоматического создания чеков на основе ключевых слов или отправителей
            </p>
          </div>
          <button 
            className="btn-add"
            onClick={() => setShowAddRuleModal(true)}
          >
            + Добавить правило
          </button>
        </div>

        {autoReceiptRules.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📝</div>
            <p>Правила не настроены. Добавьте первое правило для автоматизации.</p>
          </div>
        ) : (
          <div className="rules-list">
            {autoReceiptRules.map(rule => (
              <div key={rule.id} className={`rule-card ${!rule.enabled ? 'disabled' : ''}`}>
                <div className="rule-main">
                  <div className="rule-toggle">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={() => handleToggleRule(rule.id)}
                      className="toggle-checkbox"
                    />
                  </div>
                  <div className="rule-content">
                    <div className="rule-type">
                      {rule.type === 'keyword' ? '🔍 Ключевое слово' : '👤 Отправитель'}
                    </div>
                    <div className="rule-value">"{rule.value}"</div>
                    <div className="rule-arrow">→</div>
                    <div className="rule-service">
                      <span className="service-label">Услуга:</span>
                      <span className="service-value">{rule.serviceName}</span>
                    </div>
                  </div>
                  <button 
                    className="btn-delete-rule"
                    onClick={() => handleDeleteRule(rule.id)}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Saved payment purposes section */}
      <section className="settings-section">
        <div className="section-header">
          <div>
            <h2>💼 Сохраненные назначения платежа</h2>
            <p className="section-description">
              Шаблоны для быстрого заполнения назначения платежа при создании чеков
            </p>
          </div>
          <button 
            className="btn-add"
            onClick={() => setShowAddPurposeModal(true)}
          >
            + Добавить шаблон
          </button>
        </div>

        {savedPurposes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <p>Шаблоны не сохранены. Добавьте часто используемые назначения платежей.</p>
          </div>
        ) : (
          <div className="purposes-grid">
            {savedPurposes.map((purpose, index) => (
              <div key={index} className="purpose-card">
                <div className="purpose-text">{purpose}</div>
                <button 
                  className="btn-delete-purpose"
                  onClick={() => handleDeletePurpose(purpose)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Add Rule Modal */}
      {showAddRuleModal && (
        <div className="modal-overlay" onClick={() => setShowAddRuleModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Добавить правило</h2>
              <button className="modal-close" onClick={() => setShowAddRuleModal(false)}>×</button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Тип правила</label>
                <select 
                  value={newRule.type}
                  onChange={(e) => setNewRule({...newRule, type: e.target.value})}
                  className="form-select"
                >
                  <option value="keyword">По ключевому слову в описании</option>
                  <option value="sender">По имени отправителя</option>
                </select>
              </div>

              <div className="form-group">
                <label>
                  {newRule.type === 'keyword' ? 'Ключевое слово' : 'Имя отправителя'}
                </label>
                <input
                  type="text"
                  value={newRule.value}
                  onChange={(e) => setNewRule({...newRule, value: e.target.value})}
                  placeholder={newRule.type === 'keyword' ? 'Например: консультация' : 'Например: Иван Петров'}
                  className="form-input"
                />
                <small className="form-hint">
                  {newRule.type === 'keyword' 
                    ? 'Транзакции, содержащие это слово в описании, будут создавать чек автоматически'
                    : 'Транзакции от этого отправителя будут создавать чек автоматически'}
                </small>
              </div>

              <div className="form-group">
                <label>Название услуги для чека</label>
                <input
                  type="text"
                  value={newRule.serviceName}
                  onChange={(e) => setNewRule({...newRule, serviceName: e.target.value})}
                  placeholder="Например: Консультация по веб-разработке"
                  className="form-input"
                />
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="btn-cancel"
                onClick={() => setShowAddRuleModal(false)}
              >
                Отмена
              </button>
              <button 
                className="btn-confirm"
                onClick={handleAddRule}
              >
                Добавить правило
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Purpose Modal */}
      {showAddPurposeModal && (
        <div className="modal-overlay" onClick={() => setShowAddPurposeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Добавить шаблон</h2>
              <button className="modal-close" onClick={() => setShowAddPurposeModal(false)}>×</button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Назначение платежа</label>
                <input
                  type="text"
                  value={newPurpose}
                  onChange={(e) => setNewPurpose(e.target.value)}
                  placeholder="Например: Оплата за консультацию"
                  className="form-input"
                  autoFocus
                />
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="btn-cancel"
                onClick={() => setShowAddPurposeModal(false)}
              >
                Отмена
              </button>
              <button 
                className="btn-confirm"
                onClick={handleAddPurpose}
              >
                Добавить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsPage;
