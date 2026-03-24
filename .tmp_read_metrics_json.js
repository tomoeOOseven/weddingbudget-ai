require('./backend/node_modules/dotenv').config({ path: './backend/.env' });
const { createClient } = require('./backend/node_modules/@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

(async () => {
  const versionTag = '20260324_004150';
  const path = `versions/${versionTag}/metrics.json`;
  const { data, error } = await supabase.storage.from('ml-models').download(path);
  if (error) {
    console.error('DOWNLOAD_ERROR', error.message);
    process.exit(1);
  }
  const text = typeof data.text === 'function' ? await data.text() : Buffer.from(await data.arrayBuffer()).toString('utf8');
  console.log(text);
})();
