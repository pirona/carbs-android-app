// SPDX-License-Identifier: GPL-3.0-or-later
// Port of food-habits.html's library CRUD screen — OFF search, AI text interpretation
// (Phase 5), and manual entry. Cross-device sync (pushHabitsToRemote/syncHabitsFromRemote)
// is dropped — no cross-device sync in this app.
import type { HabitsRepo, HabitSortMode } from '../../storage/repos/habitsRepo';
import type { DayType, Habit, Per100 } from '../../core/types';
import { searchOFF, type OffProduct } from '../../integrations/openFoodFacts';
import { parseFoodText } from '../../integrations/n8nFoodParse';
import { computeFoodMacros, kcalFromMacros } from '../../core/calc/food';
import { escapeHtml, fmt1 } from '../util';

interface FormState {
  mode: 'add' | 'edit';
  editId?: string;
  step: 'search' | 'confirm';
  query: string;
  results: OffProduct[];
  loading: boolean;
  error: string | null;
  aiQuery: string;
  aiLoading: boolean;
  aiError: string | null;
  prefill?: {
    label: string;
    off_code: string | null;
    source: Habit['source'];
    portion_g: number;
    per100: Per100;
    day_type_tag: DayType | null;
    meal_slot: Habit['meal_slot'];
    ai_source_text?: string;
    ai_confidence?: string | null;
    ai_note?: string | null;
  };
}

const DAYTYPE_LABEL: Record<string, string> = { high: 'HIGH', medium: 'MEDIUM', low: 'LOW' };
const MEALSLOT_LABEL: Record<string, string> = {
  petit_dej: '☀️ Petit-déj',
  dejeuner: '🍽️ Déjeuner',
  diner: '🌙 Dîner',
};

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function sortHabits(list: Habit[], mode: HabitSortMode): Habit[] {
  const sorted = [...list];
  if (mode === 'recent') sorted.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
  else sorted.sort((a, b) => a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }));
  return sorted;
}

