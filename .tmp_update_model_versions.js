require('./backend/node_modules/dotenv').config({ path: './backend/.env' });
const { createClient } = require('./backend/node_modules/@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

(async () => {
  try {
    const { error: updateOldErr } = await supabase
      .from('model_versions')
      .update({ training_set_size: 4426 })
      .eq('version_label', '20260324_004150');
    if (updateOldErr) throw updateOldErr;

    const newVersion = {
      version_label: '20260324_015956_670398',
      status: 'ready',
      accuracy: 0.68,
      precision: 0.34,
      recall: 0.50,
      f1_score: 0.405,
      training_set_size: 132,
      trained_at: '2026-03-24T01:59:56.670Z',
      is_active: true,
      notes: 'Added from HF retrain results sync.',
    };

    const { error: upsertNewErr } = await supabase
      .from('model_versions')
      .upsert(newVersion, { onConflict: 'version_label' });
    if (upsertNewErr) throw upsertNewErr;

    const { error: deactivateOthersErr } = await supabase
      .from('model_versions')
      .update({ is_active: false })
      .neq('version_label', '20260324_015956_670398')
      .eq('is_active', true);
    if (deactivateOthersErr) throw deactivateOthersErr;

    const { data: rows, error: verifyErr } = await supabase
      .from('model_versions')
      .select('version_label,status,accuracy,precision,recall,f1_score,training_set_size,is_active,trained_at')
      .in('version_label', ['20260324_004150', '20260324_015956_670398'])
      .order('version_label');
    if (verifyErr) throw verifyErr;

    console.log(JSON.stringify({ ok: true, rows }, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ ok: false, err }, null, 2));
    process.exit(1);
  }
})();
