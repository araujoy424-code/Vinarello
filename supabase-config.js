// Vinarello — chave PUBLICÁVEL do projeto. Nunca use chaves secret/service_role no navegador.
const SUPABASE_URL = 'https://toyviotffikmjfmljweq.supabase.co';
const SUPABASE_API_KEY = 'sb_publishable_FwWzn07uvZtxnQItdtn0Uw_p9POogWY';
const configurado = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL)
  && /^(sb_publishable_|eyJ)/.test(SUPABASE_API_KEY);
window.vinarelloDb = (configurado && window.supabase?.createClient)
  ? window.supabase.createClient(SUPABASE_URL,SUPABASE_API_KEY,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage}
    })
  : null;
if (!window.vinarelloDb) console.warn('Vinarello: não foi possível inicializar a conexão com o Supabase.');
