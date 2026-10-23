FROM ghcr.io/astral-sh/uv:0.13.5@sha256:32a7bb39b496babbd997b0a39a4d66c126bdaf5661b302bf6f06abda8deca6ff AS uv
FROM python:3.12.15-slim-trixie@sha256:a0f57064cbdcd6285fa45f51237ab0b35ea8ebaed06a1f5973e89e19dfb86704 AS dependencies
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
# CUDA libraries come from locked wheels; NVIDIA drivers stay on the host.
ARG INFERENCE_DEVICE=cpu
RUN if [ "$INFERENCE_DEVICE" = cuda ]; then uv sync --locked --no-dev --extra cuda; \
    elif [ "$INFERENCE_DEVICE" = cpu ]; then uv sync --locked --no-dev; \
    else exit 1; fi
RUN python -m pip uninstall --yes pip && rm /usr/local/bin/uv
# Keep the interpreter and required native modules, with an accurate inventory
# of every extra Debian library. Shell/REPL tools are not part of the server.
RUN python - <<'PY'
import pathlib, shutil, sysconfig
root = pathlib.Path('/extra')
libraries = root / 'lib'
status = root / 'status.d'
licenses = root / 'licenses'
for directory in (libraries, status, licenses): directory.mkdir(parents=True)
packages = {
    'libbz2-1.0': 'libbz2.so.1.0', 'liblzma5': 'liblzma.so.5',
    'libffi8': 'libffi.so.8', 'libsqlite3-0': 'libsqlite3.so.0',
    'zlib1g': 'libz.so.1',
}
records = pathlib.Path('/var/lib/dpkg/status').read_text().split('\n\n')
libdir = pathlib.Path('/usr/lib') / sysconfig.get_config_var('MULTIARCH')
for package, soname in packages.items():
    shutil.copyfile(libdir / soname, libraries / soname)
    record = next(record for record in records if f'Package: {package}\n' in record)
    (status / package).write_text(record + '\n')
    shutil.copyfile(f'/usr/share/doc/{package}/copyright', licenses / f'{package}.copyright')
for pattern in ('readline*.so', '_uuid*.so', '_tkinter*.so'):
    for module in pathlib.Path('/usr/local/lib/python3.12/lib-dynload').glob(pattern): module.unlink()
PY

FROM gcr.io/distroless/cc-debian13:nonroot@sha256:83b9b50586253821cf63ffcec87d3d94265a093ad30da232039af962dd8f4edf
COPY --from=dependencies /usr/local /usr/local
COPY --from=dependencies /extra/lib/ /usr/local/lib/
COPY --from=dependencies /extra/status.d/ /var/lib/dpkg/status.d/
COPY --from=dependencies /extra/licenses/ /usr/share/doc/videoq-native/
COPY --from=dependencies /app/.venv /app/.venv
WORKDIR /app
COPY server.py provision.py ./
USER 10001:10001
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    HOME=/tmp NVIDIA_DRIVER_CAPABILITIES=compute,utility \
    HF_HUB_OFFLINE=1 HF_HUB_DISABLE_TELEMETRY=1 DO_NOT_TRACK=1 \
    LD_LIBRARY_PATH="/usr/local/lib:/app/.venv/lib/python3.12/site-packages/nvidia/cublas/lib:/app/.venv/lib/python3.12/site-packages/nvidia/cudnn/lib:/usr/local/nvidia/lib:/usr/local/nvidia/lib64"
ENTRYPOINT []
EXPOSE 8080
CMD ["python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080", "--no-access-log"]
