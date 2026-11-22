'use strict';
/**
 * Supabase client giả lập tối thiểu cho kiểm thử offline Edge Function AI Tutor.
 * Chỉ phủ đúng các chuỗi gọi mà `ai-tutor-api` dùng trong nhánh admin.*.
 */
let STATE = null;

function setState(s) { STATE = s; }

function builder(table, state) {
  const q = {
    _table: table,
    _cols: '*',
    _mode: 'select',
    _row: null,
    _filters: [],
    select(cols) { q._cols = cols || '*'; q._mode = 'select'; return q; },
    insert(row) { q._mode = 'insert'; q._row = row; state.inserts.push({ table, row }); return q; },
    update(row) { q._mode = 'update'; q._row = row; state.updates.push({ table, row }); return q; },
    eq(k, v) { q._filters.push([k, v]); return q; },
    is() { return q; },
    in() { return q; },
    gte() { return q; },
    lte() { return q; },
    order() { return q; },
    limit() { return q; },
    single() { return Promise.resolve({ data: singleRow(q, state), error: null }); },
    maybeSingle() { return Promise.resolve({ data: singleRow(q, state), error: null }); },
    then(resolve) { resolve({ data: null, error: null }); return q; }
  };
  return q;
}

function singleRow(q, state) {
  if (q._table === 'admin_sessions') {
    if (String(q._cols).indexOf('scope') !== -1) return { scope: 'founder' };
    return { id: 'sess-1', expires_at: new Date(Date.now() + 3600000).toISOString() };
  }
  if (q._table === 'ai_settings') return state.settings;
  if (q._table === 'ai_conversations') return null;
  return null;
}

function makeClient() {
  return {
    from(table) { return builder(table, STATE); },
    rpc() { return { data: {}, error: null }; },
    auth: { async getUser() { return { data: { user: { id: 'u1' } }, error: null }; } }
  };
}

module.exports = { createClient: makeClient, setState };
