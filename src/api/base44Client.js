/**
 * src/api/base44Client.js — Drop-in replacement that routes base44.entities.X → db.X
 * This lets all existing imports of base44 keep working without changes.
 * The actual data calls go through supabaseClient.js → Supabase.
 */
import { db } from '@/api/supabaseClient';

// Wrap db so base44.entities.EntityName works identically to before
export const base44 = {
  entities: new Proxy({}, {
    get(_, entityName) {
      if (db[entityName]) return db[entityName];
      console.warn(`base44.entities.${entityName} not found in db registry`);
      return {
        list: async () => [],
        get: async () => null,
        create: async (d) => d,
        update: async (id, d) => d,
        delete: async () => {},
        filter: async () => [],
      };
    }
  })
};
