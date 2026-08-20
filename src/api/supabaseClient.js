/**
 * supabaseClient.js — Supabase replacement for Base44
 * Drop this in as src/api/supabaseClient.js after migration.
 * Install: npm install @supabase/supabase-js
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Only Google accounts on this Workspace domain may sign in. This value also
// gates session acceptance in AuthContext.jsx - keep the two in sync.
export const ALLOWED_GOOGLE_DOMAIN = 'bluffdistillery.com';

// ── Entity-name → table-name mapping ─────────────────────────────────────────
// Acronym-aware: a run of capitals followed by a new word breaks before the
// last capital (SNSRun -> sns_run), not before every capital
// (s_n_s_run) - the naive single-pass version got this wrong.
const toTable = (name) =>
  name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
// e.g. FinishedGood → finished_good, StorageTank → storage_tank, SNSRun → sns_run

// ── Generic CRUD wrapper matching the Base44 entity interface ─────────────────
function makeEntity(entityName) {
  const table = toTable(entityName);
  return {
    async list(orderBy = 'created_at', limit = 5000) {
      const col = orderBy.startsWith('-') ? orderBy.slice(1) : orderBy;
      const asc = !orderBy.startsWith('-');
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .order(col, { ascending: asc })
        .limit(limit);
      if (error) throw error;
      return data;
    },

    async get(id) {
      const { data, error } = await supabase
        .from(table).select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },

    async create(payload) {
      const { data, error } = await supabase
        .from(table).insert([payload]).select().single();
      if (error) throw error;
      return data;
    },

    async update(id, payload) {
      const { data, error } = await supabase
        .from(table).update(payload).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },

    async delete(id) {
      const { error } = await supabase
        .from(table).delete().eq('id', id);
      if (error) throw error;
      return { id };
    },

    async filter(conditions, orderBy = 'created_at') {
      const col = orderBy.startsWith('-') ? orderBy.slice(1) : orderBy;
      const asc = !orderBy.startsWith('-');
      let q = supabase.from(table).select('*');
      for (const [key, value] of Object.entries(conditions)) {
        q = q.eq(key, value);
      }
      const { data, error } = await q.order(col, { ascending: asc });
      if (error) throw error;
      return data;
    },

    async bulkUpdate(updates) {
      // updates = [{ id, ...fields }]
      const results = await Promise.all(
        updates.map(({ id, ...fields }) =>
          supabase.from(table).update(fields).eq('id', id).select().single()
        )
      );
      const errors = results.filter(r => r.error);
      if (errors.length) throw errors[0].error;
      return results.map(r => r.data);
    },
  };
}

// ── Entity registry — add any new entities here ───────────────────────────────
export const db = {
  AppSettings:       makeEntity('AppSettings'),
  BottlingRun:       makeEntity('BottlingRun'),
  Customer:          makeEntity('Customer'),
  CustomerActivity:  makeEntity('CustomerActivity'),
  CustomerGroup:     makeEntity('CustomerGroup'),
  CustomerGroupMember: makeEntity('CustomerGroupMember'),
  CustomerOrder:     makeEntity('CustomerOrder'),
  CustomerParLevel:  makeEntity('CustomerParLevel'),
  CustomerRequest:   makeEntity('CustomerRequest'),
  CustomerStockCheck: makeEntity('CustomerStockCheck'),
  DashboardLink:     makeEntity('DashboardLink'),
  Dilution:          makeEntity('Dilution'),
  Dispatch:          makeEntity('Dispatch'),
  DistillationRun:   makeEntity('DistillationRun'),
  DistillationRunLotUsage: makeEntity('DistillationRunLotUsage'),
  EnvironmentalAspect: makeEntity('EnvironmentalAspect'),
  EnvironmentalObjective: makeEntity('EnvironmentalObjective'),
  EnvironmentalPolicy: makeEntity('EnvironmentalPolicy'),
  FinishedGood:      makeEntity('FinishedGood'),
  FoodRecall:        makeEntity('FoodRecall'),
  LegalRequirement:  makeEntity('LegalRequirement'),
  MaintenanceRecord: makeEntity('MaintenanceRecord'),
  ManagementReview:  makeEntity('ManagementReview'),
  MasterBatch:       makeEntity('MasterBatch'),
  MockRecall:        makeEntity('MockRecall'),
  PagePermission:    makeEntity('PagePermission'),
  PestControlLog:    makeEntity('PestControlLog'),
  PestControlTrap:   makeEntity('PestControlTrap'),
  Product:           makeEntity('Product'),
  ProductAlias:      makeEntity('ProductAlias'),
  ProductionPlan:    makeEntity('ProductionPlan'),
  RawMaterial:       makeEntity('RawMaterial'),
  Receiving:         makeEntity('Receiving'),
  Recipe:            makeEntity('Recipe'),
  SNSRun:            makeEntity('SNSRun'),
  StockTake:         makeEntity('StockTake'),
  StockTakeLine:     makeEntity('StockTakeLine'),
  StockThreshold:    makeEntity('StockThreshold'),
  StorageTank:       makeEntity('StorageTank'),
  SubBatch:          makeEntity('SubBatch'),
  Supplier:          makeEntity('Supplier'),
  TankMovement:      makeEntity('TankMovement'),
  TemperatureLog:    makeEntity('TemperatureLog'),
  UtilityLog:        makeEntity('UtilityLog'),
  WarehouseStock:    makeEntity('WarehouseStock'),
  WastageRecord:     makeEntity('WastageRecord'),
  WasteRecord:       makeEntity('WasteRecord'),
  WhiskeyBarrel:     makeEntity('WhiskeyBarrel'),
  XeroItemMapping:   makeEntity('XeroItemMapping'),
};

// ── Named exports matching current import style ───────────────────────────────
// Pages import: import { db } from '@/api/supabaseClient'
// base44Client users: import { base44 } from '@/api/base44Client'
// After migration, base44.entities.X → db.X

// ── Auth helpers ──────────────────────────────────────────────────────────────
export const auth = {
  signInWithGoogle: (redirectTo) =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        // `hd` narrows Google's account chooser to this Workspace domain.
        // This is a UI hint only, not a security boundary - the real
        // enforcement is the domain check in AuthContext plus the Supabase
        // "Before User Created" auth hook (see supabase/migrations/).
        queryParams: { hd: ALLOWED_GOOGLE_DOMAIN },
      },
    }),
  signOut: () =>
    supabase.auth.signOut(),
  getUser: () =>
    supabase.auth.getUser(),
  onAuthStateChange: (cb) =>
    supabase.auth.onAuthStateChange(cb),
};

// ── Admin RPCs — super_admin only, enforced server-side ────────────────────
// See public.list_users_for_admin / public.set_user_role in
// 20260806030000_roles_and_permissions.sql. Both re-check the caller's role
// from their JWT inside the function itself, so calling these as a non
// super_admin fails server-side regardless of what the UI shows.
export const admin = {
  listUsers: () => supabase.rpc('list_users_for_admin'),
  setUserRole: (userId, role) => supabase.rpc('set_user_role', { target_user_id: userId, new_role: role }),
};

// ── Order numbering — atomic, server-side (see generate_order_number() in
// supabase/migrations/) — never generate order numbers client-side. ────────
export const orders = {
  generateOrderNumber: () => supabase.rpc('generate_order_number'),
};
