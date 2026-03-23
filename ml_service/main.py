# ml_service/main.py
# ─────────────────────────────────────────────────────────────────────────────
# FastAPI microservice for:
#   POST /embed          — extract CLIP embedding from an image URL
#   POST /train          — train/retrain the cost predictor on labelled dataset
#   POST /predict        — predict cost range for an image
#   GET  /model/status   — active model info + accuracy metrics
#   GET  /health         — liveness check
#
# Called by the Node backend. Never exposed directly to clients.
# ─────────────────────────────────────────────────────────────────────────────

import os, io, uuid, logging, traceback
from datetime import datetime
from typing   import Optional
from dotenv   import load_dotenv

# Load .env BEFORE reading any os.environ values
load_dotenv()

import numpy  as np
import pandas as pd
import joblib
import requests
from PIL        import Image
from fastapi    import FastAPI, HTTPException, BackgroundTasks
from pydantic   import BaseModel
from supabase   import create_client, Client
from sklearn.ensemble         import GradientBoostingRegressor
from sklearn.ensemble         import RandomForestRegressor
from sklearn.linear_model     import Ridge, ElasticNet
from sklearn.model_selection  import train_test_split
from sklearn.model_selection  import RepeatedKFold, cross_val_score
from sklearn.metrics          import mean_absolute_error, r2_score
from sklearn.metrics          import accuracy_score, precision_score, recall_score, f1_score
from sklearn.preprocessing    import LabelEncoder

# Optional — CLIP only loads if torch is available
try:
    import torch, clip
    CLIP_AVAILABLE = True
except ImportError:
    CLIP_AVAILABLE = False

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger(__name__)

# ── Supabase client ──────────────────────────────────────────────────────────

SUPABASE_URL      = os.environ['SUPABASE_URL']
SUPABASE_KEY      = os.environ['SUPABASE_SERVICE_ROLE_KEY']
STORAGE_BUCKET    = 'decor-images'
MODEL_BUCKET      = 'ml-models'

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── CLIP setup ───────────────────────────────────────────────────────────────

_clip_model  = None
_clip_preprocess = None
_clip_device = 'cpu'

def get_clip():
    global _clip_model, _clip_preprocess, _clip_device
    if _clip_model is None and CLIP_AVAILABLE:
        _clip_device = 'cuda' if torch.cuda.is_available() else 'cpu'
        _clip_model, _clip_preprocess = clip.load('ViT-B/32', device=_clip_device)
        log.info(f'CLIP loaded on {_clip_device}')
    return _clip_model, _clip_preprocess, _clip_device

# ── Encoders for categorical features ────────────────────────────────────────

FUNCTION_TYPES = ['haldi','mehendi','sangeet','baraat','pheras','reception','other']
STYLES         = ['Traditional','Boho','Modern','Contemporary','Romantic','Opulent','Rustic','Vintage']
COMPLEXITIES   = ['low','medium','high','ultra']

fn_enc = LabelEncoder().fit(FUNCTION_TYPES)
st_enc = LabelEncoder().fit(STYLES)
cx_enc = LabelEncoder().fit(COMPLEXITIES)

# ── Active model cache ───────────────────────────────────────────────────────

_active_model_min  = None   # GBM for cost_min
_active_model_max  = None   # GBM for cost_max
_active_version_id = None

app = FastAPI(title='WeddingBudget.ai ML Service', version='1.0.0')

# ─────────────────────────────────────────────────────────────────────────────
# SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────

class EmbedRequest(BaseModel):
    image_id:    str
    image_url:   str
    storage_path: Optional[str] = None

class TrainRequest(BaseModel):
    version_label: str           # e.g. "v1.2"
    triggered_by:  Optional[str] = None   # admin profile UUID
    force_best_model: Optional[bool] = None  # promote best learned model even if baseline wins
    force_algorithm: Optional[str] = None  # force one algorithm: ridge|elasticnet|gbm_shallow|rf_shallow|gbm|rf
    include_scraped_direct: Optional[bool] = False  # include scraped_images with price seeds (even if unlabelled)

class PredictRequest(BaseModel):
    image_id:      Optional[str] = None
    image_url:     Optional[str] = None
    storage_path:  Optional[str] = None
    function_type: Optional[str] = None
    style:         Optional[str] = None
    complexity:    Optional[str] = None
    city_mult:     float = 1.0
    hotel_decor_mult: float = 1.0

# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def load_image_from_url(url: str) -> Image.Image:
    resp = requests.get(url, timeout=15, headers={'User-Agent': 'WeddingBudgetML/1.0'})
    resp.raise_for_status()
    return Image.open(io.BytesIO(resp.content)).convert('RGB')

def extract_clip_embedding(image_url: str, storage_path: Optional[str] = None) -> np.ndarray:
    """Extract 512-dim CLIP embedding from an image."""
    if not CLIP_AVAILABLE:
        raise RuntimeError('CLIP not available — install torch and clip')

    model, preprocess, device = get_clip()

    # Prefer Supabase Storage URL for reliability
    url = f"{SUPABASE_URL}/storage/v1/object/public/{STORAGE_BUCKET}/{storage_path}" \
          if storage_path else image_url

    img   = load_image_from_url(url)
    tensor = preprocess(img).unsqueeze(0).to(device)

    with torch.no_grad():
        features = model.encode_image(tensor)
        features /= features.norm(dim=-1, keepdim=True)   # L2 normalise

    return features.cpu().numpy().flatten().astype(np.float32)

def rule_based_features(function_type: str, style: str, complexity: str,
                         city_mult: float, hotel_decor_mult: float) -> np.ndarray:
    """
    Fallback feature vector when CLIP is unavailable or embedding is missing.
    Uses one-hot + ordinal encodings of the categorical labels.
    """
    fn_oh = np.zeros(len(FUNCTION_TYPES));  fn_oh[fn_enc.transform([function_type])[0]] = 1
    st_oh = np.zeros(len(STYLES));          st_oh[st_enc.transform([style])[0]]          = 1
    cx_ord = cx_enc.transform([complexity])[0] / (len(COMPLEXITIES) - 1)  # normalise 0-1

    return np.array([*fn_oh, *st_oh, cx_ord, city_mult, hotel_decor_mult], dtype=np.float32)

def build_feature_vector(row: dict, embedding: Optional[np.ndarray]) -> np.ndarray:
    """
    Combine CLIP embedding (if available) with categorical features.
    Final vector: [clip_512] + [fn_onehot_7] + [style_onehot_8] + [complexity_1] + [city_1] + [hotel_1]
    = 529 dims with CLIP, 19 dims without.
    """
    cat = rule_based_features(
        row.get('function_type', 'other'),
        row.get('style', 'Traditional'),
        row.get('complexity', 'medium'),
        float(row.get('city_mult', 1.0)),
        float(row.get('hotel_decor_mult', 1.0)),
    )
    if embedding is not None:
        return np.concatenate([embedding, cat])
    return cat

def load_active_model():
    """Load the active model from Supabase Storage into memory."""
    global _active_model_min, _active_model_max, _active_version_id

    resp = supabase.table('model_versions') \
        .select('id, version_label, model_file_path') \
        .eq('is_active', True) \
        .limit(1).execute()

    if not resp.data:
        log.warning('No active model found in DB.')
        return False

    mv = resp.data[0]
    if mv['id'] == _active_version_id:
        return True  # already loaded

    path_min = mv['model_file_path'].replace('.joblib', '_min.joblib')
    path_max = mv['model_file_path'].replace('.joblib', '_max.joblib')

    try:
        for path, attr in [(path_min, '_active_model_min'), (path_max, '_active_model_max')]:
            file_bytes = supabase.storage.from_(MODEL_BUCKET).download(path)
            model = joblib.load(io.BytesIO(file_bytes))
            globals()[attr] = model

        _active_version_id = mv['id']
        log.info(f"Active model loaded: {mv['version_label']}")
        return True
    except Exception as e:
        log.error(f'Failed to load model from storage: {e}')
        return False

# ─────────────────────────────────────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@app.get('/health')
def health():
    return {
        'status':         'ok',
        'clip_available': CLIP_AVAILABLE,
        'model_loaded':   _active_version_id is not None,
        'active_version': _active_version_id,
    }

