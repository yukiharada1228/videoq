# Public speech fixture

Google FLEURS Japanese test split, dataset ID 1828. License: CC BY 4.0
(https://creativecommons.org/licenses/by/4.0/).
Source: https://huggingface.co/datasets/google/fleurs (ja_jp), immutable
conversion revision 168de341b3db6859a9bac1c50a2ef5e3b47647e0.
The original recording is converted to mono MP3 for the worker API contract.
The adjacent JSON records the reference, duration and MP3 SHA-256. The original Parquet SHA-256 is
`e954b67e934b9a31d7a74a070a75225379660d50c8d1aacdb755852c57f23e6b`.
Credit: Google FLEURS dataset contributors; audio/text redistributed and
converted under CC BY 4.0. No private recording or user data is included.


## Prepare local validation fixtures

Run from the repository root with FFmpeg installed. Download the immutable source,
verify its checksum above, then convert it using the setup-only PyArrow dependency:

```sh
curl --fail --location --output /tmp/fleurs-ja-test.parquet \
  https://huggingface.co/datasets/google/fleurs/resolve/168de341b3db6859a9bac1c50a2ef5e3b47647e0/ja_jp/test/0000.parquet
shasum -a 256 /tmp/fleurs-ja-test.parquet
uv run --no-project --python 3.12 --with pyarrow==26.0.0 python \
  apps/worker/scripts/prepare_whisper_validation.py /tmp/fleurs-ja-test.parquet /tmp/whisper-fixtures
```

The generated manifest records the hashes of the converted audio. Encoding output
can vary with the FFmpeg version. To validate an operator-managed native server:

```sh
cd apps/worker
python scripts/whisper_runtime_validation.py --base-url http://127.0.0.1:8000 \
  --fixtures /tmp/whisper-fixtures --output /tmp/whisper-runtime-result.json
```
