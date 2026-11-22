'use client';

import React, { useState } from 'react';
import { useTranslation } from '@/components/LanguageProvider';
import type { FlowRecipe, MissingItem } from '@/lib/chefFlow';

export interface ChefFlowState {
  step: 'existing' | 'confirm' | 'pantry' | 'planner' | 'final';
  request: string;
  recipes: FlowRecipe[];
  have?: string[];
  missing?: MissingItem[];
  done?: string; // label of the choice already made; buttons lock once set
}

interface Props {
  flow: ChefFlowState;
  busy?: boolean;
  onAction: (action: string, payload?: any) => void;
}

const btn = 'px-3 py-1.5 rounded-xl border text-xs font-bold transition shadow-xs hover:scale-[1.02] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100';

export default function ChefFlowCard({ flow, busy, onAction }: Props) {
  const { t } = useTranslation();
  const [date, setDate] = useState('');
  const locked = Boolean(flow.done) || Boolean(busy);

  const primary: React.CSSProperties = { backgroundColor: 'var(--color-primary)', borderColor: 'var(--color-primary)', color: '#fff' };
  const plain: React.CSSProperties = { backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' };

  const Btn = ({ label, action, payload, main }: { label: string; action: string; payload?: any; main?: boolean }) => (
    <button type="button" disabled={locked} onClick={() => onAction(action, { ...payload, label })} className={btn} style={main ? primary : plain}>
      {label}
    </button>
  );

  return (
    <div className="rounded-2xl border p-3 space-y-3 transition-colors duration-200" style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }} role="region">
      {(flow.step === 'existing' || flow.step === 'confirm') && (
        <>
          <ul className="space-y-1.5">
            {flow.recipes.map((r, i) => {
              let origin = t('chefFlowAiGenerated', 'AI generated');
              if (r.fromSaved) origin = r.book ? `${t('chefFlowBook', 'Book')}: ${r.book}` : t('chefFlowSavedRecipe', 'Saved recipe');
              else if (r.sourceUrl) { try { origin = new URL(r.sourceUrl).hostname.replace(/^www\./, ''); } catch (_) { origin = t('chefFlowWebsite', 'Website'); } }
              return (
                <li key={(r.id || r.title) + i} className="flex items-center gap-2 text-xs">
                  <span className="text-base">🍽️</span>
                  <span className="font-bold truncate">{r.title}</span>
                  <span className="shrink-0" style={{ color: 'var(--color-text-secondary)' }}>· {origin}</span>
                </li>
              );
            })}
          </ul>
          <p className="text-xs font-bold">{t('chefFlowLikeAll', 'Do you like all of these?')}</p>
          <div className="flex flex-wrap gap-2">
            <Btn main label={t('chefFlowYesAll', 'Yes, I like them all')} action="confirm_yes" />
            <Btn label={t('chefFlowDifferent', 'No, find different ones')} action="confirm_no" />
          </div>
        </>
      )}

      {flow.step === 'pantry' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 text-xs">
            <div>
              <p className="font-black mb-1" style={{ color: 'var(--color-emerald)' }}>✅ {t('chefFlowInPantry', 'In your pantry')} ({flow.have?.length || 0})</p>
              <ul className="space-y-0.5">{(flow.have || []).slice(0, 12).map((l, i) => <li key={i}>{l}</li>)}</ul>
            </div>
            <div>
              <p className="font-black mb-1" style={{ color: 'var(--color-primary)' }}>🛒 {t('chefFlowToBuy', 'Still need')} ({flow.missing?.length || 0})</p>
              <ul className="space-y-0.5">{(flow.missing || []).slice(0, 12).map((l, i) => <li key={i}>{l.line}</li>)}</ul>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn main label={t('chefFlowContinue', 'Continue to planner')} action="to_planner" />
          </div>
        </>
      )}

      {flow.step === 'planner' && (
        <>
          <p className="text-xs font-bold">{t('chefFlowWhenCook', 'When do you want to start cooking?')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Btn main label={t('chefFlowToday', 'Today')} action="plan" payload={{ when: 'today' }} />
            <Btn label={t('chefFlowTomorrow', 'Tomorrow')} action="plan" payload={{ when: 'tomorrow' }} />
            <Btn label={t('chefFlowNextMonday', 'Next Monday')} action="plan" payload={{ when: 'monday' }} />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={locked}
              autoComplete="off"
              data-lpignore="true"
              data-form-type="other"
              className="px-2 py-1.5 rounded-xl border text-xs"
              style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
            <button type="button" disabled={locked || !date} onClick={() => onAction('plan', { when: 'date', date, label: date })} className={btn} style={plain}>
              {t('chefFlowPickDate', 'Use this date')}
            </button>
            <Btn label={t('chefFlowSkip', 'Skip')} action="skip_plan" />
          </div>
        </>
      )}

      {flow.step === 'final' && (
        <div className="flex flex-wrap gap-2">
          <Btn main label={t('chefFlowBlueprint', 'Create meal blueprint')} action="blueprint" />
          <Btn label={t('chefFlowShopping', 'Add missing ingredients to shopping list')} action="shopping" />
          <Btn label={t('chefFlowBoth', 'Both')} action="both" />
          <Btn label={t('chefFlowNoThanks', 'No thanks')} action="finish" />
        </div>
      )}

      {flow.done && (
        <p className="text-[11px] font-bold" style={{ color: 'var(--color-text-secondary)' }}>✓ {flow.done}</p>
      )}
    </div>
  );
}