# ── POST /embed ───────────────────────────────────────────────────────────────
@app.post('/embed')
def embed(req: EmbedRequest):
    """Extract CLIP embedding for one image and store in image_embeddings table."""
    if not CLIP_AVAILABLE:
        raise HTTPException(503, 'CLIP not available on this server.')

    try:
        embedding = extract_clip_embedding(req.image_url, req.storage_path)

        # Store as list (Supabase pgvector accepts list format)
        supabase.table('image_embeddings').upsert({
            'image_id':   req.image_id,
            'embedding':  embedding.tolist(),
            'model_name': 'clip-vit-b32',
        }, on_conflict='image_id').execute()

        return { 'image_id': req.image_id, 'dims': len(embedding), 'status': 'stored' }

    except Exception as e:
        raise HTTPException(500, str(e))

# ── POST /train ───────────────────────────────────────────────────────────────
@app.post('/train')
async def train(req: TrainRequest, bg: BackgroundTasks):
    """Kick off model training in the background. Returns immediately."""

    force_best_model_default = os.environ.get('ML_FORCE_BEST_MODEL_DEFAULT', 'false').lower() in ('1', 'true', 'yes', 'on')
    force_best_model = req.force_best_model if req.force_best_model is not None else force_best_model_default
    force_algorithm = req.force_algorithm.lower().strip() if req.force_algorithm else None
    allowed_algorithms = {'ridge', 'elasticnet', 'gbm_shallow', 'rf_shallow', 'gbm', 'rf'}
    if force_algorithm and force_algorithm not in allowed_algorithms:
        raise HTTPException(400, f'Invalid force_algorithm: {force_algorithm}. Allowed: {sorted(allowed_algorithms)}')

    # Create model_versions row with status='training'
    mv_resp = supabase.table('model_versions').insert({
        'version_label': req.version_label,
        'status':        'training',
        'algorithm':     'AUTO_SELECT',
    }).execute()

    if not mv_resp.data:
        raise HTTPException(500, 'Failed to create model version record.')

    version_id = mv_resp.data[0]['id']

    # Create training_run row
    run_resp = supabase.table('training_runs').insert({
        'model_version_id': version_id,
        'triggered_by':     req.triggered_by,
        'status':           'running',
        'config':           {
            'algorithm': 'AUTO_SELECT',
            'selection_mode': 'data_size_adaptive',
            'force_best_model': force_best_model,
            'force_algorithm': force_algorithm,
            'include_scraped_direct': bool(req.include_scraped_direct),
        },
        'log':              [],
    }).execute()
    run_id = run_resp.data[0]['id']

    bg.add_task(
        _run_training,
        version_id,
        run_id,
        req.version_label,
        force_best_model,
        force_algorithm,
        bool(req.include_scraped_direct),
    )

    return { 'version_id': version_id, 'run_id': run_id, 'message': 'Training started in background.' }


def _append_log(run_id: str, line: str):
    existing = supabase.table('training_runs').select('log').eq('id', run_id).execute()
    old_log  = existing.data[0]['log'] if existing.data else []
    supabase.table('training_runs').update({'log': old_log + [f'[{datetime.utcnow().isoformat()}] {line}']}) \
        .eq('id', run_id).execute()
    log.info(f'[train:{run_id[:8]}] {line}')