export function renderHabitsScreen(container: HTMLElement, repos: { habits: HabitsRepo }): void {
  let habits: Habit[] = [];
  let sortMode: HabitSortMode = 'alpha';
  let form: FormState | null = null;
  // True once the user has directly edited #f-kcal in the open form — once touched, macro
  // edits stop overwriting it (a printed label's kcal can legitimately differ slightly from
  // the Atwater estimate below, e.g. fiber/rounding).
  let kcalTouched = false;

  function habitRow(h: Habit): string {
    const m = computeFoodMacros(h.per100, h.portion_g);
    const tags = [DAYTYPE_LABEL[h.day_type_tag ?? ''], MEALSLOT_LABEL[h.meal_slot ?? '']]
      .filter(Boolean)
      .join(' · ');
    return `
      <div class="habit-row">
        <div class="habit-info">
          <div class="habit-label">${h.source === 'ai' ? '🤖 ' : ''}${escapeHtml(h.label)}</div>
          <div class="habit-sub">${h.portion_g} g · ${m.kcal} kcal · P${fmt1(m.protein_g)} L${fmt1(m.fat_g)} G${fmt1(m.carb_g)}</div>
          ${tags ? `<div class="habit-sub" style="color:var(--medium)">🔧 ${tags}</div>` : ''}
        </div>
        <div class="habit-actions">
          <button class="btn btn-icon" data-action="edit" data-id="${h.id}">✎</button>
          <button class="btn btn-icon" data-action="delete" data-id="${h.id}">✕</button>
        </div>
      </div>`;
  }

  function formSearchStep(f: FormState): string {
    return `
      <div class="form-block">
        <label class="field-label">Rechercher sur OpenFoodFacts</label>
        <input type="text" id="off-query" placeholder="ex: yaourt nature" value="${escapeHtml(f.query)}">
        <button class="btn btn-add" data-action="search">Rechercher</button>
        ${f.loading ? '<div class="empty-hint">Recherche en cours…</div>' : ''}
        ${f.error ? `<div class="empty-hint error-text">${escapeHtml(f.error)}</div>` : ''}
        ${f.results
          .map(
            (p, i) => `
          <div class="search-result" data-action="select-product" data-index="${i}">
            <div class="search-result-name">${escapeHtml(p.name)}</div>
            <div class="search-result-sub">${p.brand ? escapeHtml(p.brand) + ' · ' : ''}${Math.round(p.per100.kcal)} kcal/100g</div>
          </div>`,
          )
          .join('')}
        ${f.results.length === 0 && !f.loading && f.query ? '<div class="empty-hint">Aucun résultat.</div>' : ''}

        <div class="form-block">
          <label class="field-label">🤖 Décrire en langage naturel (si absent d'OpenFoodFacts)</label>
          <input type="text" id="ai-query" placeholder="ex: 2 mugs de café, 350g café moulu au total" value="${escapeHtml(f.aiQuery)}">
          <button class="btn btn-add" style="background:var(--low)" data-action="ai-interpret">Interpréter avec l'IA</button>
          ${f.aiLoading ? '<div class="empty-hint">Interprétation en cours…</div>' : ''}
          ${f.aiError ? `<div class="empty-hint error-text">${escapeHtml(f.aiError)}</div>` : ''}
        </div>

        <div class="form-actions">
          <button class="btn btn-cancel" data-action="close-form">Annuler</button>
          <button class="btn" data-action="manual-entry">Saisir à la main →</button>
        </div>
      </div>`;
  }

  function formConfirmStep(f: FormState): string {
    const p = f.prefill!;
    return `
      <div class="form-block">
        ${
          p.source === 'ai'
            ? `
          <div class="ai-banner">
            <div class="ai-banner-title">🤖 Estimation IA — à vérifier</div>
            <div>Entrée : « ${escapeHtml(p.ai_source_text)} »</div>
            ${p.ai_confidence ? `<div>Confiance : ${escapeHtml(p.ai_confidence)}</div>` : ''}
            ${p.ai_note ? `<div>Remarque : ${escapeHtml(p.ai_note)}</div>` : ''}
          </div>`
            : ''
        }
        <label class="field-label">Nom</label>
        <input type="text" id="f-label" value="${escapeHtml(p.label)}">
        <div class="field-row">
          <div>
            <label class="field-label">Portion (g)</label>
            <input type="number" id="f-portion" value="${p.portion_g}" min="1">
          </div>
          <div>
            <label class="field-label">kcal / 100g</label>
            <input type="number" id="f-kcal" value="${p.per100.kcal}" step="0.1">
          </div>
        </div>
        <div class="field-row">
          <div>
            <label class="field-label">Protéines / 100g</label>
            <input type="number" id="f-prot" value="${p.per100.protein_g}" step="0.1">
          </div>
          <div>
            <label class="field-label">Lipides / 100g</label>
            <input type="number" id="f-fat" value="${p.per100.fat_g}" step="0.1">
          </div>
        </div>
        <label class="field-label">Glucides / 100g</label>
        <input type="number" id="f-carb" value="${p.per100.carb_g}" step="0.1">

        <label class="field-label">Type de jour (optionnel)</label>
        <select id="f-daytype">
          <option value="" ${!p.day_type_tag ? 'selected' : ''}>Auto (selon glucides)</option>
          <option value="high" ${p.day_type_tag === 'high' ? 'selected' : ''}>HIGH</option>
          <option value="medium" ${p.day_type_tag === 'medium' ? 'selected' : ''}>MEDIUM</option>
          <option value="low" ${p.day_type_tag === 'low' ? 'selected' : ''}>LOW</option>
        </select>
        <label class="field-label">Repas (optionnel)</label>
        <select id="f-mealslot">
          <option value="" ${!p.meal_slot ? 'selected' : ''}>Non classé</option>
          <option value="petit_dej" ${p.meal_slot === 'petit_dej' ? 'selected' : ''}>Petit-déjeuner</option>
          <option value="dejeuner" ${p.meal_slot === 'dejeuner' ? 'selected' : ''}>Déjeuner</option>
          <option value="diner" ${p.meal_slot === 'diner' ? 'selected' : ''}>Dîner</option>
        </select>

        <div class="form-actions">
          <button class="btn btn-cancel" data-action="close-form">Annuler</button>
          <button class="btn btn-save" data-action="save-habit">Enregistrer</button>
        </div>
      </div>`;
  }

  function render() {
    const sorted = sortHabits(habits, sortMode);
    container.innerHTML = `
      <p class="hint">Bibliothèque personnelle — données réelles via OpenFoodFacts ou saisie manuelle.</p>
      <div class="card">
        <div class="list-header">
          <h2>🍽️ Bibliothèque</h2>
          <div class="sort-toggle">
            <button class="sort-btn ${sortMode === 'alpha' ? 'active' : ''}" data-action="sort" data-mode="alpha">A→Z</button>
            <button class="sort-btn ${sortMode === 'recent' ? 'active' : ''}" data-action="sort" data-mode="recent">Récent</button>
          </div>
        </div>
        ${sorted.length === 0 ? '<div class="empty-hint">Aucune habitude enregistrée.</div>' : sorted.map(habitRow).join('')}
        ${form ? (form.step === 'search' ? formSearchStep(form) : formConfirmStep(form)) : '<button class="btn btn-add" data-action="add">+ Ajouter une habitude</button>'}
      </div>
      <div class="footer">${habits.length} habitude${habits.length > 1 ? 's' : ''} au total</div>
    `;
    if (form?.step === 'search') container.querySelector<HTMLInputElement>('#off-query')?.focus();
  }

  async function doSearch() {
    const q = container.querySelector<HTMLInputElement>('#off-query')?.value.trim() ?? '';
    if (!q || !form) return;
    form.query = q;
    form.loading = true;
    form.error = null;
    render();
    try {
      form.results = await searchOFF(q);
    } catch {
      form.error = 'Recherche impossible — vérifier la connexion.';
      form.results = [];
    }
    form.loading = false;
    render();
  }

  function selectProduct(index: number) {
    if (!form) return;
    const p = form.results[index];
    form.step = 'confirm';
    kcalTouched = false;
    form.prefill = {
      label: p.name,
      off_code: p.code,
      source: 'off',
      portion_g: 100,
      per100: p.per100,
      day_type_tag: null,
      meal_slot: null,
    };
    render();
  }

  async function doAIInterpret() {
    const text = container.querySelector<HTMLInputElement>('#ai-query')?.value.trim() ?? '';
    if (!text || !form) return;
    form.aiQuery = text;
    form.aiLoading = true;
    form.aiError = null;
    render();
    try {
      const result = await parseFoodText(text);
      form.step = 'confirm';
      kcalTouched = false;
      form.prefill = {
        label: result.label,
        off_code: null,
        source: 'ai',
        portion_g: result.portion_g,
        per100: result.per100,
        day_type_tag: null,
        meal_slot: null,
        ai_source_text: text,
        ai_confidence: result.confidence,
        ai_note: result.note,
      };
    } catch (e) {
      form.aiError = `Interprétation impossible (${(e as Error).message}) — réessaie ou saisis à la main.`;
    }
    form.aiLoading = false;
    render();
  }

  function useManualEntry() {
    if (!form) return;
    form.step = 'confirm';
    kcalTouched = false;
    form.prefill = {
      label: form.query || '',
      off_code: null,
      source: 'manual',
      portion_g: 100,
      per100: { kcal: 0, protein_g: 0, fat_g: 0, carb_g: 0 },
      day_type_tag: null,
      meal_slot: null,
    };
    render();
  }

  function openEditForm(id: string) {
    const h = habits.find((x) => x.id === id);
    if (!h) return;
    kcalTouched = false;
    form = {
      mode: 'edit',
      editId: id,
      step: 'confirm',
      query: '',
      results: [],
      loading: false,
      error: null,
      aiQuery: '',
      aiLoading: false,
      aiError: null,
      prefill: {
        label: h.label,
        off_code: h.off_code,
        source: h.source,
        portion_g: h.portion_g,
        per100: { ...h.per100 },
        day_type_tag: h.day_type_tag,
        meal_slot: h.meal_slot,
      },
    };
    render();
  }

  async function saveHabitFromForm() {
    if (!form?.prefill) return;
    const label = (container.querySelector<HTMLInputElement>('#f-label')?.value ?? '').trim();
    if (!label) return;
    const portion_g = Math.max(1, parseFloat(container.querySelector<HTMLInputElement>('#f-portion')!.value) || 100);
    const per100: Per100 = {
      kcal: parseFloat(container.querySelector<HTMLInputElement>('#f-kcal')!.value) || 0,
      protein_g: parseFloat(container.querySelector<HTMLInputElement>('#f-prot')!.value) || 0,
      fat_g: parseFloat(container.querySelector<HTMLInputElement>('#f-fat')!.value) || 0,
      carb_g: parseFloat(container.querySelector<HTMLInputElement>('#f-carb')!.value) || 0,
    };
    const day_type_tag = (container.querySelector<HTMLSelectElement>('#f-daytype')!.value || null) as DayType | null;
    const meal_slot = (container.querySelector<HTMLSelectElement>('#f-mealslot')!.value || null) as Habit['meal_slot'];

    if (form.mode === 'add') {
      habits.push({
        id: uid(),
        label,
        off_code: form.prefill.off_code,
        source: form.prefill.source,
        portion_g,
        per100,
        day_type_tag,
        meal_slot,
        updated_at: Date.now(),
      });
    } else {
      const h = habits.find((x) => x.id === form!.editId);
      if (h) {
        h.label = label;
        h.portion_g = portion_g;
        h.per100 = per100;
        h.day_type_tag = day_type_tag;
        h.meal_slot = meal_slot;
        h.updated_at = Date.now();
      }
    }
    await repos.habits.save(habits);
    form = null;
    render();
  }

  async function deleteHabit(id: string) {
    if (!confirm('Supprimer cette habitude ?')) return;
    habits = habits.filter((h) => h.id !== id);
    await repos.habits.save(habits);
    render();
  }

  // 'input' fires on every keystroke (unlike 'change', which only fires on blur) — needed
  // for the kcal-from-macros recompute to actually feel live while typing.
  container.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    if (!form || form.step !== 'confirm') return;
    if (target.id === 'f-kcal') {
      kcalTouched = true;
      return;
    }
    if (kcalTouched || !['f-prot', 'f-fat', 'f-carb'].includes(target.id)) return;
    const prot = parseFloat(container.querySelector<HTMLInputElement>('#f-prot')!.value) || 0;
    const fat = parseFloat(container.querySelector<HTMLInputElement>('#f-fat')!.value) || 0;
    const carb = parseFloat(container.querySelector<HTMLInputElement>('#f-carb')!.value) || 0;
    const kcalInput = container.querySelector<HTMLInputElement>('#f-kcal');
    if (kcalInput) kcalInput.value = String(kcalFromMacros(prot, fat, carb));
  });

  container.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    switch (action) {
      case 'add':
        form = { mode: 'add', step: 'search', query: '', results: [], loading: false, error: null, aiQuery: '', aiLoading: false, aiError: null };
        render();
        break;
      case 'close-form':
        form = null;
        render();
        break;
      case 'sort':
        sortMode = target.dataset.mode as HabitSortMode;
        repos.habits.saveSortMode(sortMode);
        render();
        break;
      case 'search':
        doSearch();
        break;
      case 'select-product':
        selectProduct(Number(target.dataset.index));
        break;
      case 'ai-interpret':
        doAIInterpret();
        break;
      case 'manual-entry':
        useManualEntry();
        break;
      case 'edit':
        openEditForm(target.dataset.id!);
        break;
      case 'delete':
        deleteHabit(target.dataset.id!);
        break;
      case 'save-habit':
        saveHabitFromForm();
        break;
    }
  });

  (async () => {
    habits = await repos.habits.load();
    sortMode = await repos.habits.loadSortMode();
    render();
  })();
}
