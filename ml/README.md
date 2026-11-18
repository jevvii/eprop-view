# Training and evaluation pipeline

Everything here runs outside the Next.js build. Raw data, the isolated Python
environment, checkpoints and run logs live under `dataset/`, which is gitignored
and excluded from `eslint`/Vercel uploads. Only the exported ONNX artifact and
its manifest are committed, under `src/app/lib/ai/models/`.

## 1. Isolated environment (Python 3.11)

```bash
uv python install 3.11
uv venv --python 3.11 dataset/.venv
uv pip install --python dataset/.venv/bin/python torch==2.5.1 torchvision==0.20.1 \
  --index-url https://download.pytorch.org/whl/cu121
uv pip install --python dataset/.venv/bin/python numpy pillow pyyaml tqdm onnx onnxruntime matplotlib
```

Recorded at run time: torch 2.5.1+cu121, torchvision 0.20.1+cu121, CUDA 12.1,
cuDNN 90100, NVIDIA GeForce GTX 1650 (sm_75, 3.9 GB), Python 3.11.15, uv 0.12.6,
onnxruntime 1.32.0 (export parity) and onnxruntime-node 1.31.1 (serving).

## 2. Dataset

DamSegment v1, detection release. DOI `10.17632/z5z6gtt5t4.1`, CC BY 4.0,
contributors Gharehbaghi, Bennett, Lequesne, Zhao and Li (University of Kansas).

```bash
mkdir -p dataset/raw/damsegment-detection
cd dataset/raw/damsegment-detection
curl -L -o "Damage Detection.zip" \
  "https://data.mendeley.com/public-files/datasets/z5z6gtt5t4/files/9e49a029-483a-41a0-bcc4-0fde513fa1d3/file_downloaded"
sha256sum "Damage Detection.zip"
# 2423567183c584568efd45a2f4521c5d5f3f65106f2d2ff1311ed99b7adba1a9
unzip -q "Damage Detection.zip" -d extracted
```

`Damage Detection/Images` (1500 JPEG, 640x640) and `Damage Detection/Labels/Yolo`
(YOLO boxes). Class map confirmed visually: **0 = crack, 1 = spalling**.

## 3. Fingerprints and frozen split

```bash
node ml/hash_images.mjs "dataset/raw/damsegment-detection/extracted/Damage Detection/Images" dataset/image_hashes.json
dataset/.venv/bin/python -I ml/analyze_dataset.py \
  "dataset/raw/damsegment-detection/extracted/Damage Detection" --json dataset/dataset_inventory.json
dataset/.venv/bin/python -I ml/build_split.py \
  "dataset/raw/damsegment-detection/extracted/Damage Detection/Labels/Yolo" \
  dataset/image_hashes.json dataset/split.json --seed 20261118
```

Result: 1048 train / 225 val / 224 test, 3 quarantined, 0 cross-split pairs at
dHash Hamming <= 6 (minimum observed cross-split distance 12). Hashes are in
`dataset/split.json` and copied to `ml/splits/`.

## 4. Train

```bash
dataset/.venv/bin/python -I ml/train.py \
  --split dataset/split.json \
  --images "dataset/raw/damsegment-detection/extracted/Damage Detection/Images" \
  --out dataset/runs/<run> --epochs <n> --batch 8 --lr 0.005 --seed 20261118 \
  [--min-ratio 0.03 --max-ratio 0.95 --input 320]
```

Each epoch writes `ckpt_last.pth` plus `ckpt_epochNN.pth`; the best validation
F1 is copied to `ckpt_best.pth`. `config.json` and `log.jsonl` capture the
configuration, timings and losses. Resume with `--resume`.

## 5. Export and pin

```bash
dataset/.venv/bin/python -I ml/export_onnx.py \
  --checkpoint dataset/runs/<run>/ckpt_best.pth \
  --out src/app/lib/ai/models/crack-ssdlite320-damsegment-v1.onnx \
  --report dataset/runs/<run>/export_report.json
dataset/.venv/bin/python -I ml/make_manifest.py \
  --report dataset/runs/<run>/export_report.json \
  --onnx src/app/lib/ai/models/crack-ssdlite320-damsegment-v1.onnx \
  --config dataset/runs/<run>/config.json --ckpt dataset/runs/<run>/ckpt_best.pth \
  --out src/app/lib/ai/models/crack-ssdlite320-damsegment-v1.json \
  --version 1.0.0 --finished <UTC> --command "<exact train command>"
```

`make_manifest.py` refuses to write a manifest unless ONNX/PyTorch parity passed.

## 6. Evaluate both methods on identical images

```bash
npx tsx ml/evaluate.ts --split dataset/split.json \
  --images "dataset/raw/damsegment-detection/extracted/Damage Detection/Images" \
  --split-name val --out dataset/runs/<run>/eval_val.json
dataset/.venv/bin/python -I ml/overlays.py dataset/runs/<run>/eval_val.json \
  "dataset/raw/damsegment-detection/extracted/Damage Detection/Images" \
  dataset/runs/<run>/overlays <threshold>
```

Validation is used to pick the score threshold and checkpoint. The test split is
read once, after `verification/trained-detector-decision-rule.md` was frozen.
