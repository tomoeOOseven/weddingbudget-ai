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
from sklearn.model_selection  import train_test_split
from sklearn.metrics          import mean_absolute_error, r2_score
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

    # Create model_versions row with status='training'
    mv_resp = supabase.table('model_versions').insert({
        'version_label': req.version_label,
        'status':        'training',
        'algorithm':     'GBM',
    }).execute()

    if not mv_resp.data:
        raise HTTPException(500, 'Failed to create model version record.')

    version_id = mv_resp.data[0]['id']

    # Create training_run row
    run_resp = supabase.table('training_runs').insert({
        'model_version_id': version_id,
        'triggered_by':     req.triggered_by,
        'status':           'running',
        'config':           { 'algorithm': 'GBM', 'n_estimators': 300, 'max_depth': 5 },
        'log':              [],
    }).execute()
    run_id = run_resp.data[0]['id']

    bg.add_task(_run_training, version_id, run_id, req.version_label)

    return { 'version_id': version_id, 'run_id': run_id, 'message': 'Training started in background.' }


def _append_log(run_id: str, line: str):
    existing = supabase.table('training_runs').select('log').eq('id', run_id).execute()
    old_log  = existing.data[0]['log'] if existing.data else []
    supabase.table('training_runs').update({'log': old_log + [f'[{datetime.utcnow().isoformat()}] {line}']}) \
        .eq('id', run_id).execute()
    log.info(f'[train:{run_id[:8]}] {line}')


def _run_training(version_id: str, run_id: str, version_label: str):
    """Full training pipeline — runs in background thread."""
    import time
    start = time.time()

    try:
        _append_log(run_id, 'Loading labelled dataset from Supabase…')

        # Load all image_labels with is_in_training=True
        labels_resp = supabase.table('image_labels') \
            .select('image_id, function_type, style, complexity, cost_seed_min, cost_seed_max') \
            .eq('is_in_training', True).execute()

        labels = labels_resp.data
        if len(labels) < 20:
            raise ValueError(f'Not enough labelled data: {len(labels)} rows (need ≥20).')

        _append_log(run_id, f'Loaded {len(labels)} labelled images.')

        # Load embeddings for those images (may not exist for all)
        image_ids    = [l['image_id'] for l in labels]
        emb_resp     = supabase.table('image_embeddings') \
            .select('image_id, embedding').in_('image_id', image_ids).execute()
        emb_map = { e['image_id']: np.array(e['embedding'], dtype=np.float32) for e in emb_resp.data }

        _append_log(run_id, f'Embeddings available for {len(emb_map)}/{len(labels)} images.')

        # Build feature matrix
        X, y_min, y_max = [], [], []
        for row in labels:
            emb = emb_map.get(row['image_id'])
            fv  = build_feature_vector(row, emb)
            X.append(fv)
            y_min.append(row['cost_seed_min'])
            y_max.append(row['cost_seed_max'])

        X     = np.array(X)
        y_min = np.array(y_min, dtype=np.float32)
        y_max = np.array(y_max, dtype=np.float32)

        _append_log(run_id, f'Feature matrix: {X.shape}. Splitting 80/20 train/test…')

        X_train, X_test, ym_train, ym_test, ymx_train, ymx_test = train_test_split(
            X, y_min, y_max, test_size=0.2, random_state=42
        )

        # Train two GBM regressors: one for cost_min, one for cost_max
        params = dict(n_estimators=300, max_depth=5, learning_rate=0.05,
                      subsample=0.8, min_samples_leaf=3, random_state=42)

        _append_log(run_id, 'Training GBM for cost_min…')
        model_min = GradientBoostingRegressor(**params)
        model_min.fit(X_train, ym_train)

        _append_log(run_id, 'Training GBM for cost_max…')
        model_max = GradientBoostingRegressor(**params)
        model_max.fit(X_train, ymx_train)

        # Evaluate
        pred_min  = model_min.predict(X_test)
        pred_max  = model_max.predict(X_test)
        mae_min   = float(mean_absolute_error(ym_test, pred_min))
        mae_max   = float(mean_absolute_error(ymx_test, pred_max))
        r2_min    = float(r2_score(ym_test, pred_min))
        r2_max    = float(r2_score(ymx_test, pred_max))

        _append_log(run_id, f'Eval — MAE min: ₹{mae_min:,.0f}, max: ₹{mae_max:,.0f} | R² min: {r2_min:.3f}, max: {r2_max:.3f}')

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

        # Deactivate old active model
        supabase.table('model_versions').update({'is_active': False}) \
            .eq('is_active', True).execute()

        # Update model_versions row
        supabase.table('model_versions').update({
            'status':            'ready',
            'is_active':         True,
            'training_set_size': len(labels),
            'test_set_size':     len(X_test),
            'mae_min':           round(mae_min, 2),
            'mae_max':           round(mae_max, 2),
            'r2_min':            round(r2_min, 4),
            'r2_max':            round(r2_max, 4),
            'model_file_path':   f'{base_path}.joblib',
            'trained_at':        datetime.utcnow().isoformat(),
            'feature_cols':      ['clip_512' if emb_map else 'rule_based', 'function_type', 'style', 'complexity', 'city_mult', 'hotel_decor_mult'],
        }).eq('id', version_id).execute()

        supabase.table('training_runs').update({
            'status':          'completed',
            'completed_at':    datetime.utcnow().isoformat(),
            'duration_seconds': duration,
        }).eq('id', run_id).execute()

        _append_log(run_id, f'✓ Training complete in {duration}s. Model {version_label} is now active.')

        # Reload into memory
        global _active_model_min, _active_model_max, _active_version_id
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

    # Log inference
    supabase.table('inference_log').insert({
        'model_version_id': _active_version_id or '00000000-0000-0000-0000-000000000000',
        'image_id':         req.image_id,
        'input_features':   row,
        'predicted_min':    int(cost_min),
        'predicted_max':    int(cost_max),
        'confidence':       confidence,
    }).execute()

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

# ── GET /model/status ─────────────────────────────────────────────────────────
@app.get('/model/status')
def model_status():
    resp = supabase.table('model_versions') \
        .select('id, version_label, status, training_set_size, mae_min, mae_max, r2_min, r2_max, trained_at, is_active') \
        .order('trained_at', desc=True).limit(5).execute()

    return {
        'active_in_memory': _active_version_id,
        'versions':          resp.data,
    }