require('./backend/node_modules/dotenv').config({ path: './backend/.env' });
const { createClient } = require('./backend/node_modules/@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

(async () => {
  const versionTag = '20260324_004150';
  const metrics = {
    accuracy: 0.84,
    precision: 0.85,
    recall: 0.84,
    f1: 0.84,
    support: {
      Budget: 324,
      'Mid-Range': 371,
      Premium: 191,
    },
    training_set_size: 121,
    version_tag: versionTag,
    created_at: new Date().toISOString(),
  };

  const json = JSON.stringify(metrics, null, 2);
  const path = `versions/${versionTag}/metrics.json`;

  const { error: upErr } = await supabase.storage
    .from('ml-models')
    .upload(path, Buffer.from(json, 'utf8'), {
      contentType: 'application/json',
      upsert: true,
    });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

  const { error: dbErr } = await supabase
    .from('model_versions')
    .update({
      accuracy: metrics.accuracy,
      precision: metrics.precision,
      recall: metrics.recall,
      f1_score: metrics.f1,
      test_set_size: 886,
      training_set_size: metrics.training_set_size,
      status: 'ready',
      model_file_path: `versions/${versionTag}/model.joblib`,
      trained_at: new Date(Date.UTC(2026, 2, 24, 0, 41, 50)).toISOString(),
      notes: 'metrics_sidecar=' + JSON.stringify(metrics),
    })
    .eq('version_label', versionTag);

  if (dbErr) throw new Error(`DB update failed: ${dbErr.message}`);

  console.log('Uploaded metrics sidecar and updated model_versions row for', versionTag);
})();