def _run_training(
    version_id: str,
    run_id: str,
    version_label: str,
    force_best_model: bool = False,
    force_algorithm: Optional[str] = None,
    include_scraped_direct: bool = False,
):
    """Full training pipeline — runs in background thread."""
    import time
    start = time.time()

    try:
        _append_log(run_id, 'Loading labelled dataset from Supabase…')

        # Load all image_labels with is_in_training=True
        labels_resp = supabase.table('image_labels') \
            .select('image_id, function_type, style, complexity, cost_seed_min, cost_seed_max') \
            .eq('is_in_training', True).execute()

        labels = labels_resp.data or []
        training_rows = list(labels)
        labelled_ids = {row['image_id'] for row in labels}

        if include_scraped_direct:
            _append_log(run_id, 'Including directly scraped priced images in training set…')
            scraped_resp = supabase.table('scraped_images') \
                .select('id, price_inr, price_text') \
                .in_('status', ['raw', 'labelled']).execute()

            scraped_rows = scraped_resp.data or []
            appended = 0
            for row in scraped_rows:
                image_id = row.get('id')
                if not image_id or image_id in labelled_ids:
                    continue

                price_seed = row.get('price_inr')
                if price_seed is None:
                    price_seed = _parse_price_seed(row.get('price_text'))
                if price_seed is None:
                    continue
                if price_seed < 1000 or price_seed > 5000000:
                    continue

                training_rows.append({
                    'image_id': image_id,
                    'function_type': 'other',
                    'style': 'Traditional',
                    'complexity': 'medium',
                    'cost_seed_min': int(round(price_seed * 0.9)),
                    'cost_seed_max': int(round(price_seed * 1.1)),
                })
                appended += 1

            _append_log(run_id, f'Added {appended} directly scraped priced images.')

        if len(training_rows) < 10:
            raise ValueError(f'Not enough training data: {len(training_rows)} rows (need >=10).')

        _append_log(run_id, f'Loaded {len(labels)} labelled images, total training rows: {len(training_rows)}.')

        # Load embeddings for those images (may not exist for all)
        image_ids    = [l['image_id'] for l in training_rows]
        emb_resp     = supabase.table('image_embeddings') \
            .select('image_id, embedding').in_('image_id', image_ids).execute()
        emb_map = { e['image_id']: np.array(e['embedding'], dtype=np.float32) for e in emb_resp.data }

        # If CLIP is available, backfill missing embeddings so training can use visual features.
        missing_ids = [img_id for img_id in image_ids if img_id not in emb_map]
        if missing_ids and CLIP_AVAILABLE:
            _append_log(run_id, f'Generating missing CLIP embeddings for {len(missing_ids)} images...')

            src_resp = supabase.table('scraped_images') \
                .select('id, image_url, storage_path').in_('id', missing_ids).execute()
            src_rows = src_resp.data or []

            generated = 0
            for row in src_rows:
                try:
                    emb = extract_clip_embedding(row.get('image_url'), row.get('storage_path'))
                    emb_map[row['id']] = emb
                    supabase.table('image_embeddings').upsert({
                        'image_id': row['id'],
                        'embedding': emb.tolist(),
                        'model_name': 'clip-vit-b32',
                    }, on_conflict='image_id').execute()
                    generated += 1
                except Exception as emb_err:
                    _append_log(run_id, f'Embedding failed for {row.get("id")}: {emb_err}')

            _append_log(run_id, f'Generated and stored {generated} CLIP embeddings during training.')
        elif missing_ids and not CLIP_AVAILABLE:
            _append_log(run_id, 'CLIP not available on server; training will use non-visual features for missing images.')

        _append_log(run_id, f'Embeddings available for {len(emb_map)}/{len(training_rows)} images.')
        use_clip_features = len(emb_map) > 0

        # Build feature matrix
        X, y_min, y_max = [], [], []
        for row in training_rows:
            emb = emb_map.get(row['image_id'])
            fv  = build_feature_vector(row, emb)
            X.append(fv)
            y_min.append(row['cost_seed_min'])
            y_max.append(row['cost_seed_max'])

        X     = np.array(X)
        y_min = np.array(y_min, dtype=np.float32)
        y_max = np.array(y_max, dtype=np.float32)

        _append_log(run_id, f'Feature matrix: {X.shape}. Splitting 80/20 train/test…')

        # Rule-based baseline (dataset-wide) for promotion gate.
        rb_preds_min = []
        rb_preds_max = []
        for row in training_rows:
            rb_min, rb_max, _, _ = _rule_based_estimate(row)
            rb_preds_min.append(rb_min)
            rb_preds_max.append(rb_max)

        rb_mae_min = float(mean_absolute_error(y_min, np.array(rb_preds_min, dtype=np.float32)))
        rb_mae_max = float(mean_absolute_error(y_max, np.array(rb_preds_max, dtype=np.float32)))
        rb_mae_avg = (rb_mae_min + rb_mae_max) / 2.0
        _append_log(run_id, f'Rule-based baseline MAE — min: {rb_mae_min:,.0f}, max: {rb_mae_max:,.0f}, avg: {rb_mae_avg:,.0f}')

        sample_n = len(training_rows)
        all_candidates = {
            'ridge': lambda: Ridge(alpha=1.0, random_state=42),
            'elasticnet': lambda: ElasticNet(alpha=0.05, l1_ratio=0.2, random_state=42, max_iter=10000),
            'gbm_shallow': lambda: GradientBoostingRegressor(n_estimators=180, max_depth=3, learning_rate=0.05, subsample=0.85, min_samples_leaf=3, random_state=42),
            'rf_shallow': lambda: RandomForestRegressor(n_estimators=250, max_depth=6, min_samples_leaf=2, random_state=42, n_jobs=-1),
            'gbm': lambda: GradientBoostingRegressor(n_estimators=300, max_depth=5, learning_rate=0.05, subsample=0.8, min_samples_leaf=3, random_state=42),
            'rf': lambda: RandomForestRegressor(n_estimators=400, max_depth=10, min_samples_leaf=2, random_state=42, n_jobs=-1),
        }

        if force_algorithm:
            candidates = [(force_algorithm, all_candidates[force_algorithm])]
            _append_log(run_id, f'Force-algorithm mode enabled: {force_algorithm}')
        elif sample_n < 30:
            candidates = [
                ('ridge', all_candidates['ridge']),
                ('elasticnet', all_candidates['elasticnet']),
            ]
        elif sample_n < 120:
            candidates = [
                ('ridge', all_candidates['ridge']),
                ('elasticnet', all_candidates['elasticnet']),
                ('gbm_shallow', all_candidates['gbm_shallow']),
                ('rf_shallow', all_candidates['rf_shallow']),
            ]
        else:
            candidates = [
                ('ridge', all_candidates['ridge']),
                ('elasticnet', all_candidates['elasticnet']),
                ('gbm', all_candidates['gbm']),
                ('rf', all_candidates['rf']),
            ]

        cv_splits = min(5, max(2, sample_n // 3))
        rkf = RepeatedKFold(n_splits=cv_splits, n_repeats=3, random_state=42)

        best_name = None
        best_factory = None
        best_cv_mae_min = float('inf')
        best_cv_mae_max = float('inf')
        best_cv_mae_avg = float('inf')

        _append_log(run_id, f'Running adaptive model selection over {len(candidates)} candidates (n={sample_n}, cv={cv_splits}x3)…')
        for name, make_model in candidates:
            try:
                cv_min = -cross_val_score(make_model(), X, y_min, scoring='neg_mean_absolute_error', cv=rkf, n_jobs=1).mean()
                cv_max = -cross_val_score(make_model(), X, y_max, scoring='neg_mean_absolute_error', cv=rkf, n_jobs=1).mean()
            except Exception as cv_err:
                _append_log(run_id, f'Candidate {name} failed during CV: {cv_err}')
                continue
            cv_avg = (float(cv_min) + float(cv_max)) / 2.0
            _append_log(run_id, f'Candidate {name} CV MAE — min: {cv_min:,.0f}, max: {cv_max:,.0f}, avg: {cv_avg:,.0f}')

            if cv_avg < best_cv_mae_avg:
                best_name = name
                best_factory = make_model
                best_cv_mae_min = float(cv_min)
                best_cv_mae_max = float(cv_max)
                best_cv_mae_avg = float(cv_avg)

        if best_factory is None:
            raise ValueError('All candidate algorithms failed during cross-validation.')

        _append_log(run_id, f'Best candidate by CV: {best_name} (avg MAE: {best_cv_mae_avg:,.0f})')

        X_train, X_test, ym_train, ym_test, ymx_train, ymx_test = train_test_split(
            X, y_min, y_max, test_size=0.2, random_state=42
        )

        # Train selected regressor family: one model per target.
        _append_log(run_id, f'Training {best_name} for cost_min…')
        model_min = best_factory()
        model_min.fit(X_train, ym_train)

        _append_log(run_id, f'Training {best_name} for cost_max…')
        model_max = best_factory()
        model_max.fit(X_train, ymx_train)

        # Evaluate
        pred_min  = model_min.predict(X_test)
        pred_max  = model_max.predict(X_test)
        mae_min   = float(mean_absolute_error(ym_test, pred_min))
        mae_max   = float(mean_absolute_error(ymx_test, pred_max))
        r2_min    = float(r2_score(ym_test, pred_min))
        r2_max    = float(r2_score(ymx_test, pred_max))

        y_mid_all  = (y_min + y_max) / 2.0
        q1, q2 = np.quantile(y_mid_all, [0.33, 0.66])

        y_mid_true = (ym_test + ymx_test) / 2.0
        y_mid_pred = (pred_min + pred_max) / 2.0

        y_true_tier = np.digitize(y_mid_true, bins=[q1, q2])
        y_pred_tier = np.digitize(y_mid_pred, bins=[q1, q2])

        accuracy = float(accuracy_score(y_true_tier, y_pred_tier))
        precision = float(precision_score(y_true_tier, y_pred_tier, average='weighted', zero_division=0))
        recall = float(recall_score(y_true_tier, y_pred_tier, average='weighted', zero_division=0))
        f1 = float(f1_score(y_true_tier, y_pred_tier, average='weighted', zero_division=0))

        _append_log(run_id, f'Eval — MAE min: ₹{mae_min:,.0f}, max: ₹{mae_max:,.0f} | R² min: {r2_min:.3f}, max: {r2_max:.3f}')
        _append_log(run_id, f'Class Metrics — Acc: {accuracy:.3f}, Prec: {precision:.3f}, Recall: {recall:.3f}, F1: {f1:.3f}')

        best_beats_rule = best_cv_mae_avg < rb_mae_avg
        should_promote = best_beats_rule or force_best_model
        _append_log(run_id, f'Promotion gate — best_beats_rule={best_beats_rule}, force_best_model={force_best_model}, promote={should_promote}')

        # Save models to Supabase Storage
        base_path = f'{version_label}/model'
        for suffix, model in [('_min', model_min), ('_max', model_max)]:
            buf = io.BytesIO()
            joblib.dump(model, buf)
            buf.seek(0)
            supabase.storage.from_(MODEL_BUCKET).upload(
                f'{base_path}{suffix}.joblib',
                buf.read(),
                {'content-type': 'application/octet-stream', 'upsert': 'true'},
            )

        _append_log(run_id, f'Models saved to storage: {base_path}')

        duration = int(time.time() - start)

        if should_promote:
            # Deactivate old active model
            supabase.table('model_versions').update({'is_active': False}) \
                .eq('is_active', True).execute()

        # Update model_versions row
        supabase.table('model_versions').update({
            'status':            'ready',
            'is_active':         should_promote,
            'algorithm':         best_name,
            'training_set_size': len(training_rows),
            'test_set_size':     len(X_test),
            'mae_min':           round(mae_min, 2),
            'mae_max':           round(mae_max, 2),
            'r2_min':            round(r2_min, 4),
            'r2_max':            round(r2_max, 4),
            'accuracy':          round(accuracy, 4),
            'precision':         round(precision, 4),
            'recall':            round(recall, 4),
            'f1_score':          round(f1, 4),
            'model_file_path':   f'{base_path}.joblib',
            'trained_at':        datetime.utcnow().isoformat(),
            'feature_cols':      ['clip_512' if use_clip_features else 'rule_based', 'function_type', 'style', 'complexity', 'city_mult', 'hotel_decor_mult'],
        }).eq('id', version_id).execute()

        supabase.table('training_runs').update({
            'status':          'completed',
            'completed_at':    datetime.utcnow().isoformat(),
            'duration_seconds': duration,
        }).eq('id', run_id).execute()

        if should_promote:
            _append_log(run_id, f'✓ Training complete in {duration}s. Model {version_label} ({best_name}) is now active.')
        else:
            _append_log(run_id, f'✓ Training complete in {duration}s. Model {version_label} ({best_name}) kept inactive because rule-based baseline is better (override disabled).')

        # Reload into memory only if promoted.
        global _active_model_min, _active_model_max, _active_version_id
        if should_promote:
            _active_model_min  = model_min
            _active_model_max  = model_max
            _active_version_id = version_id

    except Exception as e:
        tb = traceback.format_exc()
        log.error(f'Training failed: {tb}')
        _append_log(run_id, f'ERROR: {e}')

        supabase.table('model_versions').update({'status': 'failed'}).eq('id', version_id).execute()
        supabase.table('training_runs').update({
            'status': 'failed', 'error_message': str(e),
            'completed_at': datetime.utcnow().isoformat(),
        }).eq('id', run_id).execute()

# ── POST /predict ─────────────────────────────────────────────────────────────
@app.post('/predict')
def predict(req: PredictRequest):
    """
    Predict cost_min and cost_max for a decor image.
    Uses active trained model if available, falls back to rule-based estimation.
    """
    global _active_model_min, _active_model_max, _active_version_id

    # Try to load active model if not in memory
    if _active_model_min is None:
        load_active_model()

    # Look up stored embedding if image_id provided
    embedding = None
    if req.image_id and CLIP_AVAILABLE:
        emb_resp = supabase.table('image_embeddings') \
            .select('embedding').eq('image_id', req.image_id).limit(1).execute()
        if emb_resp.data:
            embedding = np.array(emb_resp.data[0]['embedding'], dtype=np.float32)
        elif req.image_url:
            # Generate embedding on the fly (slower)
            try:
                embedding = extract_clip_embedding(req.image_url, req.storage_path)
            except Exception as e:
                log.warning(f'On-the-fly embedding failed: {e}')

    row = {
        'function_type':    req.function_type or 'other',
        'style':            req.style         or 'Traditional',
        'complexity':       req.complexity    or 'medium',
        'city_mult':        req.city_mult,
        'hotel_decor_mult': req.hotel_decor_mult,
    }

    fv = build_feature_vector(row, embedding).reshape(1, -1)

    if _active_model_min is not None:
        try:
            cost_min = float(_active_model_min.predict(fv)[0])
            cost_max = float(_active_model_max.predict(fv)[0])
            cost_min = max(0, round(cost_min / 1000) * 1000)
            cost_max = max(cost_min, round(cost_max / 1000) * 1000)
            confidence = 0.82 if embedding is not None else 0.60
            source = 'ml_model'
        except Exception as e:
            log.warning(f'Model prediction failed, using rule-based: {e}')
            cost_min, cost_max, confidence, source = _rule_based_estimate(row)
    else:
        cost_min, cost_max, confidence, source = _rule_based_estimate(row)

    # Log inference only when a valid model version exists.
    # The DB schema requires model_version_id to reference model_versions(id).
    if _active_version_id:
        try:
            supabase.table('inference_log').insert({
                'model_version_id': _active_version_id,
                'image_id':         req.image_id,
                'input_features':   row,
                'predicted_min':    int(cost_min),
                'predicted_max':    int(cost_max),
                'confidence':       confidence,
            }).execute()
        except Exception as e:
            log.warning(f'Failed to log inference: {e}')
    else:
        log.warning('Skipping inference log because no active model version is available.')

    return {
        'cost_min':   int(cost_min),
        'cost_max':   int(cost_max),
        'cost_mid':   int((cost_min + cost_max) / 2),
        'confidence': confidence,
        'source':     source,
        'version_id': _active_version_id,
    }

def _rule_based_estimate(row: dict):
    """
    Pure rule-based fallback. Used when no ML model is trained yet.
    Mirrors the logic in the original Node decorService.js but expanded.
    """
    base = {
        'haldi': 130000, 'mehendi': 185000, 'sangeet': 550000,
        'baraat': 525000, 'pheras': 700000, 'reception': 1200000, 'other': 400000,
    }.get(row['function_type'], 400000)

    style_mult = {
        'Traditional':1.0, 'Boho':0.78, 'Modern':0.97, 'Contemporary':0.92,
        'Romantic':0.82, 'Opulent':1.20, 'Rustic':0.75, 'Vintage':0.85,
    }.get(row['style'], 1.0)

    cx_mult = {'low':0.65, 'medium':0.90, 'high':1.15, 'ultra':1.55}.get(row['complexity'], 0.90)

    city_mult  = float(row.get('city_mult', 1.0))
    hotel_mult = float(row.get('hotel_decor_mult', 1.0))

    mid     = base * style_mult * cx_mult * city_mult * hotel_mult
    c_min   = round(mid * 0.80 / 1000) * 1000
    c_max   = round(mid * 1.25 / 1000) * 1000

    return c_min, c_max, 0.45, 'rule_based'


def _parse_price_seed(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        n = int(round(float(value)))
        return n if n > 0 else None

    text = str(value).strip().lower().replace(',', '')
    if not text:
        return None

    for bad in ('request', 'contact', 'call', 'onwards'):
        if bad in text:
            return None

    import re

    m = re.search(r'(\d+(?:\.\d+)?)', text)
    if not m:
        return None

    num = float(m.group(1))
    if 'crore' in text or re.search(r'\bcr\b', text):
        num *= 10000000
    elif 'lakh' in text or 'lac' in text:
        num *= 100000
    elif re.search(r'\bk\b', text):
        num *= 1000

    n = int(round(num))
    return n if n > 0 else None

# ── GET /model/status ─────────────────────────────────────────────────────────
@app.get('/model/status')
def model_status():
    resp = supabase.table('model_versions') \
        .select('id, version_label, status, training_set_size, accuracy, precision, recall, f1_score, trained_at, is_active') \
        .order('trained_at', desc=True).limit(5).execute()

    return {
        'active_in_memory': _active_version_id,
        'versions':          resp.data,
    }